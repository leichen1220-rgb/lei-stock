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
const fixtures=Array.from({length:590},(_,i)=>({excel_row:i+2,transaction_data:{
 ticker:'1234',trade_date:'2026-10-01',transaction_type:'現股',quantity:10,
 price:20,trade_fees:2,paid_cost:202,dividend_gross:null,wire_fee:null,
 payment_date:null,note:null,sequence_no:i+2}}));
const canonical=records=>JSON.stringify([...records].sort((a,b)=>a.excel_row-b.excel_row)
 .map(r=>[Number(r.excel_row),Object.keys(r.transaction_data).sort().map(k=>[k,r.transaction_data[k]])]));
const fingerprint=createHash('sha256').update(canonical(fixtures)).digest('hex');
function harness(options={}){
 const calls=[],downloads=[];
 const records=structuredClone(fixtures);
 if(options.changed)records[1].transaction_data.paid_cost=999;
 const context={crypto:webcrypto,TextEncoder,Uint8Array,window:{confirm:()=>options.confirm!==false},
 user:{id:'test-owner'},cloudDataReady:true,trades:[],tickers:[],banks:[],prices:[],
 today:()=> '2026-10-10',download:(...args)=>downloads.push(args),
 client:{rpc:async(name)=>{
  calls.push(name);
  if(name==='stock_import_readiness')return {data:{schema_version:1,initial_import_allowed:!options.nonempty,account_transactions:options.nonempty?1:0}};
  if(name==='stock_paid_cost_readiness')return {data:{schema_version:1,paid_cost_column:!options.missingCost,commit_function_updated:true}};
  if(name==='stock_commit_import'){
   if(options.commitFailure)throw Error('network failure');
   return {data:{batch_id:'test-batch',state:'committed',rows:590}};
  }
  throw Error('Unexpected RPC '+name);
 },from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[{state:'staged',row_count:590}]})})},
 load:async()=>{context.trades=fixtures.map(r=>({...r.transaction_data,id:'row-'+r.excel_row}));if(options.postMismatch)context.trades[0].price=999;}
 };
 vm.createContext(context);
 vm.runInContext(code.replace(/const reconciledStagingFingerprint='[a-f0-9]{64}'/,
  "const reconciledStagingFingerprint='"+fingerprint+"'"),context);
 context.readStagedTransactions=async()=>records;
 const button={disabled:false,remove(){this.removed=true}},output={textContent:''};
 return {context,calls,downloads,button,output,run:()=>context.commitReconciledBatch('test-batch','test-owner',button,output)};
}
(async()=>{
 const h=harness();
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
 assert.equal(h.downloads.length,1,'Pre-import snapshot must be downloaded');
 assert.equal(JSON.parse(h.downloads[0][1]).staged_batch.rows.length,590);
 assert.equal(h.button.removed,true);
 assert.match(h.output.textContent,/已正式匯入並逐筆核對 590 筆/);
 for(const options of [{commitFailure:true},{postMismatch:true}]){
  const t=harness(options);await t.run();await t.run();
  assert.equal(t.calls.filter(x=>x==='stock_commit_import').length,1,'Uncertain/completed writes must not auto-retry');
  assert.equal(t.button.disabled,true);
  assert.doesNotMatch(t.output.textContent,/已正式匯入並逐筆核對/);
 }
 console.log('PASS: fingerprint, confirmation, first-import gates, snapshot, post-write verification and uncertain-result handling');
})().catch(e=>{console.error(e);process.exitCode=1});
