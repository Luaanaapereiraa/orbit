-- Close agent RPCs to PostgREST user JWTs.
-- Identity: API validates the user JWT (JWKS) and passes p_user_id.
-- Authority: only the hosted secret role (service_role) may EXECUTE these
-- functions. anon / authenticated / PUBLIC must not.
--
-- Do not invent a custom database role or change reserved-role membership.
-- Hosted migrations may lack that privilege; a failed statement would roll back
-- the revoke of authenticated EXECUTE. The API secret already authenticates as
-- service_role.
--
-- Hosted Supabase authenticates the dashboard "secret" as the built-in role that
-- bypasses RLS. Queries still filter by p_user_id. Do not put that secret in the
-- browser or in NEXT_PUBLIC_* variables.
--
-- Static tests read this file. Definitive proof is the live Postgres catalog
-- after applying the full migration sequence.

DROP FUNCTION IF EXISTS public.start_unlock_agent_run(uuid, text, text);
DROP FUNCTION IF EXISTS public.save_unlock_agent_plan(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.begin_unlock_fallback(uuid);
DROP FUNCTION IF EXISTS public.finish_unlock_agent_run(uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.require_agent_api_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid user id' USING ERRCODE = '22P02';
  END IF;

  jwt_role := coalesce(auth.role(), '');
  IF jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.require_agent_api_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_agent_api_user(uuid) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_authenticated_uid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_authenticated_uid() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_unlock_agent_run(
  p_user_id uuid,
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
  caller uuid := public.require_agent_api_user(p_user_id);
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
    IF existing.status IN ('running', 'pending') THEN
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

    IF existing.status = 'fallback_pending' THEN
      IF existing.lease_expires_at IS NOT NULL AND existing.lease_expires_at <= now() THEN
        UPDATE public.agent_runs
        SET status = 'fallback_pending',
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
  p_user_id uuid,
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
  caller uuid := public.require_agent_api_user(p_user_id);
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
    AND user_id = caller
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
  SET lease_expires_at = now() + public.agent_run_lease_interval(),
      generation_mode = p_generation_mode
  WHERE id = current_run.id
    AND user_id = caller;

  RETURN jsonb_build_object(
    'kind', 'saved',
    'plan_id', stored.id,
    'run_id', current_run.id,
    'plan', public.unlock_plan_row_to_json(stored)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_unlock_fallback(
  p_user_id uuid,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  caller uuid := public.require_agent_api_user(p_user_id);
  current_run public.agent_runs%ROWTYPE;
  stored public.unlock_plans%ROWTYPE;
  persisted_mode text;
BEGIN
  SELECT *
  INTO current_run
  FROM public.agent_runs
  WHERE id = p_run_id
    AND user_id = caller
  FOR UPDATE;

  IF NOT FOUND OR current_run.user_id IS DISTINCT FROM caller THEN
    RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO stored
  FROM public.unlock_plans
  WHERE run_id = current_run.id
    AND user_id = caller;

  IF current_run.status IN ('completed', 'needs_clarification', 'rejected') THEN
    RETURN jsonb_build_object(
      'kind', 'already_terminal',
      'run', to_jsonb(current_run),
      'plan', CASE WHEN stored.id IS NULL THEN NULL ELSE public.unlock_plan_row_to_json(stored) END,
      'generation_mode', current_run.generation_mode
    );
  END IF;

  IF stored.id IS NOT NULL THEN
    persisted_mode := coalesce(
      current_run.generation_mode,
      CASE
        WHEN current_run.status = 'fallback_pending' THEN 'fallback'
        ELSE 'agent'
      END
    );
    RETURN jsonb_build_object(
      'kind', 'persisted_plan_won',
      'generation_mode', persisted_mode,
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
      AND user_id = caller
    RETURNING * INTO current_run;

    RETURN jsonb_build_object('kind', 'fallback_claimed', 'run', to_jsonb(current_run));
  END IF;

  RETURN jsonb_build_object('kind', 'incompatible', 'run', to_jsonb(current_run));
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_unlock_agent_run(
  p_user_id uuid,
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
  caller uuid := public.require_agent_api_user(p_user_id);
  current_run public.agent_runs%ROWTYPE;
  updated public.agent_runs%ROWTYPE;
  allowed boolean := false;
BEGIN
  SELECT *
  INTO current_run
  FROM public.agent_runs
  WHERE id = p_run_id
    AND user_id = caller
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

  IF current_run.status = 'fallback_pending' AND p_status IN (
    'completed', 'failed', 'rejected'
  ) THEN
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
    AND user_id = caller
  RETURNING * INTO updated;

  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION public.start_unlock_agent_run(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_unlock_agent_run(uuid, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_unlock_agent_run(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.save_unlock_agent_plan(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_unlock_agent_plan(uuid, uuid, jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unlock_agent_plan(uuid, uuid, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.begin_unlock_fallback(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_unlock_fallback(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_unlock_fallback(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.finish_unlock_agent_run(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_unlock_agent_run(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_unlock_agent_run(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.insert_unlock_plan_locked(public.agent_runs, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_unlock_plan_locked(public.agent_runs, jsonb) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unlock_plan_row_to_json(public.unlock_plans) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_plan_row_to_json(public.unlock_plans) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_quota_daily_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_quota_daily_limit() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_run_lease_interval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_run_lease_interval() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_authenticated_uid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_authenticated_uid() FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_agent_api_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_agent_api_user(uuid) FROM anon, authenticated, service_role;

COMMENT ON FUNCTION public.start_unlock_agent_run(uuid, uuid, text, text) IS
  'Internal API RPC. p_user_id is the JWKS-authenticated user. Not executable by anon or authenticated.';
