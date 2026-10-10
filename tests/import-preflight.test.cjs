// Read-only Excel duplicate-key preflight regression tests.
// Run: node tests/import-preflight.test.cjs
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(html,/sheet_to_json\(book\.Sheets\[sheetName\],\{header:1,defval:'',raw:true\}\)/,'Transaction worksheet must use raw Excel dates');
assert.match(html,/missingCodeRows=executableRows\.filter/,'Transactions with missing tickers must be audited');
assert.match(html,/const blockers=\[\];/,'Import safety gate must exist');
assert.match(html,/if\(missingCodeRows\.length\)blockers\.push/,'Missing tickers must block import');
assert.match(html,/if\(potentialCloudMatches\.length\)blockers\.push/,'Cloud duplicate candidates must block import');
assert.match(html,/目前正式匯入功能維持關閉/,'Import must remain disabled until validated');
assert.match(html,/normalize\('NFKC'\)/,'Excel headers must normalize full-width characters');
assert.match(html,/手續費＆交易稅/,'Source Excel fee header must be recognized');
assert.match(html,/入賬時間/,'Source Excel payout header must be recognized');
assert.ok(html.includes('const conversionErrors=[],convertedTrades=[];'),'Typed import conversion must exist');
assert.ok(html.includes('sequence_no:position'),'Import must preserve original Excel order');
assert.ok(html.includes('dividend_gross:gross'),'Import must convert net dividends to gross');
assert.ok(html.includes('if(conversionErrors.length)blockers.push'),'Invalid conversions must block import');
assert.ok(html.includes('6201 與 006201 永遠是不同代號'),'Leading-zero distinction must be documented');
assert.ok(html.includes('const normalizeTicker=v=>'),'Ticker normalizer must exist');
assert.ok(html.includes('internalConflictCodes.add(code)'),'Internal name conflicts must be tracked by exact code');
assert.ok(html.includes('cloudConflictCodes.add(code)'),'Cloud name conflicts must be tracked by exact code');
assert.ok(html.includes('new Set([...internalConflictCodes,...cloudConflictCodes])'),'Conflict detection must not parse display messages');
assert.ok(!html.includes('new Set(nameIssues.map(issue=>'),'Conflict detection must not depend on warning text');
assert.ok(html.includes("const waitingRows=candidateRows.filter"),'Pending trade plans must be classified separately');
assert.ok(html.includes("const refundRows=candidateRows.filter"),'Capital refunds must be classified separately');
assert.ok(html.includes("const executableRows=candidateRows.filter(item=>!specialRows.has(item))"),'Recognized special rows must not be reported as unknown trades');
assert.ok(html.includes("等待不代表成交"),'Pending trades must not be counted as executed');
assert.ok(html.includes('const reviewByRow=new Map()'),'Review queue must group reasons per Excel row');
assert.ok(html.includes('reviewRows.map(([position,reasons])'),'Every flagged row must be rendered');
assert.ok(html.includes('Excel 原始列號'),'Original row reference must remain visible');
assert.ok(html.includes('僅本機預檢，不代表已匯入'),'Review must not pretend to be persisted');
assert.ok(html.includes('const reviewExport={'),'Review export must be built from full review list');
assert.ok(html.includes('rows:reviewRows.map'),'Review export must include every flagged row');
assert.ok(html.includes("status:'待確認',review_note:''"),'Review export must preserve pending status');
assert.ok(html.includes('class="review-checked"'),'Review rows must support manual confirmation');
assert.ok(html.includes("record.status=box.checked?'已人工確認':'待確認'"),'Manual confirmations must be included in exported report');
assert.ok(html.includes('cloud_write_performed:false'),'Review export must not claim cloud writes');
assert.ok(html.includes('id="exportImportReview"'),'Review export download control must exist');
assert.ok(html.includes('schema_version:2,source_file:file.name'),'Review report version must identify exact source');
assert.ok(html.includes('row_snapshot:JSON.stringify(row)'),'Review restore must compare complete Excel row');
assert.ok(html.includes("prior.row_snapshot!==item.row_snapshot"),'Changed rows must reject old confirmations');
assert.ok(html.includes("JSON.stringify(prior.reasons)!==JSON.stringify(item.reasons)"),'Changed warnings must reject old confirmations');
assert.ok(html.includes("saved.rows.length!==reviewExport.rows.length"),'Changed review counts must reject old confirmations');
assert.ok(html.includes("id=\"restoreImportReview\""),'Review report upload control must exist');
assert.ok(html.indexOf('const waitingRows=candidateRows.filter')<html.indexOf('const valid=after.filter'),'Pending status must be classified before executed trades');
assert.ok(html.includes("String(row[statusCol]??'').trim()==='等待'"),'Pending classification must use the actual status column');
assert.ok(html.includes("if(statusCol<0)blockers.push"),'Missing status column must block import');
assert.ok(html.includes("statusCol>=0&&String(row[statusCol]"),'Pending trades must use the status column');
assert.ok(html.includes('const importPlan={'),'Explicit dry-run import plan must exist');
assert.ok(html.includes('dry_run:true,cloud_write_performed:false'),'Import plan must not imply a cloud write');
assert.ok(html.includes('rows:convertedTrades.map(({excel_row,...transaction})=>({excel_row,transaction}))'),'Source row must be kept outside database payload');
assert.ok(html.includes('id="exportImportPlan"'),'Import plan must be downloadable');
assert.ok(html.includes('失敗時整批回滾'),'Atomic import requirement must be visible');
assert.ok(html.includes("crypto.subtle.digest('SHA-256',bytes)"),'Source fingerprint must hash raw workbook bytes');
assert.ok(html.includes("new TextEncoder().encode(JSON.stringify(importPlan.rows))"),'Payload fingerprint must hash exact staging rows');
assert.ok(html.includes("importPlan.blockers=[...blockers]"),'Hashing errors must update import blockers');
assert.ok(html.includes("const importDisposition=["),'All source rows must receive an explicit disposition');
assert.ok(html.includes("const unaccounted=sourceRows.filter(x=>!accounted.has(x.position))"),'Unclassified Excel rows must be detected');
assert.ok(html.includes("if(unaccounted.length||duplicates||accounted.size!==sourceRows.length)"),'Missing or double-classified rows must block import');
assert.ok(html.includes("unaccounted_rows:unaccounted.map(x=>x.position)"),'Export must identify unclassified original Excel rows');
assert.ok(html.includes('const allowedImportKeys=new Set('),'Import keys must be whitelisted');
assert.ok(html.includes('transaction.sequence_no!==excel_row'),'Source row sequence must match Excel row');
assert.ok(html.includes('Object.keys(transaction).some(key=>!allowedImportKeys.has(key))'),'Reject unexpected database payload keys');
assert.ok(html.includes('id="checkCloudImport"'),'Standalone cloud readiness control exists');
assert.ok(html.includes("client.rpc('stock_import_readiness')"),'Readiness uses Supabase RPC');
assert.ok(html.includes("data.initial_import_allowed!==(count===0)"),'Readiness crosschecks existing transactions');
assert.ok(html.includes("button.disabled=true"),'Readiness blocks repeated clicks during request');
const start=html.indexOf('  const canonical=v=>',html.indexOf('// Compare only unambiguous dates'));
const end=html.indexOf('  const dateAudit={missing:[],invalid:[]};',start);
assert.ok(start>0&&end>start,'Excel normalization helpers must exist');
const helpers=html.slice(start,end);
const XLSX={SSF:{parse_date_code(n){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};}}};
const make=new Function('XLSX','dateCol','codeCol','typeCol','sharesCol','priceCol','dividendCol','wireCol',helpers+';return {strictDate,numberKey,signatureParts,signature};');
const x=make(XLSX,0,1,2,3,4,5,6);
assert.equal(x.strictDate('2026/9/1'),'2026-09-01');
assert.equal(x.strictDate('2026-09-01'),'2026-09-01');
assert.equal(x.strictDate('5/6/16'),null);
assert.equal(x.strictDate('42496'),'2016-05-06');
assert.equal(x.strictDate('2026/02/30'),null);
assert.equal(x.numberKey('1,000.00'),'1000');
assert.equal(x.numberKey('10.50'),'10.5');
assert.equal(x.numberKey(''),null);
assert.equal(x.signatureParts('2026/9/1','0056','現股','1,000','72.20'),x.signatureParts('2026-09-01','0056','現股',1000,72.2));
assert.notEqual(x.signatureParts('2026/9/1','0056','現股',1000,72.2),x.signatureParts('2026/9/1','0056','現股',500,72.2));
assert.equal(x.signatureParts('5/6/16','0056','現股',1000,72.2),null);
assert.equal(x.signatureParts('2026/9/1','0056','股票股利',100,null),x.signatureParts('2026/9/1','0056','股票股利',100,0));
assert.notEqual(x.signatureParts('2026/9/1','6201','股票股利',100,null),x.signatureParts('2026/9/1','006201','股票股利',100,null));
assert.equal(x.signatureParts('2026/9/1','0056','現金股息',null,null,105,5),x.signatureParts('2026/9/1','0056','現金股息',null,null,105,5));
assert.notEqual(x.signatureParts('2026/9/1','0056','現金股息',null,null,105,5),x.signatureParts('2026/9/1','0056','現金股息',null,null,100,5));
assert.equal(x.signature([46000,'0056','現金股息',null,null,100,5]),x.signatureParts(46000,'0056','現金股息',null,null,105,5));
// Exercise the actual classification block, not just string matching.
const classificationStart=html.indexOf("  const validTypes=new Set(['現股','現金股息','股票股利']);");
const classificationEnd=html.indexOf('  const pendingPreview=',classificationStart);
assert.ok(classificationStart>0&&classificationEnd>classificationStart,'Classification source block exists');
const classify=new Function('rows','headerIndex','idx','codeCol','typeCol','dateCol','workbookSha','originalWorkbookSha','normalizeTicker',
 html.slice(classificationStart,classificationEnd)+';return {waitingRows,refundRows,valid,missingCodeRows,needsReview};');
