-- NIET Payroll records. Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.payroll_versions (
  id               bigint generated always as identity primary key,
  period           text        not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- e.g. 2026-09
  version          integer     not null,
  status           text        not null default 'draft' check (status in ('draft', 'final', 'replaced')),
  total            bigint      not null,
  inputs           jsonb       not null,   -- leave entered + cheque date/no, to rebuild the month exactly
  lines            jsonb       not null,   -- per-employee summary shown in the archive
  template_version text,
  xlsx_name        text        not null,
  docx_name        text        not null,
  xlsx_b64         text        not null,
  docx_b64         text        not null,
  created_at       timestamptz not null default now(),
  created_by       text,
  finalized_at     timestamptz,
  replaced_at      timestamptz,
  replaced_reason  text,
  unique (period, version)
);

-- The rule that matters: a month can have only ONE final version.
create unique index if not exists payroll_one_final_per_month
  on public.payroll_versions (period) where status = 'final';

create index if not exists payroll_versions_period on public.payroll_versions (period);

-- Lock the table: no access with the public (anon) key. The server uses the service_role key.
alter table public.payroll_versions enable row level security;
revoke all on public.payroll_versions from anon, authenticated;
