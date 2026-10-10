const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {webcrypto,createHash}=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('const reconciledStagingFingerprint=');
const end=html.indexOf('// The audit itself only reads data.',start);
assert.ok(start>0&&end>start);
const code=html.slice(start,end);
// Synthetic transactions only; no private source data is checked into Git.
const fixtures=Array.from({length:591},(_,i)=>({excel_row:i+2,transaction_data:{
 ticker:'1234',trade_date:'2026-10-01',transaction_type:'現股',quantity:10,
 price:20,trade_fees:2,paid_cost:202,dividend_gross:null,wire_fee:null,
 payment_date:null,note:null,sequence_no:i+2}}));
fixtures[571].transaction_data.transaction_type='現金股息';
fixtures[571].transaction_data.dividend_gross=34.638999999999996;
const canonical=records=>JSON.stringify([...records].sort((a,b)=>a.excel_row-b.excel_row)
 .map(r=>[Number(r.excel_row),Object.keys(r.transaction_data).sort().map(k=>[k,r.transaction_data[k]])]));
const fingerprint=createHash('sha256').update(canonical(fixtures)).digest('hex');
function harness(options={}){
 const calls=[],downloads=[],elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,{disabled:true,textContent:'',value:'',closest:()=>({open:false})});return elements.get(id)};
 const records=structuredClone(fixtures);
 if(options.changed)records[1].transaction_data.paid_cost=999;
 const context={$,crypto:webcrypto,TextEncoder,Uint8Array,window:{confirm:()=>options.confirm!==false},
 user:{id:'test-owner'},cloudDataReady:true,trades:[],tickers:[],banks:[],prices:[],
 today:()=> '2026-10-10',download:(...args)=>downloads.push(args),
 client:{rpc:async(name,args)=>{
  calls.push(name);
  if(name==='stock_import_readiness')return {data:{schema_version:1,initial_import_allowed:!options.nonempty,account_transactions:options.nonempty?1:0}};
  if(name==='stock_paid_cost_readiness')return {data:{schema_version:1,paid_cost_column:!options.missingCost,commit_function_updated:true}};
  if(name==='stock_stage_import'){
   assert.equal(args.p_rows.length,591);
   assert.equal(args.p_rows[0].transaction.sequence_no,args.p_rows[0].excel_row);
   return {data:{state:'staged',rows:591,batch_id:'12345678-1234-1234-1234-123456789abc'}};
  }
  if(name==='stock_commit_import'){
   if(options.commitFailure)throw Error('network failure');
   return {data:{batch_id:'test-batch',state:'committed',rows:591}};
  }
  throw Error('Unexpected RPC '+name);
 },from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[{state:'staged',row_count:591}]})})},
 load:async()=>{context.trades=fixtures.map(r=>({...r.transaction_data,dividend_gross:r.transaction_data.dividend_gross==null?null:Number(r.transaction_data.dividend_gross.toFixed(4)),id:'row-'+r.excel_row}));if(options.dividendMismatch)context.trades[571].dividend_gross+=0.0001;if(options.postMismatch)context.trades[0].price=999;}
 };
 vm.createContext(context);
 vm.runInContext(code.replace(/const reconciledStagingFingerprint='[a-f0-9]{64}'/,
  "const reconciledStagingFingerprint='"+fingerprint+"'"),context);
 context.readStagedTransactions=async()=>records;
 const button={disabled:false,remove(){this.removed=true}},output={textContent:''};
 return {context,elements,$,calls,downloads,button,output,run:()=>context.commitReconciledBatch('test-batch','test-owner',button,output)};
}
(async()=>{
 const h=harness();
 const plan={schema_version:1,report_type:'reconciled_initial_import',row_count:591,source_name:'synthetic.xlsx',source_sha256:'a'.repeat(64),rows:fixtures};
 const stage=harness();
 stage.$('auditStagedBatch').onclick=async()=>{};
 await stage.$('reviewedImportFile').onchange({target:{files:[{size:1000,text:async()=>JSON.stringify(plan)}]}});
 assert.equal(stage.calls.length,0,'File selection only reads locally');
 assert.equal(stage.$('stageReviewedImport').disabled,false);
 await stage.$('stageReviewedImport').onclick();
 assert.equal(stage.calls.filter(x=>x==='stock_stage_import').length,1);
 assert.ok(!stage.calls.includes('stock_commit_import'),'Staging must not commit');
 assert.equal(stage.$('auditBatchId').value,'12345678-1234-1234-1234-123456789abc');
 for(const bad of [{...plan,row_count:590},{...plan,rows:fixtures.slice(1)}]){
  const t=harness();await t.$('reviewedImportFile').onchange({target:{files:[{size:1000,text:async()=>JSON.stringify(bad)}]}});
  await t.$('stageReviewedImport').onclick();assert.equal(t.calls.length,0);
  assert.equal(t.$('stageReviewedImport').disabled,true);
 }
 const occupied=harness({nonempty:true});
 await occupied.$('reviewedImportFile').onchange({target:{files:[{size:1000,text:async()=>JSON.stringify(plan)}]}});
 await occupied.$('stageReviewedImport').onclick();
 assert.ok(!occupied.calls.includes('stock_stage_import'),'Existing ledger blocks repair staging');
 assert.equal(await h.context.stagingFingerprint(fixtures),fingerprint);
 assert.equal(await h.context.stagingFingerprint([...fixtures].reverse()),fingerprint);
 const changed=structuredClone(fixtures);changed[1].transaction_data.ticker='001234';
 assert.notEqual(await h.context.stagingFingerprint(changed),fingerprint,'Leading zeros are meaningful');
 assert.notEqual(await h.context.stagingFingerprint(fixtures.slice(1)),fingerprint,'Missing source row changes fingerprint');
 for(const options of [{confirm:false},{changed:true},{nonempty:true},{missingCost:true}]){
  const t=harness(options);await t.run();
  assert.ok(!t.calls.includes('stock_commit_import'),'Unconfirmed/unreconciled/not-ready input must not write');
  assert.equal(t.downloads.length,0);
 }
 await h.run();
 assert.equal(h.calls.filter(x=>x==='stock_commit_import').length,1);
 assert.equal(h.downloads.length,0,'Commit must not trigger a Safari download before the RPC');
 assert.equal(h.button.removed,true);
 assert.match(h.output.textContent,/已正式匯入並逐筆核對 591 筆/);
 for(const options of [{commitFailure:true},{postMismatch:true},{dividendMismatch:true}]){
  const t=harness(options);await t.run();await t.run();
  assert.equal(t.calls.filter(x=>x==='stock_commit_import').length,1,'Uncertain/completed writes must not auto-retry');
  assert.equal(t.button.disabled,true);
  assert.doesNotMatch(t.output.textContent,/已正式匯入並逐筆核對/);
 }
 console.log('PASS: fingerprint, confirmation, first-import gates, separate backup, post-write verification and uncertain-result handling');
})().catch(e=>{console.error(e);process.exitCode=1});
