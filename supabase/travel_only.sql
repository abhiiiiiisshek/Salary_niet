-- Run this once in Supabase > SQL Editor to add the Travel tables.
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
