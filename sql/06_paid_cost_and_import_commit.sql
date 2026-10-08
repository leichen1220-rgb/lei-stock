-- 06: Run manually AFTER 02 and 03 in Supabase SQL Editor.
-- Additive paid_cost column and verified atomic import. Does not write existing transactions.
-- Run only after reviewing the migration. The UI stays read-only until reconciliation passes.
-- V0.13.2. Apply AFTER 02_stock_import_staging.sql in Supabase SQL Editor.
-- This function does NOT run automatically. Production writes are disabled in UI.
-- Strict first-import-only policy: refuses if owner already has ANY transactions.
-- All operations run in one PostgreSQL transaction; errors roll back the whole call.
begin;
alter table public.stock_transactions add column if not exists paid_cost numeric;
alter table public.stock_transactions drop constraint if exists stock_transactions_paid_cost_nonnegative;
alter table public.stock_transactions add constraint stock_transactions_paid_cost_nonnegative
 check (paid_cost is null or paid_cost >= 0);
create or replace function public.stock_commit_import(p_batch_id uuid, p_expected_rows integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_owner uuid := auth.uid();
 v_batch public.stock_import_batches%rowtype;
 v_count integer;
 v_written integer;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 if p_batch_id is null or p_expected_rows is null or p_expected_rows < 1 then
   raise exception 'Invalid batch or expected count'; end if;
 -- Lock the batch so concurrent/repeated calls cannot both commit it.
 select * into v_batch from public.stock_import_batches
 where id=p_batch_id and owner_id=v_owner for update;
 if not found then raise exception 'Batch not found'; end if;
 if v_batch.state='committed' then
   return jsonb_build_object('batch_id',p_batch_id,'state','committed',
    'rows',v_batch.row_count,'reused',true);
 end if;
 if v_batch.state <> 'staged' or v_batch.row_count <> p_expected_rows then
   raise exception 'Batch state or row count mismatch'; end if;
 select count(*) into v_count from public.stock_import_stage_rows
 where batch_id=p_batch_id and owner_id=v_owner;
 if v_count <> p_expected_rows then raise exception 'Staging row count mismatch'; end if;

 -- Prevent competing imports for the same account, even from other batches.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_owner::text)::bigint);
 if exists(select 1 from public.stock_transactions where owner_id=v_owner) then
   raise exception 'Account already has transactions; use reconciliation, not initial import';
 end if;
 if exists (
  select 1 from public.stock_import_stage_rows s
  where s.batch_id=p_batch_id and s.owner_id=v_owner and (
   nullif(s.transaction_data->>'ticker','') is null
   or (s.transaction_data->>'ticker') !~ '^[0-9A-Z]{2,12}$'
   or (s.transaction_data->>'trade_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or (s.transaction_data->>'transaction_type') not in ('現股','現金股息','股票股利')
   or (s.transaction_data->>'paid_cost' is not null and
       coalesce(s.transaction_data->>'paid_cost','') !~ '^[0-9]+([.][0-9]+)?$')
   or (s.transaction_data->>'transaction_type'='現股' and (
      coalesce(s.transaction_data->>'quantity','') !~ '^-?[0-9]+([.][0-9]+)?$'
      or coalesce(s.transaction_data->>'price','') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(s.transaction_data->>'trade_fees','') !~ '^[0-9]+([.][0-9]+)?$'))
   or (s.transaction_data->>'transaction_type'='股票股利' and
      coalesce(s.transaction_data->>'quantity','') !~ '^[0-9]+([.][0-9]+)?$')
   or (s.transaction_data->>'transaction_type'='現金股息' and (
      coalesce(s.transaction_data->>'dividend_gross','') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(s.transaction_data->>'wire_fee','0') !~ '^[0-9]+([.][0-9]+)?$'))
  )
 ) then raise exception 'Invalid staged transaction'; end if;

 -- Numeric shape checks above prevent cast errors; business rules are checked
 -- separately so zero/negative prices, quantities and fees cannot be committed.
 if exists (
  select 1 from public.stock_import_stage_rows s
  where s.batch_id=p_batch_id and s.owner_id=v_owner and (
    (s.transaction_data->>'paid_cost' is not null and
       (s.transaction_data->>'paid_cost')::numeric < 0)
    or (s.transaction_data->>'transaction_type'='現股' and (
       (s.transaction_data->>'quantity')::numeric=0
       or (s.transaction_data->>'price')::numeric<=0
       or (s.transaction_data->>'trade_fees')::numeric<0))
    or (s.transaction_data->>'transaction_type'='股票股利'
       and (s.transaction_data->>'quantity')::numeric<=0)
    or (s.transaction_data->>'transaction_type'='現金股息'
       and ((s.transaction_data->>'dividend_gross')::numeric<0
         or coalesce((s.transaction_data->>'wire_fee')::numeric,0)<0))
  )
 ) then raise exception 'Invalid staged financial values'; end if;

 -- Explicit whitelist: no JSON keys are blindly inserted.
 insert into public.stock_transactions
 (owner_id,trade_date,ticker,transaction_type,quantity,price,trade_fees,
  dividend_gross,wire_fee,payment_date,payment_confirmed,note,sequence_no,paid_cost)
 select v_owner,(s.transaction_data->>'trade_date')::date,
  s.transaction_data->>'ticker',s.transaction_data->>'transaction_type',
  (s.transaction_data->>'quantity')::numeric,(s.transaction_data->>'price')::numeric,
  (s.transaction_data->>'trade_fees')::numeric,
  (s.transaction_data->>'dividend_gross')::numeric,
  (s.transaction_data->>'wire_fee')::numeric,
  nullif(s.transaction_data->>'payment_date','')::date,false,
  nullif(s.transaction_data->>'note',''),
  s.excel_row,(s.transaction_data->>'paid_cost')::numeric
 from public.stock_import_stage_rows s
 where s.batch_id=p_batch_id and s.owner_id=v_owner
 order by s.excel_row;
 get diagnostics v_written = row_count;
 if v_written <> p_expected_rows then raise exception 'Inserted row count mismatch'; end if;
 -- Verify every staged source row against the actual inserted record.
 -- sequence_no carries the original Excel row for this initial import.
 -- This is deliberately NOT a DISTINCT-based comparison: two otherwise
 -- identical trades on separate Excel rows must remain two records.
 if exists (
   select 1 from public.stock_import_stage_rows s
   left join public.stock_transactions t
     on t.owner_id=v_owner and t.sequence_no=s.excel_row
   where s.batch_id=p_batch_id and s.owner_id=v_owner and (
     t.id is null
     or t.trade_date is distinct from (s.transaction_data->>'trade_date')::date
     or t.ticker is distinct from (s.transaction_data->>'ticker')
     or t.transaction_type is distinct from (s.transaction_data->>'transaction_type')
     or t.quantity is distinct from (s.transaction_data->>'quantity')::numeric
     or t.price is distinct from (s.transaction_data->>'price')::numeric
     or t.trade_fees is distinct from (s.transaction_data->>'trade_fees')::numeric
     or t.dividend_gross is distinct from (s.transaction_data->>'dividend_gross')::numeric
     or t.wire_fee is distinct from (s.transaction_data->>'wire_fee')::numeric
     or t.payment_date is distinct from nullif(s.transaction_data->>'payment_date','')::date
     or t.note is distinct from nullif(s.transaction_data->>'note','')
     or t.paid_cost is distinct from (s.transaction_data->>'paid_cost')::numeric
   )
 ) then raise exception 'Inserted transaction content mismatch'; end if;
 -- No extra rows: count already matches, but verify Excel-row keys are unique
 -- in the destination as well, not merely in the staging input.
 if exists (
   select 1 from public.stock_transactions t
   where t.owner_id=v_owner and t.sequence_no in (
     select excel_row from public.stock_import_stage_rows where batch_id=p_batch_id
   )
   group by t.sequence_no having count(*) <> 1
 ) then raise exception 'Duplicate imported source row'; end if;

 update public.stock_import_batches set state='committed'
 where id=p_batch_id and owner_id=v_owner and state='staged';
 if not found then raise exception 'Batch state transition failed'; end if;
 return jsonb_build_object('batch_id',p_batch_id,'state','committed',
  'rows',v_written,'reused',false);
end $$;
revoke all on function public.stock_commit_import(uuid,integer) from public,anon;
grant execute on function public.stock_commit_import(uuid,integer) to authenticated;
create or replace function public.stock_paid_cost_readiness()
returns jsonb language sql security invoker set search_path = ''
as $paid_ready$
 select pg_catalog.jsonb_build_object(
  'schema_version',1,
  'paid_cost_column',exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='stock_transactions'
      and column_name='paid_cost' and data_type='numeric'),
  'commit_function_updated',true)
$paid_ready$;
revoke all on function public.stock_paid_cost_readiness() from public,anon;
grant execute on function public.stock_paid_cost_readiness() to authenticated;
commit;
