-- DRAFT ONLY: review/apply in a staging Supabase project, not blindly in production.
-- This has not been executed against the group's actual database.
-- Non-destructive new prefixed tables; does not alter/delete the prototype KV data.
-- Device authentication, transactional RPCs/leases, admin roles and diary migration
-- remain explicit partner implementation tasks. Browser write privileges are absent.

create table if not exists public.allert_nodes (
  node_id text primary key,
  label text not null,
  location_label text,
  created_at timestamptz not null default now(),
  enabled boolean not null default true
);

create table if not exists public.allert_node_assignments (
  user_id uuid not null references auth.users(id),
  node_id text not null references public.allert_nodes(node_id),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  primary key (user_id,node_id,valid_from),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.allert_telemetry_blocks (
  id uuid primary key default gen_random_uuid(),
  node_id text not null references public.allert_nodes(node_id),
  block_start timestamptz not null,
  block_end timestamptz not null,
  received_at timestamptz not null default now(),
  pm2_5 double precision,
  pm10 double precision,
  temperature_c double precision,
  humidity_percent double precision,
  quality jsonb not null,
  source text not null check (source in ('live','replay','import')),
  stream_id text not null default 'live',
  packet_sha256 text not null,
  check (block_end=block_start+interval '5 minutes'),
  unique (node_id,stream_id,block_start)
);
create index if not exists allert_telemetry_time_idx
  on public.allert_telemetry_blocks(node_id,block_start);

create table if not exists public.allert_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  node_id text not null references public.allert_nodes(node_id),
  kind text not null check (kind in ('observed','forecast')),
  telemetry_id uuid references public.allert_telemetry_blocks(id),
  forecast_origin timestamptz,
  deduplication_key text not null unique,
  status text not null default 'pending' check (status in ('pending','leased','done','failed')),
  lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count>=0),
  created_at timestamptz not null default now(),
  last_error text
);

create table if not exists public.allert_environmental_indicators (
  telemetry_id uuid not null references public.allert_telemetry_blocks(id),
  node_id text not null references public.allert_nodes(node_id),
  population text not null check (population in ('adult','pediatric')),
  rule_id text not null,
  rule_sha256 text not null,
  indicator_0_1 double precision not null check (indicator_0_1>=0 and indicator_0_1<=1),
  score_0_100 double precision not null check (score_0_100>=0 and score_0_100<=100),
  tier text not null check (tier in ('low','moderate','high','very_high')),
  computed_at timestamptz not null default now(),
  primary key (telemetry_id,population,rule_id)
);

create table if not exists public.allert_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  node_id text not null references public.allert_nodes(node_id),
  model_id text not null,
  checkpoint_sha256 text not null,
  forecast_origin timestamptz not null,
  generated_at timestamptz not null,
  input_last_block_end timestamptz not null,
  input_sha256 text not null,
  mode text not null check (mode in ('live','historical_fixture')),
  status text not null,
  reason text,
  unique (node_id,model_id,forecast_origin,input_sha256)
);

create table if not exists public.allert_forecast_values (
  run_id uuid not null references public.allert_forecast_runs(id),
  pollutant text not null check (pollutant in ('pm2_5','pm10')),
  horizon_hours integer not null check (horizon_hours in (6,12,24)),
  target_block_start timestamptz not null,
  target_block_end timestamptz not null,
  value double precision not null check (value>=0),
  units text not null default 'ug/m3' check (units='ug/m3'),
  check (target_block_end=target_block_start+interval '5 minutes'),
  primary key (run_id,pollutant,horizon_hours)
);

create table if not exists public.allert_detector_state (
  node_id text primary key references public.allert_nodes(node_id),
  policy_sha256 text not null,
  version bigint not null default 0,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.allert_observed_pm_events (
  event_id text primary key,
  node_id text not null references public.allert_nodes(node_id),
  policy_sha256 text not null,
  onset timestamptz not null,
  recovered_at timestamptz,
  phase text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.allert_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.allert_observed_pm_events(event_id),
  user_id uuid not null references auth.users(id),
  deduplication_key text not null unique,
  kind text not null,
  channel text not null,
  payload jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  provider_accepted_at timestamptz,
  last_error text
);

-- RLS protects all new tables. Least-privilege grants come before exposing data.
-- Internal worker/server role retains access; no browser can write derived data.
do $$
declare name text;
begin
  foreach name in array array['allert_nodes','allert_node_assignments',
    'allert_telemetry_blocks','allert_processing_jobs','allert_environmental_indicators',
    'allert_forecast_runs','allert_forecast_values','allert_detector_state',
    'allert_observed_pm_events','allert_notification_outbox'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from anon, authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
end $$;

-- Intentional default deny for direct client table reads. The group's authorized
-- Edge API can serve bounded views after validating user/node assignment.
-- If direct/Realtime reads are desired, add reviewed SELECT grants/policies and
-- cross-user tests. Do not replace them with blanket "using (true)" health access.
-- The service role bypasses RLS: privileged handlers must enforce authorization.
-- Add ingestion/jobs atomic RPC, state/event/outbox versioned commit RPC, device
-- credential handling, push subscriptions, admin/audit and normalized diary tables
-- only after the actual project/instrument/access rules are reviewed.
