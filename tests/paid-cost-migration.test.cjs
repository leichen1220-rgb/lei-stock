const fs=require('node:fs');
const assert=require('node:assert/strict');
const sql=fs.readFileSync('sql/06_paid_cost_and_import_commit.sql','utf8');
const html=fs.readFileSync('index.html','utf8');
for(const token of [
 'begin;','commit;',
 'add column if not exists paid_cost numeric',
 'stock_transactions_paid_cost_nonnegative',
 'create or replace function public.stock_commit_import',
 'create or replace function public.stock_paid_cost_readiness',
 "or t.paid_cost is distinct from",
 "(s.transaction_data->>'paid_cost')::numeric",
 'revoke all on function public.stock_paid_cost_readiness',
 'grant execute on function public.stock_paid_cost_readiness'
])assert.ok(sql.includes(token),'Missing paid-cost migration invariant: '+token);
assert.equal((sql.match(/\\bcommit;/g)||[]).length,1,'One SQL transaction');
assert.equal((sql.match(/create or replace function public.stock_commit_import/g)||[]).length,1,'One commit RPC');
assert.equal((sql.match(/create or replace function public.stock_paid_cost_readiness/g)||[]).length,1,'One readiness RPC');
assert.equal((sql.match(/\\$\\$/g)||[]).length,2,'One PL/pgSQL function body');
assert.ok(!/\\b(?:delete\\s+from|truncate\\s+)public\\.stock_transactions/i.test(sql),'No destructive changes to existing transactions');
assert.ok(html.includes("client.rpc('stock_paid_cost_readiness')"),'Client checks migration');
assert.ok(html.includes('trade_fees:fees,paid_cost:paidCost'),'Client includes paid-cost payload');
console.log('PASS: paid-cost migration static invariants (Supabase execution not tested)');
