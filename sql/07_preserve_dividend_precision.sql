-- Run once in Supabase SQL Editor after migration 06.
-- The reviewed workbook contains a dividend value of 34.638999999999996.
-- numeric(20,4) stores 34.6390, causing the exact import verification to fail.
-- Preserve source values with unconstrained numeric; keep exact verification,
-- permissions, policies, constraints and staging contents unchanged.
-- This migration does not submit the staged import.
begin;
alter table public.stock_transactions
  alter column dividend_gross type numeric
  using dividend_gross::numeric;
notify pgrst, 'reload schema';
commit;
