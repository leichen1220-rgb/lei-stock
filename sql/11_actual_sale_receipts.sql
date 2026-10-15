-- Add an optional actual sale settlement amount; existing rows remain null.
begin;
alter table public.stock_transactions add column if not exists sale_net_received numeric(20,4);
comment on column public.stock_transactions.sale_net_received is 'Actual net sale settlement, already including fees and tax; null means derive from price and recorded fees.';
do $guard$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.stock_transactions'::regclass and conname='stock_sale_net_received_shape') then
  alter table public.stock_transactions add constraint stock_sale_net_received_shape check (
   sale_net_received is null or
   (transaction_type::text='現股' and quantity<0 and sale_net_received > -1000000000000000 and sale_net_received < 1000000000000000)
  );
 end if;
end $guard$;
notify pgrst, 'reload schema';
commit;
