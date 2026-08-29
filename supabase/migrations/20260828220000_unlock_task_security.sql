-- Close quota/run/plan mutations behind SECURITY DEFINER RPCs.
-- Authenticated JWT may SELECT own runs and plans; it must not write tables.
-- Daily limit lives in public.agent_quota_settings (single row). Operators change it
-- with a privileged SQL session, for example:
--   UPDATE public.agent_quota_settings
--   SET daily_limit = 8, updated_at = now()
--   WHERE id = 1;
-- Never grant INSERT/UPDATE/DELETE on agent tables to authenticated or anon.

CREATE TABLE IF NOT EXISTS public.agent_quota_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  daily_limit integer NOT NULL CHECK (daily_limit BETWEEN 1 AND 100),
  lease_seconds integer NOT NULL CHECK (lease_seconds BETWEEN 5 AND 600),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.agent_quota_settings (id, daily_limit, lease_seconds)
VALUES (1, 5, 90)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.agent_quota_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_quota_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_quota_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_quota_settings FROM anon;
REVOKE ALL ON TABLE public.agent_quota_settings FROM authenticated;

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_status_check;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (
    status IN (
      'pending',
      'running',
      'fallback_pending',
      'completed',
      'needs_clarification',
      'rejected',
      'failed'
    )
  );

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_id_user_id_key;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_id_user_id_key UNIQUE (id, user_id);

CREATE OR REPLACE FUNCTION public.prevent_agent_run_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN
    RAISE EXCEPTION 'agent run identity is immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_identity_immutable ON public.agent_runs;
CREATE TRIGGER agent_runs_identity_immutable
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_agent_run_identity_change();

ALTER TABLE public.unlock_plans
  DROP CONSTRAINT IF EXISTS unlock_plans_run_id_fkey;

ALTER TABLE public.unlock_plans
  DROP CONSTRAINT IF EXISTS unlock_plans_run_user_fkey;

