-- Add a separate private corporate-action ledger. No existing transactions are updated.
begin;
create table if not exists public.stock_corporate_actions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 ticker text not null check(ticker ~ '^[0-9A-Z]{4,10}$'),
 kind text not null check(kind in ('subscription','cash_reduction','loss_reduction','split','reverse_split')),
 status text not null default 'pending' check(status in ('pending','confirmed')),
 effective_date date not null,
 timing text not null default 'before' check(timing in ('before','after')),
 event_order integer not null default 0 check(event_order>=0),
 before_quantity numeric, after_quantity numeric, fractional_quantity numeric not null default 0,
 subscribed_quantity numeric, subscription_cost numeric,
 principal_cash numeric, fractional_cash numeric, fees numeric,
 cash_received boolean not null default false, payment_date date,
 ratio_old numeric check(ratio_old is null or ratio_old>0),
 ratio_new numeric check(ratio_new is null or ratio_new>0),
 note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status='pending' or coalesce((
   before_quantity>=0 and before_quantity is not null and after_quantity>=0 and after_quantity=trunc(after_quantity) and after_quantity is not null
   and fractional_quantity>=0 and fractional_quantity<1
   and (kind='subscription' and subscribed_quantity>0 and subscribed_quantity=trunc(subscribed_quantity) and subscription_cost>=0
        and subscribed_quantity is not null and subscription_cost is not null and after_quantity=before_quantity+subscribed_quantity
        and fractional_quantity=0 and principal_cash=0 and fractional_cash=0 and fees=0
     or kind<>'subscription' and before_quantity>0 and after_quantity+fractional_quantity>0
        and principal_cash>=0 and fractional_cash>=0 and fees>=0 and principal_cash is not null and fractional_cash is not null and fees is not null
        and (kind='cash_reduction' or principal_cash=0)
        and (fractional_quantity>0 or fractional_cash=0)
        and (kind='split' and after_quantity+fractional_quantity>before_quantity or kind<>'split' and after_quantity+fractional_quantity<before_quantity)
   )
 ),false))
);
create unique index if not exists stock_corporate_actions_event_key on public.stock_corporate_actions(owner_id,ticker,effective_date,timing,event_order);
alter table public.stock_corporate_actions enable row level security;
revoke all on public.stock_corporate_actions from anon;
grant select,insert,update,delete on public.stock_corporate_actions to authenticated;
drop policy if exists corporate_actions_owner on public.stock_corporate_actions;
create policy corporate_actions_owner on public.stock_corporate_actions for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
notify pgrst, 'reload schema';
commit;
