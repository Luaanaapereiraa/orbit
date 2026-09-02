-- Unlock-task V1: daily quota, generation metadata, plan title/summary.
-- Quota day is the UTC calendar date: (timezone('utc', now()))::date.

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS generation_mode text,
  ADD COLUMN IF NOT EXISTS result_payload jsonb;

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_generation_mode_check;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_generation_mode_check
  CHECK (
    generation_mode IS NULL
    OR generation_mode IN ('agent', 'fallback')
  );

ALTER TABLE public.unlock_plans
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Plano',
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT 'Sugestao gerada.';

CREATE TABLE IF NOT EXISTS public.agent_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users (id),
  usage_date date NOT NULL,
  reserved_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT agent_daily_usage_reserved_count_check CHECK (reserved_count >= 0)
);

CREATE INDEX IF NOT EXISTS agent_daily_usage_user_date_idx
  ON public.agent_daily_usage (user_id, usage_date DESC);

ALTER TABLE public.agent_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_daily_usage FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_daily_usage FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_daily_usage FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_daily_usage TO authenticated;

DROP POLICY IF EXISTS agent_daily_usage_select_own ON public.agent_daily_usage;
CREATE POLICY agent_daily_usage_select_own
  ON public.agent_daily_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS agent_daily_usage_insert_own ON public.agent_daily_usage;
CREATE POLICY agent_daily_usage_insert_own
  ON public.agent_daily_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS agent_daily_usage_update_own ON public.agent_daily_usage;
CREATE POLICY agent_daily_usage_update_own
  ON public.agent_daily_usage
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_agent_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_touch_updated_at ON public.agent_runs;
CREATE TRIGGER agent_runs_touch_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_runs_updated_at();

CREATE OR REPLACE FUNCTION public.start_unlock_agent_run(
  p_user_id uuid,
  p_client_request_id uuid,
  p_blockage_reason text,
  p_prompt_version text,
  p_daily_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  existing public.agent_runs%ROWTYPE;
  created public.agent_runs%ROWTYPE;
  quota_date date := (timezone('utc', now()))::date;
  current_count integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.agent_daily_usage (user_id, usage_date, reserved_count)
  VALUES (p_user_id, quota_date, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  PERFORM 1
  FROM public.agent_daily_usage
  WHERE user_id = p_user_id AND usage_date = quota_date
  FOR UPDATE;

  SELECT *
  INTO existing
  FROM public.agent_runs
  WHERE user_id = p_user_id
    AND client_request_id = p_client_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status IN ('running', 'pending') THEN
      RETURN jsonb_build_object('kind', 'in_progress', 'run', to_jsonb(existing));
    END IF;
    IF existing.status = 'failed' THEN
      UPDATE public.agent_runs
      SET status = 'running',
          error_code = NULL
      WHERE id = existing.id
      RETURNING * INTO created;
      RETURN jsonb_build_object('kind', 'created', 'run', to_jsonb(created));
    END IF;
    RETURN jsonb_build_object('kind', 'replay', 'run', to_jsonb(existing));
  END IF;

  SELECT reserved_count
  INTO current_count
  FROM public.agent_daily_usage
  WHERE user_id = p_user_id AND usage_date = quota_date;

  IF current_count >= p_daily_limit THEN
    RETURN jsonb_build_object('kind', 'quota_exceeded');
  END IF;

  UPDATE public.agent_daily_usage
  SET reserved_count = reserved_count + 1
  WHERE user_id = p_user_id AND usage_date = quota_date;

  BEGIN
    INSERT INTO public.agent_runs (
      user_id,
      client_request_id,
      status,
      blockage_reason,
      prompt_version
    )
    VALUES (
      p_user_id,
      p_client_request_id,
      'running',
      p_blockage_reason,
      p_prompt_version
    )
    RETURNING * INTO created;
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.agent_daily_usage
      SET reserved_count = GREATEST(reserved_count - 1, 0)
      WHERE user_id = p_user_id AND usage_date = quota_date;

      SELECT *
      INTO existing
      FROM public.agent_runs
      WHERE user_id = p_user_id
        AND client_request_id = p_client_request_id;

      IF existing.status IN ('running', 'pending') THEN
        RETURN jsonb_build_object('kind', 'in_progress', 'run', to_jsonb(existing));
      END IF;
      RETURN jsonb_build_object('kind', 'replay', 'run', to_jsonb(existing));
  END;

  RETURN jsonb_build_object('kind', 'created', 'run', to_jsonb(created));
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_unlock_agent_run(
  p_run_id uuid,
  p_user_id uuid,
  p_status text,
  p_prompt_version text,
  p_result_payload jsonb,
  p_generation_mode text,
  p_model text,
  p_latency_ms integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_error_code text,
  p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  updated public.agent_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_plan IS NOT NULL THEN
    INSERT INTO public.unlock_plans (
      run_id,
      user_id,
      title,
      summary,
      next_action,
      steps,
      total_minutes,
      recommended_focus_minutes,
      energy,
      supportive_message
    )
    VALUES (
      p_run_id,
      p_user_id,
      p_plan ->> 'title',
      p_plan ->> 'summary',
      p_plan ->> 'nextAction',
      p_plan -> 'steps',
      (p_plan ->> 'totalMinutes')::integer,
      (p_plan ->> 'recommendedFocusMinutes')::integer,
      p_plan ->> 'energy',
      p_plan ->> 'supportiveMessage'
    )
    ON CONFLICT (run_id) DO NOTHING;
  END IF;

  UPDATE public.agent_runs
  SET status = p_status,
      generation_mode = p_generation_mode,
      model = p_model,
      latency_ms = p_latency_ms,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_total_tokens,
      error_code = p_error_code,
      prompt_version = p_prompt_version,
      result_payload = p_result_payload
  WHERE id = p_run_id
    AND user_id = p_user_id
  RETURNING * INTO updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION public.start_unlock_agent_run(uuid, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_unlock_agent_run(uuid, uuid, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.finish_unlock_agent_run(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_unlock_agent_run(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) TO authenticated;

COMMENT ON TABLE public.agent_daily_usage IS
  'UTC calendar-day reservations for the unlock-task agent. Incremented atomically inside start_unlock_agent_run.';
