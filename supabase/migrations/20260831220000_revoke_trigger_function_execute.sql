-- Close residual EXECUTE on agent trigger functions.
-- Table triggers keep firing as the table owner; callers do not need EXECUTE.
-- touch_agent_runs_updated_at only assigns NEW.updated_at = now(); pg_catalog is safe.

REVOKE EXECUTE ON FUNCTION public.touch_agent_runs_updated_at()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prevent_agent_run_identity_change()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_unlock_plan_owner()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.touch_agent_runs_updated_at()
SET search_path = pg_catalog;
