-- Supplier bills split their GST by state even before the shop's GSTIN is in
-- Settings: the shop's state code is its GSTIN's first two digits, else the
-- code of its state in Settings, else Maharashtra (27). Same state as the
-- supplier: CGST + SGST; another: IGST. The amounts don't change, only the
-- split. Codes as on src/lib/invoice.ts (STATE_CODES).
--
-- Re-run safe. Needs 0061 (its admin_post_receipt).

create or replace function public.gst_state_code(p_state text)
returns text
language sql
immutable
set search_path = ''
as $$
  select c.code from (values
    ('jammu and kashmir', '01'),
    ('himachal pradesh', '02'),
    ('punjab', '03'),
    ('chandigarh', '04'),
    ('uttarakhand', '05'),
    ('haryana', '06'),
    ('delhi', '07'),
    ('rajasthan', '08'),
    ('uttar pradesh', '09'),
    ('bihar', '10'),
    ('sikkim', '11'),
    ('arunachal pradesh', '12'),
    ('nagaland', '13'),
    ('manipur', '14'),
    ('mizoram', '15'),
    ('tripura', '16'),
    ('meghalaya', '17'),
    ('assam', '18'),
    ('west bengal', '19'),
    ('jharkhand', '20'),
    ('odisha', '21'),
    ('chhattisgarh', '22'),
    ('madhya pradesh', '23'),
    ('gujarat', '24'),
    ('dadra and nagar haveli and daman and diu', '26'),
    ('maharashtra', '27'),
    ('karnataka', '29'),
    ('goa', '30'),
    ('lakshadweep', '31'),
    ('kerala', '32'),
    ('tamil nadu', '33'),
    ('puducherry', '34'),
    ('andaman and nicobar islands', '35'),
    ('telangana', '36'),
    ('andhra pradesh', '37'),
    ('ladakh', '38')) as c(name, code)
   where c.name = lower(regexp_replace(replace(btrim(coalesce(p_state, '')), '&', 'and'), '\s+', ' ', 'g'))
$$;