ALTER TABLE public.unlock_plans
  ADD CONSTRAINT unlock_plans_run_user_fkey
  FOREIGN KEY (run_id, user_id)
  REFERENCES public.agent_runs (id, user_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_unlock_plan_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  run_owner uuid;
BEGIN
  SELECT user_id
  INTO run_owner
  FROM public.agent_runs
  WHERE id = NEW.run_id;

  IF run_owner IS NULL THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  IF run_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'plan owner must match run owner' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unlock_plans_owner_guard ON public.unlock_plans;
CREATE TRIGGER unlock_plans_owner_guard
  BEFORE INSERT OR UPDATE ON public.unlock_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_unlock_plan_owner();

DROP POLICY IF EXISTS agent_runs_insert_own ON public.agent_runs;
DROP POLICY IF EXISTS agent_runs_update_own ON public.agent_runs;
DROP POLICY IF EXISTS unlock_plans_insert_own ON public.unlock_plans;
DROP POLICY IF EXISTS unlock_plans_update_own ON public.unlock_plans;
DROP POLICY IF EXISTS agent_daily_usage_insert_own ON public.agent_daily_usage;
DROP POLICY IF EXISTS agent_daily_usage_update_own ON public.agent_daily_usage;
DROP POLICY IF EXISTS agent_daily_usage_select_own ON public.agent_daily_usage;

REVOKE ALL ON TABLE public.agent_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_runs FROM anon;
REVOKE ALL ON TABLE public.agent_runs FROM authenticated;
GRANT SELECT ON TABLE public.agent_runs TO authenticated;

REVOKE ALL ON TABLE public.unlock_plans FROM PUBLIC;
REVOKE ALL ON TABLE public.unlock_plans FROM anon;
REVOKE ALL ON TABLE public.unlock_plans FROM authenticated;
GRANT SELECT ON TABLE public.unlock_plans TO authenticated;

REVOKE ALL ON TABLE public.agent_daily_usage FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_daily_usage FROM anon;
REVOKE ALL ON TABLE public.agent_daily_usage FROM authenticated;

DROP POLICY IF EXISTS agent_runs_select_own ON public.agent_runs;
CREATE POLICY agent_runs_select_own
  ON public.agent_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS unlock_plans_select_own ON public.unlock_plans;
CREATE POLICY unlock_plans_select_own
  ON public.unlock_plans
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.start_unlock_agent_run(uuid, uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.finish_unlock_agent_run(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.require_authenticated_uid()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  caller uuid;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN caller;
END;
$$;

REVOKE ALL ON FUNCTION public.require_authenticated_uid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_authenticated_uid() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_quota_daily_limit()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  limit_value integer;
BEGIN
  SELECT daily_limit
  INTO limit_value
  FROM public.agent_quota_settings
  WHERE id = 1;

  IF limit_value IS NULL THEN
    RAISE EXCEPTION 'quota settings missing' USING ERRCODE = 'P0002';
  END IF;

  RETURN limit_value;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_quota_daily_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_quota_daily_limit() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_run_lease_interval()
RETURNS interval
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  seconds integer;
BEGIN
  SELECT lease_seconds
  INTO seconds
  FROM public.agent_quota_settings
  WHERE id = 1;

  IF seconds IS NULL THEN
    seconds := 90;
  END IF;

  RETURN make_interval(secs => seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_run_lease_interval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_run_lease_interval() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.unlock_plan_row_to_json(p_plan public.unlock_plans)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'id', p_plan.id,
    'run_id', p_plan.run_id,
    'user_id', p_plan.user_id,
    'title', p_plan.title,
    'summary', p_plan.summary,
    'next_action', p_plan.next_action,
    'steps', p_plan.steps,
    'total_minutes', p_plan.total_minutes,
    'recommended_focus_minutes', p_plan.recommended_focus_minutes,
    'energy', p_plan.energy,
    'supportive_message', p_plan.supportive_message,
    'created_at', p_plan.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.insert_unlock_plan_locked(
  p_run public.agent_runs,
  p_plan jsonb
)
RETURNS public.unlock_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  inserted public.unlock_plans;
BEGIN
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
    p_run.id,
    p_run.user_id,
    p_plan ->> 'title',
    p_plan ->> 'summary',
    p_plan ->> 'nextAction',
    p_plan -> 'steps',
    (p_plan ->> 'totalMinutes')::integer,
    (p_plan ->> 'recommendedFocusMinutes')::integer,
    p_plan ->> 'energy',
    p_plan ->> 'supportiveMessage'
  )
  ON CONFLICT (run_id) DO NOTHING
  RETURNING * INTO inserted;

  IF inserted.id IS NULL THEN
    SELECT *
    INTO inserted
    FROM public.unlock_plans
    WHERE run_id = p_run.id;
  END IF;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_unlock_plan_locked(public.agent_runs, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_unlock_plan_locked(public.agent_runs, jsonb) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_unlock_agent_run(
  p_client_request_id uuid,
  p_blockage_reason text,
  p_prompt_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  caller uuid := public.require_authenticated_uid();
  existing public.agent_runs%ROWTYPE;
  created public.agent_runs%ROWTYPE;
  quota_date date := (timezone('utc', now()))::date;
  current_count integer;
  daily_limit integer := public.agent_quota_daily_limit();
  lease interval := public.agent_run_lease_interval();
BEGIN
  INSERT INTO public.agent_daily_usage (user_id, usage_date, reserved_count)
  VALUES (caller, quota_date, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  PERFORM 1
  FROM public.agent_daily_usage
  WHERE user_id = caller AND usage_date = quota_date
  FOR UPDATE;

  SELECT *
  INTO existing
  FROM public.agent_runs
  WHERE user_id = caller
    AND client_request_id = p_client_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.status IN ('running', 'pending', 'fallback_pending') THEN
      IF existing.lease_expires_at IS NOT NULL AND existing.lease_expires_at <= now() THEN
        UPDATE public.agent_runs
        SET status = 'running',
            error_code = NULL,
            lease_expires_at = now() + lease
        WHERE id = existing.id
        RETURNING * INTO created;
        RETURN jsonb_build_object('kind', 'created', 'run', to_jsonb(created));
      END IF;
      RETURN jsonb_build_object('kind', 'in_progress', 'run', to_jsonb(existing));
    END IF;

    IF existing.status = 'failed' THEN
      UPDATE public.agent_runs
      SET status = 'running',
          error_code = NULL,
          lease_expires_at = now() + lease
      WHERE id = existing.id
      RETURNING * INTO created;
      RETURN jsonb_build_object('kind', 'created', 'run', to_jsonb(created));
    END IF;

    RETURN jsonb_build_object('kind', 'replay', 'run', to_jsonb(existing));
  END IF;

  SELECT reserved_count
  INTO current_count
  FROM public.agent_daily_usage
  WHERE user_id = caller AND usage_date = quota_date;

  IF current_count >= daily_limit THEN
    RETURN jsonb_build_object('kind', 'quota_exceeded');
  END IF;

  UPDATE public.agent_daily_usage
  SET reserved_count = reserved_count + 1
  WHERE user_id = caller AND usage_date = quota_date;

  BEGIN
    INSERT INTO public.agent_runs (
      user_id,
      client_request_id,
      status,
      blockage_reason,
      prompt_version,
      lease_expires_at
    )
    VALUES (
      caller,
      p_client_request_id,
      'running',
      p_blockage_reason,
      p_prompt_version,
      now() + lease
    )
    RETURNING * INTO created;
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.agent_daily_usage
      SET reserved_count = GREATEST(reserved_count - 1, 0)
      WHERE user_id = caller AND usage_date = quota_date;

      SELECT *
      INTO existing
      FROM public.agent_runs
      WHERE user_id = caller
        AND client_request_id = p_client_request_id;

      IF existing.status IN ('running', 'pending', 'fallback_pending') THEN
        RETURN jsonb_build_object('kind', 'in_progress', 'run', to_jsonb(existing));
      END IF;
      RETURN jsonb_build_object('kind', 'replay', 'run', to_jsonb(existing));
  END;

  RETURN jsonb_build_object('kind', 'created', 'run', to_jsonb(created));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_unlock_agent_plan(
  p_run_id uuid,
  p_plan jsonb,
  p_generation_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  caller uuid := public.require_authenticated_uid();
  current_run public.agent_runs%ROWTYPE;
  stored public.unlock_plans%ROWTYPE;
BEGIN
  IF p_generation_mode NOT IN ('agent', 'fallback') THEN
    RAISE EXCEPTION 'invalid generation mode' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO current_run
  FROM public.agent_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND OR current_run.user_id IS DISTINCT FROM caller THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_generation_mode = 'agent' AND current_run.status IS DISTINCT FROM 'running' THEN
    RETURN jsonb_build_object('kind', 'rejected', 'reason', 'not_running');
  END IF;

  IF p_generation_mode = 'fallback' AND current_run.status IS DISTINCT FROM 'fallback_pending' THEN
    RETURN jsonb_build_object('kind', 'rejected', 'reason', 'not_fallback_pending');
  END IF;

  stored := public.insert_unlock_plan_locked(current_run, p_plan);

  UPDATE public.agent_runs
  SET lease_expires_at = now() + public.agent_run_lease_interval()
  WHERE id = current_run.id;

  RETURN jsonb_build_object(
    'kind', 'saved',
    'plan_id', stored.id,
    'run_id', current_run.id,
    'plan', public.unlock_plan_row_to_json(stored)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_unlock_fallback(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  caller uuid := public.require_authenticated_uid();
  current_run public.agent_runs%ROWTYPE;
  stored public.unlock_plans%ROWTYPE;
BEGIN
  SELECT *
  INTO current_run
  FROM public.agent_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND OR current_run.user_id IS DISTINCT FROM caller THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO stored
  FROM public.unlock_plans
  WHERE run_id = current_run.id;

  IF current_run.status IN ('completed', 'needs_clarification', 'rejected') THEN
    RETURN jsonb_build_object(
      'kind', 'already_terminal',
      'run', to_jsonb(current_run),
      'plan', CASE WHEN stored.id IS NULL THEN NULL ELSE public.unlock_plan_row_to_json(stored) END
    );
  END IF;

  IF stored.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'kind', 'agent_won',
      'run', to_jsonb(current_run),
      'plan', public.unlock_plan_row_to_json(stored)
    );
  END IF;

  IF current_run.status = 'failed' THEN
    RETURN jsonb_build_object('kind', 'incompatible', 'run', to_jsonb(current_run));
  END IF;

  IF current_run.status IN ('running', 'pending', 'fallback_pending') THEN
    UPDATE public.agent_runs
    SET status = 'fallback_pending',
        lease_expires_at = now() + public.agent_run_lease_interval()
    WHERE id = current_run.id
    RETURNING * INTO current_run;

    RETURN jsonb_build_object('kind', 'timeout_won', 'run', to_jsonb(current_run));
  END IF;

  RETURN jsonb_build_object('kind', 'incompatible', 'run', to_jsonb(current_run));
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_unlock_agent_run(
  p_run_id uuid,
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
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  caller uuid := public.require_authenticated_uid();
  current_run public.agent_runs%ROWTYPE;
  updated public.agent_runs%ROWTYPE;
  allowed boolean := false;
BEGIN
  SELECT *
  INTO current_run
  FROM public.agent_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND OR current_run.user_id IS DISTINCT FROM caller THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_run.status = p_status THEN
    RETURN to_jsonb(current_run);
  END IF;

  IF current_run.status = 'running' AND p_status IN (
    'completed', 'needs_clarification', 'rejected', 'failed', 'fallback_pending'
  ) THEN
    allowed := true;
  END IF;

  IF current_run.status = 'fallback_pending' AND p_status IN ('completed', 'failed') THEN
    allowed := true;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid run transition' USING ERRCODE = '22023';
  END IF;

  IF p_plan IS NOT NULL THEN
    IF current_run.status = 'running' AND p_generation_mode IS DISTINCT FROM 'agent'
       AND p_status = 'completed' THEN
      RAISE EXCEPTION 'invalid generation mode' USING ERRCODE = '22023';
    END IF;
    IF current_run.status = 'fallback_pending' AND p_generation_mode IS DISTINCT FROM 'fallback'
       AND p_status = 'completed' THEN
      RAISE EXCEPTION 'invalid generation mode' USING ERRCODE = '22023';
    END IF;
    PERFORM public.insert_unlock_plan_locked(current_run, p_plan);
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
      result_payload = p_result_payload,
      lease_expires_at = CASE
        WHEN p_status IN ('completed', 'needs_clarification', 'rejected', 'failed')
          THEN NULL
        ELSE now() + public.agent_run_lease_interval()
      END
  WHERE id = current_run.id
  RETURNING * INTO updated;

  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION public.start_unlock_agent_run(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_unlock_agent_run(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.save_unlock_agent_plan(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_unlock_agent_plan(uuid, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.begin_unlock_fallback(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_unlock_fallback(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.finish_unlock_agent_run(uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_unlock_agent_run(uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.unlock_plan_row_to_json(public.unlock_plans) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_agent_run_identity_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_unlock_plan_owner() FROM PUBLIC;

COMMENT ON TABLE public.agent_quota_settings IS
  'Singleton quota/lease config. Authenticated clients have no table grants. Change daily_limit with a privileged SQL session.';

COMMENT ON FUNCTION public.start_unlock_agent_run(uuid, text, text) IS
  'Creates or recovers an unlock-task run. Identity from auth.uid(). Daily limit from agent_quota_settings, never from the caller.';