const sample=[
 {row:['6201','現股','已成交','2026-10-01'],excelRow:10},
 {row:['006201','現股','等待','2026-10-02'],excelRow:11},
 {row:['6201','增資退款','已成交','2026-10-03'],excelRow:12},
 {row:['','現股','已成交','2026-10-04'],excelRow:13}
];
const sampleResult=classify(sample,-1,(...names)=>names.includes('狀態')?2:-1,0,1,3,null,'original-sha',v=>String(v).trim().toUpperCase());
assert.deepEqual(sampleResult.waitingRows.map(x=>x.position),[11]);
assert.deepEqual(sampleResult.refundRows.map(x=>x.position),[12]);
assert.deepEqual(sampleResult.valid.map(x=>x.position),[10]);
assert.deepEqual(sampleResult.missingCodeRows.map(x=>x.position),[13]);
assert.deepEqual(sampleResult.needsReview.map(x=>x.position),[]);
const verifiedSample=[
 {row:['9105','現股','已成交','2026-01-01'],excelRow:106},
 {row:['2002','現股','已成交','2026-01-02'],excelRow:307},
 {row:['6175','現金股息','已成交','2026-01-03'],excelRow:554},
 {row:['6175','現金股息','已成交','2026-01-03'],excelRow:557}
];
const sameWorkbook=classify(verifiedSample,-1,(...names)=>names.includes('狀態')?2:-1,0,1,3,'sha-ok','sha-ok',v=>String(v).trim().toUpperCase());
assert.deepEqual(sameWorkbook.refundRows.map(x=>x.position),[106],'Verified refund must be excluded from trades');
assert.deepEqual(sameWorkbook.valid.map(x=>x.position),[307,554],'Keep first dividend, exclude confirmed duplicate');
const editedWorkbook=classify(verifiedSample,-1,(...names)=>names.includes('狀態')?2:-1,0,1,3,'edited','sha-ok',v=>String(v).trim().toUpperCase());
assert.deepEqual(editedWorkbook.valid.map(x=>x.position),[106,307,554,557],'Do not apply row-based overrides to edited workbook');