create or replace function public.admin_post_receipt(
  p_kind text, p_supplier uuid, p_bill_no text, p_bill_date date, p_notes text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  bno text := btrim(coalesce(p_bill_no, ''));
  sup text := '';
  shop text := '';
  inter boolean;
  known boolean;
  claim boolean;
  e jsonb;
  v record;
  qty int;
  price numeric;
  rate numeric;
  g numeric;
  c numeric;
  s numeric;
  i numeric;
  stock_now int;
  old_price numeric;
  new_price numeric;
  pk int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('bill', 'opening', 'quick') then
    raise exception 'Unknown kind of stock in.' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one line.' using errcode = '22023';
  end if;
  if p_kind = 'bill' then
    if p_supplier is null then
      raise exception 'A bill needs a supplier.' using errcode = '22023';
    end if;
    if bno = '' then
      raise exception 'A bill needs its bill number.' using errcode = '22023';
    end if;
    select s2.gstin into sup from public.suppliers s2 where s2.id = p_supplier;
    if not found then
      raise exception 'Supplier not found.' using errcode = 'P0002';
    end if;
  else
    p_supplier := null;
    if p_kind = 'opening' then
      bno := '';
    end if;
  end if;
  -- input credit needs a bill from a GST-registered supplier
  claim := p_kind = 'bill' and btrim(coalesce(sup, '')) <> '';
  -- the shop's state code: its GSTIN's first two digits; no GSTIN yet: its
  -- state in Settings (Maharashtra, 27) (0064)
  select coalesce(nullif(left(btrim(coalesce(st.gstin, '')), 2), ''), public.gst_state_code(st.store_state), '27') into shop
    from public.store_settings st where st.id = 1;
  known := length(coalesce(sup, '')) >= 2 and length(shop) >= 2;
  inter := known and left(sup, 2) <> left(shop, 2);

  if p_kind = 'bill' then
    select r.id into rid from public.stock_receipts r
     where r.kind = 'bill' and r.status = 'posted' and r.supplier_id = p_supplier and lower(r.bill_no) = lower(bno)
     for update;
  end if;
  if rid is null then
    insert into public.stock_receipts (kind, supplier_id, bill_no, bill_date, notes, actor_id)
    values (p_kind, p_supplier, bno, coalesce(p_bill_date, current_date), btrim(coalesce(p_notes, '')), (select auth.uid()))
    returning id into rid;
  end if;

  for e in select x from jsonb_array_elements(p_lines) x loop
    qty := (e ->> 'qty')::int;
    -- to the paisa before GST and the average are worked out
    price := round((e ->> 'unit_price')::numeric, 2);
    if qty is null or qty <= 0 then
      raise exception 'Each line needs a quantity above zero.' using errcode = '22023';
    end if;
    if price is null or price < 0 then
      raise exception 'Each line needs a price.' using errcode = '22023';
    end if;
    select pv.id, pv.product_id, pv.stock_qty, pv.track_stock, pv.unit_variant_id, pv.pack_of into v
      from public.product_variants pv where pv.id = (e ->> 'variant_id')::uuid for update;
    if v.id is null then
      raise exception 'An option on this bill no longer exists.' using errcode = 'P0002';
    end if;
    rate := coalesce((e ->> 'gst_rate')::numeric, public.product_gst(v.product_id), 0);
    if rate < 0 or rate > 100 then
      raise exception 'GST must be between 0%% and 100%%.' using errcode = '22023';
    end if;
    g := round(qty * price * rate / 100, 2);
    if not known then
      c := 0; s := 0; i := 0;
    elsif inter then
      c := 0; s := 0; i := g;
    else
      c := round(g / 2, 2); s := g - c; i := 0;
    end if;
    insert into public.stock_receipt_lines (receipt_id, variant_id, qty, unit_price, gst_rate, gst, cgst, sgst, igst, claimable, created_at)
    values (rid, v.id, qty, price, rate, g, c, s, i, claim, clock_timestamp());

    -- a box (0061): the line stays as billed, boxes at the box price with its
    -- GST to the paisa; the stock and the average move on the loose pieces
    if v.unit_variant_id is not null then
      pk := v.pack_of;
      select pv.id, pv.product_id, pv.stock_qty, pv.track_stock, pv.unit_variant_id, pv.pack_of into v
        from public.product_variants pv where pv.id = v.unit_variant_id for update;
      qty := qty * pk;
      price := price / pk;
    end if;

    -- the average moves with the stock actually on the shelf, before this lot is added
    -- an option not counting stock yet holds nothing: its stock_qty is meaningless
    stock_now := case when v.track_stock then greatest(v.stock_qty, 0) else 0 end;
    select vc.purchase into old_price from public.variant_costs vc where vc.variant_id = v.id;
    new_price := case when old_price is null then price
                      else round((stock_now * old_price + qty * price) / (stock_now + qty), 2) end;
    insert into public.variant_costs (variant_id, cost, purchase)
    values (v.id, 0, new_price)
    on conflict (variant_id) do update set purchase = excluded.purchase;

    perform set_config('babajee.stock_reason', 'stock_in', true);
    perform set_config('babajee.receipt_id', rid::text, true);
    perform set_config('babajee.stock_note', '', true);
    if v.track_stock then
      update public.product_variants set stock_qty = stock_qty + qty where id = v.id;
    else
      -- first stock in: the count starts at exactly this lot, and the movement
      -- reads +qty, qty after = qty (a start from 0), not the old meaningless number
      update public.product_variants set stock_qty = qty, track_stock = true where id = v.id;
      if v.stock_qty = qty then
        insert into public.stock_movements (variant_id, delta, qty_after, reason, receipt_id, note, actor_id, created_at)
        values (v.id, qty, qty, 'stock_in', rid, '', (select auth.uid()), clock_timestamp());
      else
        update public.stock_movements set delta = qty
         where id = (select sm.id from public.stock_movements sm
                      where sm.variant_id = v.id and sm.receipt_id = rid and sm.reason = 'stock_in'
                      order by sm.created_at desc, sm.id desc limit 1);
      end if;
    end if;
    perform set_config('babajee.stock_reason', '', true);
    perform set_config('babajee.receipt_id', '', true);
  end loop;
  return rid;
end;
$$;
