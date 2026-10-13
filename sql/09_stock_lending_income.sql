-- Allow lending income without changing existing private table RLS or grants.
begin;
do $$
declare c record; expression text; enum_type record;
begin
  select n.nspname,t.typname into enum_type from pg_attribute a
  join pg_type t on t.oid=a.atttypid join pg_namespace n on n.oid=t.typnamespace
  where a.attrelid='public.stock_transactions'::regclass and a.attname='transaction_type' and t.typtype='e';
  if found then execute format('alter type %I.%I add value if not exists %L',enum_type.nspname,enum_type.typname,'借券收入');end if;
  for c in select conname,pg_get_expr(conbin,conrelid) as expression from pg_constraint
    where conrelid='public.stock_transactions'::regclass and contype='c'
      and pg_get_expr(conbin,conrelid) like '%transaction_type%'
      and conname<>'stock_lending_income_shape'
  loop
    expression:=c.expression;
    if position('借券收入' in expression)>0 then continue;end if;
    execute format('alter table public.stock_transactions drop constraint %I',c.conname);
    execute format('alter table public.stock_transactions add constraint %I check ((%s) or transaction_type::text=%L)',c.conname,expression,'借券收入');
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.stock_transactions'::regclass and conname='stock_lending_income_shape') then
    alter table public.stock_transactions add constraint stock_lending_income_shape check (
      transaction_type::text<>'借券收入' or
      ((quantity is null or quantity=0) and price is null and (trade_fees is null or trade_fees=0)
       and dividend_gross is not null and dividend_gross>=0 and (wire_fee is null or wire_fee>=0))
    );
  end if;
end $$;
create or replace function public.stock_lending_ready() returns boolean
language sql stable security invoker set search_path=public as $$ select true $$;
revoke all on function public.stock_lending_ready() from public,anon;
grant execute on function public.stock_lending_ready() to authenticated;
notify pgrst, 'reload schema';
commit;
