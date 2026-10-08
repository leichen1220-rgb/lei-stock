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
