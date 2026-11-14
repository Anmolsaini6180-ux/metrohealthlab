-- =====================================================================
-- Partner Tracker  (SUPER_ADMIN only)
--
-- Moves the standalone tracker (partner / TP commission, Healthians
-- balance, Meta Ads spend) onto the real database. Nothing here
-- changes an existing table: every booking figure the tracker shows
-- still comes from public.bookings / booking_items; the tracker only
-- ADDS the partner-side facts a booking never carried.
--
--   tracker_partners      who the partners are + their commission %
--   booking_finance       per-booking partner/TP facts (1 row max)
--   partner_payouts       money actually paid to a partner
--   healthians_settlements money exchanged with Healthians
--   ad_spend_entries      Meta Ads spend (own table, see note below)
--
-- Access: every table and the read RPC are SUPER_ADMIN only, enforced
-- here by RLS / the function itself — not by the React menu.
-- Safe to re-run (idempotent).
--
-- NOTE on ad spend: Finance already adds campaigns.spend into its
-- expenses. Enter a given Meta spend in ONE place only (the Campaign
-- OR this tracker), otherwise Finance + tracker will each count it.
-- =====================================================================

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select coalesce(public.current_role_name() = 'SUPER_ADMIN', false); $$;

create or replace function public.tracker_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.tracker_partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  phone           text,
  commission_rate numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists tracker_partners_name_uq on public.tracker_partners (lower(trim(name)));

create table if not exists public.booking_finance (
  booking_id      uuid primary key references public.bookings(id) on delete cascade,
  partner_id      uuid references public.tracker_partners(id) on delete restrict,
  is_tp           boolean not null default false,
  -- TP amount paid to Healthians. NULL = fall back to the booking
  -- item's own snapshotted tp (booking_items.tp).
  tp_amount       numeric check (tp_amount is null or tp_amount >= 0),
  partner_payment numeric not null default 0 check (partner_payment >= 0),
  -- Own-booking lab cost override. NULL = fall back to booking_items.tp.
  lab_cost        numeric check (lab_cost is null or lab_cost >= 0),
  received_at     text check (received_at in ('healthians', 'self')),
  notes           text,
  updated_by      uuid references public.profiles(id) default auth.uid(),
  updated_at      timestamptz not null default now()
);
create index if not exists booking_finance_partner_idx on public.booking_finance (partner_id);

create table if not exists public.partner_payouts (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.tracker_partners(id) on delete restrict,
  paid_on     date not null default current_date,
  amount      numeric not null check (amount > 0),
  reference   text,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists partner_payouts_partner_idx on public.partner_payouts (partner_id);

create table if not exists public.healthians_settlements (
  id          uuid primary key default gen_random_uuid(),
  -- 'in'  = Healthians paid us;  'out' = we paid Healthians
  direction   text not null check (direction in ('in', 'out')),
  settled_on  date not null default current_date,
  amount      numeric not null check (amount > 0),
  reference   text,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.ad_spend_entries (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date not null default current_date,
  campaign    text,
  amount      numeric not null check (amount >= 0),
  leads       integer not null default 0 check (leads >= 0),
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists ad_spend_entries_date_idx on public.ad_spend_entries (spent_on);

-- ------------------------------------------------------------ triggers
drop trigger if exists tracker_partners_touch on public.tracker_partners;
create trigger tracker_partners_touch before update on public.tracker_partners
  for each row execute function public.tracker_touch_updated_at();
drop trigger if exists booking_finance_touch on public.booking_finance;
create trigger booking_finance_touch before update on public.booking_finance
  for each row execute function public.tracker_touch_updated_at();

-- Every write lands an audit_logs row, server-side, in the same
-- transaction — the client cannot omit or falsify it.
create or replace function public.tracker_audit()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_logs (action, actor_type, actor_id, target_type, target_id, metadata)
  values (
    'partner_tracker.' || lower(tg_op) || '.' || tg_table_name,
    'staff', auth.uid(), tg_table_name,
    coalesce(r->>'id', r->>'booking_id'),
    jsonb_build_object(
      'new', case when tg_op <> 'DELETE' then to_jsonb(new) end,
      'old', case when tg_op <> 'INSERT' then to_jsonb(old) end)
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tracker_partners','booking_finance','partner_payouts','healthians_settlements','ad_spend_entries'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tracker_audit()', t || '_audit', t);
  end loop;
end $$;

-- ----------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['tracker_partners','booking_finance','partner_payouts','healthians_settlements','ad_spend_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_super_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin())', t || '_super_admin', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ------------------------------------------------ read RPC (bookings)
-- One row per real booking, joined with its tracker facts. Customer
-- contact comes from the booking's own snapshot, falling back to the
-- patient/profile; city from the service area of the pincode.
create or replace function public.partner_tracker_bookings(p_start date default null, p_end date default null)
returns table (
  booking_id uuid, reference text, booking_date date, start_at timestamptz,
  booking_status text, source text,
  patient_name text, phone text, city text, address text, items text,
  billed numeric, amount_received numeric, items_tp numeric, items_tp_known boolean,
  partner_id uuid, is_tp boolean, tp_amount numeric, partner_payment numeric,
  lab_cost numeric, received_at text, notes text
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can view the partner tracker.' using errcode = '42501';
  end if;
  return query
  select b.id, b.reference, b.date, b.start_at,
         b.booking_status::text, b.source::text,
         coalesce(nullif(trim(b.contact->>'name'), ''), pt.name, pr.name),
         coalesce(nullif(trim(b.contact->>'phone'), ''), pr.phone),
         coalesce(sa.city, nullif(trim(b.contact->>'city'), '')),
         b.address,
         (select string_agg(i.name, ', ' order by i.name) from public.booking_items i where i.booking_id = b.id),
         b.final_amount, b.amount_received,
         (select sum(i.tp) from public.booking_items i where i.booking_id = b.id),
         coalesce((select bool_and(i.tp is not null) from public.booking_items i where i.booking_id = b.id), false),
         f.partner_id, coalesce(f.is_tp, false), f.tp_amount, coalesce(f.partner_payment, 0),
         f.lab_cost, f.received_at, f.notes
    from public.bookings b
    left join public.booking_finance f on f.booking_id = b.id
    left join public.patients pt on pt.id = b.patient_id
    left join public.profiles pr on pr.id = b.user_id
    left join public.service_areas sa on sa.pincode = b.pincode
   where (p_start is null or b.date >= p_start)
     and (p_end   is null or b.date <= p_end)
   order by b.date desc, b.created_at desc
   limit 5000;
end $$;

revoke all on function public.partner_tracker_bookings(date, date) from public, anon;
grant execute on function public.partner_tracker_bookings(date, date) to authenticated;

-- Healthians TP is selectable as a partner from day one (rate editable).
insert into public.tracker_partners (name, commission_rate)
select 'Healthians TP', 0
where not exists (select 1 from public.tracker_partners where lower(trim(name)) = 'healthians tp');
