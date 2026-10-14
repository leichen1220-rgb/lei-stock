-- Install the private planning table. Existing transaction records are untouched.
begin;
create table if not exists public.stock_trade_plans (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 ticker text not null check(ticker ~ '^[0-9A-Z]{4,16}$'),
 stock_name text,
 direction text not null default '未指定' check(direction in ('未指定','買進','賣出')),
 quantity numeric check(quantity is null or quantity>0),
 target_price numeric not null check(target_price>0),
 note text,
 source_key text not null default gen_random_uuid()::text,
 created_at timestamptz not null default now(),
 unique(owner_id,source_key)
);
alter table public.stock_trade_plans enable row level security;
revoke all on public.stock_trade_plans from anon;
grant select,insert,update,delete on public.stock_trade_plans to authenticated;
drop policy if exists trade_plans_owner on public.stock_trade_plans;
create policy trade_plans_owner on public.stock_trade_plans for all to authenticated
 using(owner_id=auth.uid()) with check(owner_id=auth.uid());
notify pgrst, 'reload schema';
commit;
