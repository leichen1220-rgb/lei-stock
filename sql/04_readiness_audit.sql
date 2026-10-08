-- Read-only Supabase readiness audit. Execute in SQL Editor AFTER migrations 02 and 03.
-- This file never writes transactions or modifies schema.
-- SQL Editor normally runs as postgres; auth.uid() is NULL there, so this
-- inspects structure and grants, not authenticated end-user behavior.
with required_columns(table_name,column_name,expected_type) as (
 values
 ('stock_transactions','id','uuid'),
 ('stock_transactions','owner_id','uuid'),
 ('stock_transactions','trade_date','date'),
 ('stock_transactions','ticker','text'),
 ('stock_transactions','transaction_type','text'),
 ('stock_transactions','quantity','numeric'),
 ('stock_transactions','price','numeric'),
 ('stock_transactions','trade_fees','numeric'),
 ('stock_transactions','dividend_gross','numeric'),
 ('stock_transactions','wire_fee','numeric'),
 ('stock_transactions','payment_date','date'),
 ('stock_transactions','payment_confirmed','boolean'),
 ('stock_transactions','note','text'),
 ('stock_transactions','sequence_no','integer'),
 ('stock_import_batches','id','uuid'),
 ('stock_import_batches','owner_id','uuid'),
 ('stock_import_batches','source_sha256','text'),
 ('stock_import_batches','payload_sha256','text'),
 ('stock_import_batches','row_count','integer'),
 ('stock_import_batches','state','text'),
 ('stock_import_stage_rows','batch_id','uuid'),
 ('stock_import_stage_rows','owner_id','uuid'),
 ('stock_import_stage_rows','excel_row','integer'),
 ('stock_import_stage_rows','transaction_data','jsonb')
), actual as (
 select c.table_name,c.column_name,c.data_type,c.udt_name
 from information_schema.columns c where c.table_schema='public'
)
select r.table_name,r.column_name,r.expected_type,
       coalesce(a.data_type,'MISSING') as actual_type,
       case when a.column_name is null then 'MISSING'
            when r.expected_type='integer' and a.data_type in ('integer','bigint','smallint') then 'OK'
            when r.expected_type='numeric' and a.data_type in ('numeric','double precision','real') then 'OK'
            when r.expected_type='text' and a.data_type in ('text','character varying') then 'OK'
            when r.expected_type=a.data_type then 'OK'
            else 'TYPE MISMATCH' end as audit_result
from required_columns r left join actual a using(table_name,column_name)
order by r.table_name,r.column_name;

select c.relname as table_name,c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_can_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_can_update,
       has_table_privilege('authenticated',c.oid,'DELETE') as authenticated_can_delete
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('stock_transactions','stock_import_batches','stock_import_stage_rows')
order by c.relname;

select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('stock_stage_import','stock_commit_import')
order by p.proname;

-- Review existing account data separately while logged in to the app.
-- Never delete rows or reset a real account to make an initial import pass.
