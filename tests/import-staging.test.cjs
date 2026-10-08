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
const commitSql=fs.readFileSync('sql/03_stock_import_commit.sql','utf8');
for(const token of [
 'begin;','commit;',
 'create or replace function public.stock_commit_import',
 'security definer set search_path',
 'where id=p_batch_id and owner_id=v_owner for update',
 "if v_batch.state='committed' then",
 'pg_advisory_xact_lock',
 'Account already has transactions',
 'Staging row count mismatch',
 'Inserted row count mismatch',
 'Batch state transition failed',
 'insert into public.stock_transactions',
 's.excel_row',
 'revoke all on function public.stock_commit_import',
 'grant execute on function public.stock_commit_import'
])assert.ok(commitSql.includes(token),'Missing commit safety invariant: '+token);
assert.ok(!/delete\\s+from\\s+public\\.stock_transactions/i.test(commitSql),'Commit must not delete existing transactions');
assert.ok(!/truncate\\s+public\\.stock_transactions/i.test(commitSql),'Commit must not truncate existing transactions');
assert.ok(commitSql.includes("then raise exception 'Invalid staged financial values'"),'Reject invalid financial values');
assert.ok(commitSql.includes("([.][0-9]+)?"),'Numeric regex should use literal dot class');
assert.ok(!commitSql.includes('\\\\.'),'Do not use double-backslash regex escapes in PostgreSQL');
assert.ok(sql.includes("(r.value->'transaction' ? 'owner_id')"),'Reject caller-injected owner IDs');
assert.ok(sql.includes("(r.value->'transaction' ? 'id')"),'Reject caller-injected row IDs');
assert.ok(sql.includes("'^[0-9A-Z]{2,12}"),'Require exact normalized stock codes');
assert.ok(sql.includes("'^[0-9]{4}-[0-9]{2}-[0-9]{2}"),'Require ISO date format');
console.log('PASS: SQL staging and commit static safety checks (database execution not tested)');
