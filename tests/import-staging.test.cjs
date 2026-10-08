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
assert.equal((sql.match(/\\bcommit;/g)||[]).length,1,'One commit only');
assert.equal((sql.match(/\\$\\$/g)||[]).length,2,'One function body only');
assert.ok(sql.includes('^[0-9A-Z]{2,12}'), 'Ticker regex present');
assert.ok(sql.includes('^[0-9]{4}-[0-9]{2}-[0-9]{2}'), 'Date regex present');
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
for(const token of [
 "t.sequence_no=s.excel_row",
 "t.trade_date is distinct from",
 "t.ticker is distinct from",
 "t.transaction_type is distinct from",
 "t.quantity is distinct from",
 "t.price is distinct from",
 "t.trade_fees is distinct from",
 "t.dividend_gross is distinct from",
 "t.wire_fee is distinct from",
 "t.payment_date is distinct from",
 "t.note is distinct from",
 "Inserted transaction content mismatch",
 "Duplicate imported source row"
])assert.ok(commitSql.includes(token),'Missing post-write row verification: '+token);
assert.ok(commitSql.indexOf('Inserted transaction content mismatch')<commitSql.indexOf("set state='committed'"),'Verify inserted content before marking batch committed');
const auditSql=fs.readFileSync('sql/04_readiness_audit.sql','utf8');
for(const token of ['information_schema.columns','relrowsecurity','has_table_privilege','has_function_privilege','stock_transactions','stock_import_batches','stock_import_stage_rows','stock_stage_import','stock_commit_import'])
 assert.ok(auditSql.includes(token),'Readiness audit missing: '+token);
assert.ok(!/\\b(?:insert\\s+into|update\\s+public\\.|delete\\s+from|truncate\\s+|drop\\s+table|alter\\s+table|create\\s+table)\\b/i.test(auditSql.replace(/--[^\\n]*/g,'')),'Readiness audit must be read-only');
const readinessSql=fs.readFileSync('sql/05_import_readiness_rpc.sql','utf8');
for(const token of ['stock_import_readiness','security invoker','auth.uid()','stock_transactions','stock_import_batches','initial_import_allowed','writes_performed', 'grant execute on function public.stock_import_readiness'])
 assert.ok(readinessSql.includes(token),'Missing readiness invariant: '+token);
assert.ok(!/\\b(?:insert\\s+into|update\\s+public\\.|delete\\s+from|truncate\\s+|drop\\s+table|alter\\s+table)\\b/i.test(readinessSql.replace(/--[^\\n]*/g,'')),'Readiness RPC must not modify tables');
console.log('PASS: SQL staging and commit static safety checks (database execution not tested)');
