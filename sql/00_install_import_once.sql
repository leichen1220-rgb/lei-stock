-- One-time setup for Lei stock import. Review before running in Supabase SQL Editor.
-- Installs staging, guarded commit, and read-only readiness RPC.
-- Does NOT import, delete or update existing stock transactions.

-- BEGIN sql/02_stock_import_staging.sql
-- V0.13.1: isolated import staging. Run manually in Supabase SQL Editor.
-- Does NOT alter or write to stock_transactions. Staging is private per auth.uid().
begin;

create table if not exists public.stock_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null check (row_count > 0 and row_count <= 20000),
  state text not null default 'staged' check (state in ('staged','cancelled','committed')),
  created_at timestamptz not null default now(),
  unique(owner_id, source_sha256, payload_sha256)
);

create table if not exists public.stock_import_stage_rows (
  batch_id uuid not null references public.stock_import_batches(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  excel_row integer not null check (excel_row > 0),
  transaction_data jsonb not null check (jsonb_typeof(transaction_data) = 'object'),
  review_state text not null default 'pending' check (review_state in ('pending','confirmed')),
  primary key(batch_id,excel_row)
);

create index if not exists stock_import_batches_owner_idx on public.stock_import_batches(owner_id,created_at desc);
create index if not exists stock_import_stage_rows_owner_idx on public.stock_import_stage_rows(owner_id,batch_id);

alter table public.stock_import_batches enable row level security;
alter table public.stock_import_stage_rows enable row level security;

drop policy if exists stock_import_batches_select_own on public.stock_import_batches;
create policy stock_import_batches_select_own on public.stock_import_batches
 for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists stock_import_stage_rows_select_own on public.stock_import_stage_rows;
create policy stock_import_stage_rows_select_own on public.stock_import_stage_rows
 for select to authenticated using (owner_id = (select auth.uid()));
-- Direct client INSERT/UPDATE/DELETE intentionally forbidden. Only RPC can stage.
revoke all on public.stock_import_batches from anon, authenticated;
revoke all on public.stock_import_stage_rows from anon, authenticated;
grant select on public.stock_import_batches to authenticated;
grant select on public.stock_import_stage_rows to authenticated;

create or replace function public.stock_stage_import(
 p_source_name text, p_source_sha256 text, p_payload_sha256 text, p_rows jsonb
) returns jsonb language plpgsql security definer
 set search_path = '' as $$
declare
 v_owner uuid := auth.uid();
 v_batch uuid;
 v_count integer;
 v_distinct integer;
 v_actual integer;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_source_name,'')) not between 1 and 255
    or coalesce(p_source_sha256,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_payload_sha256,'') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_rows) is distinct from 'array'
 then raise exception 'Invalid import metadata'; end if;
 -- The original source hash is an idempotency label supplied by the client,
 -- NOT proof of the workbook contents. The payload hash is also advisory
 -- until canonical JSON hashing is implemented and independently verified.
 v_count := jsonb_array_length(p_rows);
 if v_count < 1 or v_count > 20000 then raise exception 'Invalid row count'; end if;
 if exists (
   select 1 from jsonb_array_elements(p_rows) as r(value)
   where jsonb_typeof(r.value) <> 'object'
      or jsonb_typeof(r.value->'excel_row') <> 'number'
      or (r.value->>'excel_row') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(r.value->'transaction') <> 'object'
      or nullif(r.value->'transaction'->>'ticker','') is null
      or (r.value->'transaction'->>'ticker') !~ '^[0-9A-Z]{2,12}$'
      or nullif(r.value->'transaction'->>'trade_date','') is null
      or (r.value->'transaction'->>'trade_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (r.value->'transaction' ? 'owner_id')
      or (r.value->'transaction' ? 'id')
      or (r.value->'transaction'->>'transaction_type') not in ('現股','現金股息','股票股利')
 ) then raise exception 'Invalid import row'; end if;
 select count(distinct (r.value->>'excel_row')::integer) into v_distinct
 from jsonb_array_elements(p_rows) as r(value);
 if v_distinct <> v_count then raise exception 'Duplicate Excel row numbers'; end if;

 -- Repeated identical requests return the same staging batch, never duplicate it.
 insert into public.stock_import_batches
 (owner_id,source_name,source_sha256,payload_sha256,row_count)
 values(v_owner,p_source_name,p_source_sha256,p_payload_sha256,v_count)
 on conflict(owner_id,source_sha256,payload_sha256) do nothing
 returning id into v_batch;
 if v_batch is null then
   select id into v_batch from public.stock_import_batches
   where owner_id=v_owner and source_sha256=p_source_sha256 and payload_sha256=p_payload_sha256;
   if not exists(select 1 from public.stock_import_batches
     where id=v_batch and state='staged' and row_count=v_count)
   then raise exception 'Existing import batch cannot be reused'; end if;
   select count(*) into v_actual from public.stock_import_stage_rows where batch_id=v_batch;
   if v_actual <> v_count then raise exception 'Existing batch row count mismatch'; end if;
   return jsonb_build_object('batch_id',v_batch,'rows',v_actual,'reused',true,'state','staged');
 end if;

 insert into public.stock_import_stage_rows(batch_id,owner_id,excel_row,transaction_data)
 select v_batch,v_owner,(r.value->>'excel_row')::integer,r.value->'transaction'
 from jsonb_array_elements(p_rows) as r(value);
 get diagnostics v_actual = row_count;
 if v_actual <> v_count then raise exception 'Stage row count mismatch'; end if;
 return jsonb_build_object('batch_id',v_batch,'rows',v_actual,'reused',false,'state','staged');
end $$;

revoke all on function public.stock_stage_import(text,text,text,jsonb) from public,anon;
grant execute on function public.stock_stage_import(text,text,text,jsonb) to authenticated;
commit;

-- END sql/02_stock_import_staging.sql

-- BEGIN sql/03_stock_import_commit.sql
-- V0.13.2. Apply AFTER 02_stock_import_staging.sql in Supabase SQL Editor.
-- This function does NOT run automatically. Production writes are disabled in UI.
-- Strict first-import-only policy: refuses if owner already has ANY transactions.
-- All operations run in one PostgreSQL transaction; errors roll back the whole call.
begin;
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
    (s.transaction_data->>'transaction_type'='現股' and (
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
  dividend_gross,wire_fee,payment_date,payment_confirmed,note,sequence_no)
 select v_owner,(s.transaction_data->>'trade_date')::date,
  s.transaction_data->>'ticker',s.transaction_data->>'transaction_type',
  (s.transaction_data->>'quantity')::numeric,(s.transaction_data->>'price')::numeric,
  (s.transaction_data->>'trade_fees')::numeric,
  (s.transaction_data->>'dividend_gross')::numeric,
  (s.transaction_data->>'wire_fee')::numeric,
  nullif(s.transaction_data->>'payment_date','')::date,false,
  nullif(s.transaction_data->>'note',''),
  s.excel_row
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
commit;

-- END sql/03_stock_import_commit.sql

-- BEGIN sql/05_import_readiness_rpc.sql
-- V0.13.6. Apply after migrations 02 and 03.
-- Authenticated read-only readiness probe. Does not stage or commit anything.
begin;
create or replace function public.stock_import_readiness()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_owner uuid := auth.uid();
 v_existing bigint;
 v_batches bigint;
begin
 if v_owner is null then raise exception 'Authentication required'; end if;
 select count(*) into v_existing from public.stock_transactions where owner_id=v_owner;
 select count(*) into v_batches from public.stock_import_batches where owner_id=v_owner and state='staged';
 return jsonb_build_object(
  'schema_version',1,
  'account_transactions',v_existing,
  'staged_batches',v_batches,
  'initial_import_allowed',v_existing=0,
  'writes_performed',false
 );
end $$;
revoke all on function public.stock_import_readiness() from public,anon;
grant execute on function public.stock_import_readiness() to authenticated;
commit;

-- END sql/05_import_readiness_rpc.sql