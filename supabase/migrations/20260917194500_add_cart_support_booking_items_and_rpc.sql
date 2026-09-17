-- Adds cart (multi-item-per-booking) support.
--
-- booking_items already has a many-to-one relationship to bookings, and
-- the entire read path (bookingService.ts's BOOKING_SELECT, rowToBooking,
-- the Booking.items[] type, every list/detail/tracking screen) already
-- renders a booking's items as an array. Only the CREATE path
-- (create_website_booking) has ever been single-item. This migration:
--   1. Adds booking_items.pricing_ref_id so a cart item's price
--      provenance is recorded per-item, the same way bookings.pricing_ref_id
--      already records it for a single-item booking — and backfills it
--      for existing rows from their parent booking.
--   2. Adds create_website_booking_cart, a new RPC (the existing
--      create_website_booking stays untouched for backward compatibility)
--      that accepts a jsonb array of items, requires they all resolve to
--      the same lab (a booking is fulfilled by one lab visit — matches
--      bookings.lab_id being singular), sums their prices into one
--      subtotal, and inserts one bookings row + N booking_items rows.

alter table public.booking_items
  add column if not exists pricing_ref_id text references public.lab_pricing(id);

update public.booking_items bi
set pricing_ref_id = b.pricing_ref_id
from public.bookings b
where bi.booking_id = b.id
  and bi.pricing_ref_id is null
  and b.pricing_ref_id is not null;

create or replace function public.create_website_booking_cart(
  p_items jsonb, -- [{pricing_ref_id, item_type, item_ref_id, item_name}, ...]
  p_service_area_id text,
  p_collection_type collection_type,
  p_date date,
  p_slot_id text default null,
  p_contact jsonb default '{}'::jsonb,
  p_address text default null,
  p_patient_id text default null,
  p_address_id text default null,
  p_notes text default null
)
returns bookings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_area public.service_areas;
  v_fee numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2);
  v_booking public.bookings;
  v_ref text;
  v_notes text;
  v_item jsonb;
  v_pricing public.lab_pricing;
  v_item_tp numeric;
  v_lab_id text;
  v_lab_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to book.' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from public.patients where id = p_patient_id and user_id = v_uid
  ) then
    raise exception 'That patient does not belong to you.' using errcode = '42501';
  end if;
  if p_address_id is not null and not exists (
    select 1 from public.addresses where id = p_address_id and user_id = v_uid
  ) then
    raise exception 'That address does not belong to you.' using errcode = '42501';
  end if;

  select * into v_area from public.service_areas where id = p_service_area_id and active;
  if not found then
    raise exception 'We do not currently serve that area.' using errcode = '22023';
  end if;

  if p_collection_type = 'home' and not v_area.home_collection_available then
    raise exception 'Home collection is not available in that area.' using errcode = '22023';
  end if;

  v_fee := case when p_collection_type = 'home' then v_area.collection_fee else 0 end;

  -- Pass 1: validate every item's price and require one lab per booking
  -- (the same lab visit collects every item in the cart).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_pricing from public.lab_pricing
      where id = (v_item->>'pricing_ref_id') and active;
    if not found then
      raise exception 'That price is no longer available.' using errcode = '22023';
    end if;

    if (v_item->>'item_type' = 'package' and v_pricing.package_id is distinct from (v_item->>'item_ref_id'))
       or (v_item->>'item_type' = 'test' and v_pricing.test_id is distinct from (v_item->>'item_ref_id')) then
      raise exception 'That price does not belong to the selected item.' using errcode = '22023';
    end if;

    if v_lab_id is null then
      v_lab_id := v_pricing.lab_id;
    elsif v_lab_id is distinct from v_pricing.lab_id then
      raise exception 'All items in one booking must be from the same lab.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + v_pricing.price;
  end loop;

  select name into v_lab_name from public.labs where id = v_lab_id;
  v_total := v_subtotal + v_fee;

  if p_slot_id is not null then
    update public.slots
       set booked_count = booked_count + 1
     where id = p_slot_id and active and booked_count < capacity;
    if not found then
      raise exception 'That slot is no longer available.' using errcode = '22023';
    end if;
  end if;

  v_notes := nullif(trim(p_notes), '');
  if v_notes is not null and length(v_notes) > 500 then
    v_notes := left(v_notes, 500);
  end if;

  v_ref := 'MH-' || lpad(nextval('public.bookings_reference_seq')::text, 9, '0');

  insert into public.bookings (
    reference, user_id, patient_id, address_id, contact, lab_id, lab_name, pricing_ref_id, service_area_id, slot_id,
    collection_type, pincode, address, date, notes,
    subtotal, collection_fee, discount, final_amount, amount_received,
    payment_method, payment_status, booking_status, source, created_by
  ) values (
    v_ref, v_uid, p_patient_id, p_address_id, coalesce(p_contact, '{}'::jsonb), v_lab_id, v_lab_name,
    null, v_area.id, p_slot_id,
    p_collection_type, v_area.pincode, p_address, p_date, v_notes,
    v_subtotal, v_fee, 0, v_total, 0,
    'cash_on_home', 'pending', 'confirmed', 'website', v_uid
  ) returning * into v_booking;

  -- Pass 2: re-derive each item's tp and insert its booking_items row.
  -- Re-selecting lab_pricing here (rather than caching pass 1's rows)
  -- keeps this loop simple; the set is the same handful of items either
  -- way and pass 1 already proved every id is valid.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_pricing from public.lab_pricing where id = (v_item->>'pricing_ref_id');

    if v_item->>'item_type' = 'package' then
      select tp into v_item_tp from public.packages where id = (v_item->>'item_ref_id');
    else
      select tp into v_item_tp from public.tests where id = (v_item->>'item_ref_id');
    end if;

    insert into public.booking_items (booking_id, item_type, ref_id, name, lab_id, price, tp, pricing_ref_id)
    values (
      v_booking.id, (v_item->>'item_type')::item_type, v_item->>'item_ref_id', v_item->>'item_name',
      v_pricing.lab_id, v_pricing.price, v_item_tp, v_pricing.id
    );
  end loop;

  insert into public.booking_status_history (booking_id, status, created_by)
  values (v_booking.id, 'confirmed', v_uid);

  insert into public.notifications (user_id, type, title, message, action_url, booking_id)
  values (
    v_uid, 'booking_confirmed', 'Booking Confirmed',
    'Your booking ' || v_ref || ' has been confirmed.',
    '/track/' || v_booking.id::text, v_booking.id
  );

  return v_booking;
end
$function$;

revoke execute on function public.create_website_booking_cart from public;
revoke execute on function public.create_website_booking_cart from anon;
grant execute on function public.create_website_booking_cart to authenticated;