assert.ok(html.includes("const paidCostCol=idx('付出成本'"),'Independent paid-cost column must be identified');
assert.ok(html.includes('confirmed_paid_cost:5512'),'Original row 558 correction must be retained');
assert.ok(html.includes('applied_to_transaction:false'),'Paid cost must not be silently mapped into transaction price or fees');
assert.ok(html.includes('paid_cost_audit:{column_recognized:'),'Dry-run report must preserve cost reconciliation status');
assert.ok(html.includes('reviewedCorrectionsPreview+revisedReviewPreview+correctionDiagnosticPreview+paidCostAudit+'),'Cost reconciliation must be visible in the preview');
assert.ok(html.includes('const paidCostRows=[],paidCostInvalidRows=[],paidCostProfitRows=[]'),'Audit all source cost rows');
assert.ok(html.includes('reviewed_paid_cost:paidCost558Review&&position===558?5512:null'),'Reviewed cost must be recorded separately from source value');
assert.ok(html.includes('invalid_rows:paidCostInvalidRows'),'Invalid paid-cost values must be visible in exported plan');
assert.ok(html.includes('importPlan.production_import_blockers='),'Production cost reconciliation must remain explicitly blocked');
const tickerNormalizerPosition=html.indexOf('const normalizeTicker=');
const refundCheckPosition=html.indexOf('const verifiedRefund=item=>');
const paidCostParserPosition=html.indexOf('const paidCostNumberKey=');
const paidCostReviewPosition=html.indexOf('const paidCost558Source=');
assert.ok(tickerNormalizerPosition>0&&tickerNormalizerPosition<refundCheckPosition,'Ticker normalization must be initialized before refund and duplicate classification');
assert.ok(paidCostParserPosition>0&&paidCostParserPosition<paidCostReviewPosition,'Paid-cost numeric parser must be initialized before row 558 review');
assert.ok(html.includes('const parsed=paidCostNumberKey(raw);'),'All paid-cost rows must use initialized numeric parser');
assert.ok(!html.includes('const paidCost558Source=paidCost558Raw===null?null:numberKey('),'Avoid using later-initialized numeric helper during paid-cost review');
assert.ok(html.includes("flag(item.excel_row,'付出成本：無法解析原始值"),'Invalid source costs must appear in row-level review');
assert.ok(html.includes("if(paidCostInvalidRows.length)blockers.push("),'Invalid source costs must block unsafe production import');
assert.ok(html.includes("if(paidCostCol<0)blockers.push("),'Missing source cost column must be explicit');
assert.ok(html.includes("new Set(['獲利','當沖獲利'])"),'Profit statuses must be classified separately');
assert.ok(html.includes("if(profitStatuses.has(status))"),'Profit-status rows must bypass numeric purchase-cost parsing');
assert.ok(html.includes("excluded_info_rows:excludedInfoRows"),'Excluded rows must be separately audited');
assert.ok(html.includes("profit_status_rows:paidCostProfitRows"),'Import audit must retain excluded profit-status rows');
console.log('PASS: Excel preflight normalization and source-format guards');

