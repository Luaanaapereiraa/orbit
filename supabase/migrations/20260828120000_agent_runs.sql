-- agent_runs: execution metadata only.
-- Do not store task titles, next-action text, or blockageDetails.

CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  client_request_id uuid NOT NULL,
  status text NOT NULL,
  blockage_reason text,
  prompt_version text,
  model text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_runs_user_client_request_id_key UNIQUE (user_id, client_request_id),
  CONSTRAINT agent_runs_status_check CHECK (
    status IN (
      'pending',
      'running',
      'completed',
      'needs_clarification',
      'rejected',
      'failed'
    )
  ),
  CONSTRAINT agent_runs_blockage_reason_check CHECK (
    blockage_reason IS NULL
    OR blockage_reason IN (
      'dont_know_where_to_start',
      'procrastinating',
      'low_energy',
      'overwhelmed',
      'other'
    )
  ),
  CONSTRAINT agent_runs_latency_ms_check CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT agent_runs_input_tokens_check CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CONSTRAINT agent_runs_output_tokens_check CHECK (output_tokens IS NULL OR output_tokens >= 0),
  CONSTRAINT agent_runs_total_tokens_check CHECK (total_tokens IS NULL OR total_tokens >= 0)
);

CREATE INDEX agent_runs_user_created_at_idx
  ON public.agent_runs (user_id, created_at DESC);

COMMENT ON TABLE public.agent_runs IS
  'Agent execution metadata. Task title and blockage text must not be stored.';

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_runs FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_runs TO authenticated;

CREATE POLICY agent_runs_select_own
  ON public.agent_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY agent_runs_insert_own
  ON public.agent_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND auth.uid() IS NOT NULL);

CREATE POLICY agent_runs_update_own
  ON public.agent_runs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
