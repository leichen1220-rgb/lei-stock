-- 07: Match dividend verification to numeric(20,4) storage.
-- Replaces the earlier ALTER COLUMN approach blocked by a dependent view.
-- Leaves tables, views, policies, permissions and staging contents intact.
-- Run after 06. Does not submit an import.
begin;
do $fix$
declare
  definition text;
  old_check text := 'or t.dividend_gross is distinct from (s.transaction_data->>''dividend_gross'')::numeric';
  new_check text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='stock_transactions'
      and column_name='dividend_gross' and data_type='numeric'
      and numeric_precision=20 and numeric_scale=4
  ) then
    raise exception 'Unexpected dividend storage scale; no change applied';
  end if;
  new_check := old_check || '(20,4)';
  select pg_get_functiondef('public.stock_commit_import(uuid,integer)'::regprocedure)
    into definition;
  if strpos(definition,new_check)=0 then
    if strpos(definition,old_check)=0 then
      raise exception 'Expected verification not found; no change applied';
    end if;
    execute replace(definition,old_check,new_check);
  end if;
end
$fix$;
notify pgrst, 'reload schema';
commit;
