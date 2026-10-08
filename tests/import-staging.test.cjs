const fs=require('node:fs');
const assert=require('node:assert/strict');
const sql=fs.readFileSync('sql/02_stock_import_staging.sql','utf8');
for(const token of [
 'begin;','commit;',
 'create table if not exists public.stock_import_batches',
 'create table if not exists public.stock_import_stage_rows',
 'alter table public.stock_import_batches enable row level security',
 'alter table public.stock_import_stage_rows enable row level security',
 'security definer','set search_path =',
 'auth.uid()','on conflict(owner_id,source_sha256,payload_sha256) do nothing',
 'if v_distinct <> v_count then raise exception',
 'if v_actual <> v_count then raise exception',
 'revoke all on function public.stock_stage_import',
 'grant execute on function public.stock_stage_import'
])assert.ok(sql.includes(token),'Missing import staging safety invariant: '+token);
assert.ok(!/insert\s+into\s+public\.stock_transactions/i.test(sql),'Staging migration must not touch production transactions');
assert.ok(!/delete\s+from\s+public\.stock_transactions/i.test(sql),'Staging migration must not delete production transactions');
console.log('PASS: SQL staging migration static safety checks (database execution not tested)');