assert.match(html,/const confirmedFooterRows=originalReviewMatches\?/,'Footer exclusion must be limited to verified original workbook');
assert.match(html,/item\.position>\(revisedReviewMatches\?611:footerBoundary\)/,'Revised ledger ends at 611 and original ends at 612');
assert.match(html,/const footerBoundary=612/,'Original ledger ends at Excel row 612');
assert.match(html,/const footerTradeConflicts=confirmedFooterRows\.filter/,'Trade-shaped rows in footer must be audited');
assert.match(html,/if\(footerTradeConflicts\.length\)blockers\.push/,'Unexpected trade-shaped footer rows must block import');
assert.match(html,/confirmed_footer_rows:confirmedFooterRows\.map/,'Import plan must account for excluded footer rows');

assert.ok(html.includes("normalizeTicker(row558.row[codeCol])==='2327'"),'Row 558 belongs to 2327, not 6175');
assert.ok(html.includes("ticker:'2327',confirmed_paid_cost:5512"),'Row 558 verified cost must use exact ticker');
assert.ok(html.includes('const reviewedPaidCostRows=paidCost558Review?'),'Reviewed cost must survive blank/formula source cells');
assert.ok(html.includes('reviewed_rows:reviewedPaidCostRows'),'Exported audit must retain confirmed cost independently');
assert.ok(html.includes("client.rpc('stock_paid_cost_readiness')"),'Staging must verify cost storage capability before writing');
assert.ok(html.includes('importPlan.blockers=[...blockers];'),'Final blockers must be copied to export');

