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

-- ============ Imprest (P.I.) register ============
-- One row per P.I. book. Payments live in `entries` (JSON list). Only ONE book can be open at a time.
create table if not exists public.pi_books (
  id            bigint generated always as identity primary key,
  fy            text        not null check (fy ~ '^[0-9]{4}-[0-9]{2}$'),       -- e.g. 2026-27
  pi_no         integer     not null check (pi_no > 0),
  status        text        not null default 'open' check (status in ('open', 'closed')),
  holder        text        not null,
  designation   text        not null default 'Office Assistant',
  imprest       numeric(12,2) not null default 5000,
  start_date    date        not null,
  end_date      date,
  opening       numeric(12,2) not null,
  received      numeric(12,2) not null,
  cheque_no     text,
  cheque_date   date,
  first_sanction integer,                                                   -- where sanction numbering starts (first book)
  entries       jsonb       not null default '[]'::jsonb,
  xlsx_name     text,
  xlsx_b64      text,
  closed_at     timestamptz,
  reopen_notes  jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (fy, pi_no)
);
create unique index if not exists pi_one_open_book on public.pi_books ((true)) where status = 'open';
alter table public.pi_books enable row level security;
revoke all on public.pi_books from anon, authenticated;

-- ============ Travel (conveyance) claims ============
create table if not exists public.travel_claims (
  id           bigint generated always as identity primary key,
  fy           text        not null check (fy ~ '^[0-9]{4}-[0-9]{2}$'),
  claim_no     integer     not null check (claim_no > 0),
  claim_date   date        not null,
  claimant     text        not null,
  designation  text        not null default 'Office Assistant',
  total        numeric(12,2) not null,
  status       text        not null default 'submitted' check (status in ('submitted', 'paid')),
  xlsx_name    text,
  xlsx_b64     text,
  paid_at      timestamptz,
  paid_note    text,
  created_at   timestamptz not null default now(),
  unique (fy, claim_no)
);
create table if not exists public.travel_trips (
  id          bigint generated always as identity primary key,
  trip_date   date        not null,
  from_place  text        not null default 'NIET',
  to_place    text        not null,
  purpose     text        not null,
  mode        text,
  amount      numeric(10,2) not null check (amount > 0),
  proof_name  text,
  proof_mime  text,
  claim_id    bigint references public.travel_claims(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists public.travel_proofs (
  trip_id     bigint primary key references public.travel_trips(id) on delete cascade,
  mime        text not null,
  b64         text not null,
  thumb_b64   text
);
alter table public.travel_proofs add column if not exists thumb_b64 text;
alter table public.travel_claims enable row level security;
alter table public.travel_trips  enable row level security;
alter table public.travel_proofs enable row level security;
revoke all on public.travel_claims, public.travel_trips, public.travel_proofs from anon, authenticated;

-- Make the API see new tables immediately
notify pgrst, 'reload schema';
