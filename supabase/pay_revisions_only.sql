-- ============ Pay revisions ============
-- Revised pay for the pay-scale row (row 4): band pay and DA rule from a given month onward.
-- Kept here (private database), never in the public code.
create table if not exists public.pay_revisions (
  id              bigint generated always as identity primary key,
  row_no          integer     not null default 4 check (row_no between 4 and 12),
  effective_from  text        not null check (effective_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- e.g. 2026-07
  band_pay        numeric(12,2) not null check (band_pay > 0),
  da_pct          numeric(6,2)  not null default 100 check (da_pct >= 0 and da_pct <= 500),
  da_round        integer     not null default 0 check (da_round in (0, 1, 10, 100)),
  note            text,
  created_at      timestamptz not null default now()
);
create unique index if not exists pay_revisions_one_per_month on public.pay_revisions (row_no, effective_from);
alter table public.pay_revisions enable row level security;
revoke all on public.pay_revisions from anon, authenticated;
alter table public.pay_revisions add column if not exists arrear_amount numeric(12,2) check (arrear_amount is null or arrear_amount >= 0);
alter table public.pay_revisions add column if not exists arrear_period text check (arrear_period is null or arrear_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');   -- month whose salary carries the arrear

notify pgrst, 'reload schema';
