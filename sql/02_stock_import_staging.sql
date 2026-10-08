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
      or (r.value->'transaction'->>'ticker') !~ '^[0-9A-Z]{2,12}
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

-- IMPORTANT: this function stages data ONLY; a separate verified commit function
-- is required to move rows to stock_transactions atomically.

      or nullif(r.value->'transaction'->>'trade_date','') is null
      or (r.value->'transaction'->>'trade_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}
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

-- IMPORTANT: this function stages data ONLY; a separate verified commit function
-- is required to move rows to stock_transactions atomically.

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

-- IMPORTANT: this function stages data ONLY; a separate verified commit function
-- is required to move rows to stock_transactions atomically.
