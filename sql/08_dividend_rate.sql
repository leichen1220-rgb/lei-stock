-- Add optional private dividend details only. Existing RLS/grants are unchanged.
begin;
alter table public.stock_transactions
  add column if not exists dividend_per_share numeric,
  add column if not exists dividend_eligible_shares numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.stock_transactions'::regclass and conname='stock_dividend_rate_nonnegative') then
    alter table public.stock_transactions add constraint stock_dividend_rate_nonnegative
      check (dividend_per_share is null or dividend_per_share >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.stock_transactions'::regclass and conname='stock_dividend_shares_positive') then
    alter table public.stock_transactions add constraint stock_dividend_shares_positive
      check (dividend_eligible_shares is null or dividend_eligible_shares > 0);
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
