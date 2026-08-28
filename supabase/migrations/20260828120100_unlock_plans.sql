-- unlock_plans: one generated plan per agent run.
-- The plan text is stored because it is product functionality.

CREATE TABLE public.unlock_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs (id),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  next_action text NOT NULL,
  steps jsonb NOT NULL,
  total_minutes integer NOT NULL,
  recommended_focus_minutes integer NOT NULL,
  energy text NOT NULL,
  supportive_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unlock_plans_run_id_key UNIQUE (run_id),
  CONSTRAINT unlock_plans_steps_array_check CHECK (jsonb_typeof(steps) = 'array'),
  CONSTRAINT unlock_plans_steps_length_check CHECK (
    jsonb_array_length(steps) BETWEEN 2 AND 4
  ),
  CONSTRAINT unlock_plans_total_minutes_check CHECK (total_minutes > 0),
  CONSTRAINT unlock_plans_recommended_focus_minutes_check CHECK (
    recommended_focus_minutes BETWEEN 5 AND 60
  ),
  CONSTRAINT unlock_plans_energy_check CHECK (energy IN ('low', 'medium', 'high'))
);

CREATE INDEX unlock_plans_user_id_idx ON public.unlock_plans (user_id);

COMMENT ON TABLE public.unlock_plans IS
  'Generated unlock plan for a single agent run. One row per run_id.';

ALTER TABLE public.unlock_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unlock_plans FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.unlock_plans FROM PUBLIC;
REVOKE ALL ON TABLE public.unlock_plans FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.unlock_plans TO authenticated;

CREATE POLICY unlock_plans_select_own
  ON public.unlock_plans
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY unlock_plans_insert_own
  ON public.unlock_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND auth.uid() IS NOT NULL);

CREATE POLICY unlock_plans_update_own
  ON public.unlock_plans
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