assert.ok(html.includes('trade_fees:fees,paid_cost:paidCost'),'Converted trades must carry separate paid cost');
assert.ok(html.includes("!profitStatuses.has(excelStatus)"),'Profit-status cells must not be guessed as paid cost');
assert.ok(html.includes('position===558?'),'Confirmed Excel 558 cost must override source only for exact row');
assert.ok(html.includes("'trade_fees','paid_cost','dividend_gross'"),'Paid cost must be whitelisted');
assert.ok(html.includes("client.rpc('stock_paid_cost_readiness')"),'Staging must verify paid-cost SQL migration');
assert.ok(html.includes("requires_sql_migration:'sql/06_paid_cost_and_import_commit.sql'"),'Dry run must disclose required migration');

assert.ok(html.includes('if(profitStatuses.has(status)){'),'Profit status rows must be separated even when numeric');
assert.ok(html.includes('numeric_value:parsed===null?null:Number(parsed)'),'Preserve profit-cell numeric values for audit, not paid cost');

assert.ok(html.includes("errors.push('現股股數（原始值：'"),'Show exact invalid quantity');
assert.ok(html.includes("errors.push('成交價（原始值：'"),'Show exact invalid price');
assert.ok(html.includes("errors.push('手續費／交易稅（原始值：'"),'Show exact invalid fees');
assert.ok(html.includes('source_fields:{'),'Export raw conversion fields for audit');
assert.ok(html.includes('applied_price:price,applied_paid_cost:paidCost'),'Export reviewed values separately');
assert.ok(html.includes('reviewedCorrectionsPreview+revisedReviewPreview+correctionDiagnosticPreview'),'Surface field-level diagnostics in import preview');
assert.ok(!html.includes("errors.push('現股數量／價格／費用')"),'Never hide failing field behind generic combined error');

assert.ok(html.includes("const revisedWorkbookSha='0214986ec2a9ae20a45adfa08c52bc3434b41382c7c54eeb8843f85930f57549'"),'Revised workbook hash must match verified upload');
assert.ok(html.includes('const confirmedDistinctPair=revisedReviewMatches'),'Only SHA-scoped revised workbook may waive confirmed separate 503/504 executions');
assert.ok(html.includes('const verifiedRefund=item=>(workbookSha===originalWorkbookSha||workbookSha===revisedWorkbookSha)'),'Refund applies to both verified workbook versions');
assert.ok(html.includes('candidateRows.filter(item=>item.position>(revisedReviewMatches?611:footerBoundary))'),'Revised footer starts after row 611');
