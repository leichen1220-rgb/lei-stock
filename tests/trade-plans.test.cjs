const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const ledgerCode=html.slice(html.indexOf('function orderedTransactions(items){'),html.indexOf('function renderOverview(){'));
const calc=rows=>new Function('trades',ledgerCode+';return estimateCostLedger()')(rows);
const code=html.slice(html.indexOf('let tradePlans=[]'),html.indexOf("$('planForm').addEventListener"));
const user={id:'a'};let failure=null,loaded=[];
const api=new Function('estimateCostLedger','fetchAll','user',code+';return {buildPlanRows,validatePlan,planWaitingImport,readTradePlans,state:()=>({plansReady,tradePlans})}');
const buys=[{ticker:'006201',transaction_type:'現股',trade_date:'2026-01-01',quantity:100,price:20,paid_cost:2000,trade_fees:0},{ticker:'006201',transaction_type:'現股',trade_date:'2026-01-02',quantity:100,price:30,paid_cost:3000,trade_fees:0},{ticker:'006201',transaction_type:'現股',trade_date:'2026-01-03',quantity:-50,price:50,trade_fees:0}].map(Object.freeze);
const a=api(()=>calc(buys),async table=>{assert.equal(table,'stock_trade_plans');if(failure)throw failure;return loaded;},user);
const plan=Object.freeze({ticker:'006201',direction:'未指定',quantity:null,target_price:1000,source_key:'excel-wait:593:006201'});
let row=a.buildPlanRows([plan],buys,[{ticker:'006201',close_price:35,price_date:'2026-10-13'}])[0];
assert.equal(row.average,25);assert.equal(row.highest,30);assert.equal(row.close,35);assert.equal(row.target_price,1000);assert.equal(calc(buys).states.get('006201').quantity,150);
row=a.buildPlanRows([{...plan,ticker:'6201'}],buys,[])[0];assert.equal(row.average,null);assert.equal(row.highest,null);assert.equal(row.close,null);
assert.equal(a.validatePlan({...plan,ticker:'00679b'}).ticker,'00679B');
for(const value of [0,-1,'abc',Infinity])assert.throws(()=>a.validatePlan({...plan,target_price:value}));
assert.throws(()=>a.validatePlan({...plan,quantity:-10}));assert.throws(()=>a.validatePlan({...plan,direction:'自動成交'}));
const payload={schema_version:1,report_type:'stock_trade_plans',rows:[plan]},snapshot=JSON.stringify(payload);
assert.equal(a.planWaitingImport(payload,[]).rows.length,1);
assert.equal(a.planWaitingImport(payload,[plan]).skipped,1);assert.equal(a.planWaitingImport(payload,[plan]).rows.length,0);
assert.throws(()=>a.planWaitingImport({...payload,rows:[plan,plan]},[]));assert.equal(JSON.stringify(payload),snapshot);
const sql=fs.readFileSync(path.join(__dirname,'../sql/10_stock_trade_plans.sql'),'utf8');
assert.ok(!sql.includes('stock_transactions'));assert.ok(sql.includes('enable row level security'));assert.ok(sql.includes('using(owner_id=auth.uid()) with check(owner_id=auth.uid())'));
(async()=>{failure={code:'PGRST205'};await a.readTradePlans('a');assert.equal(a.state().plansReady,false);failure={code:'500',message:'network'};await assert.rejects(()=>a.readTradePlans('a'));failure=null;loaded=[plan];await a.readTradePlans('a');assert.equal(a.state().tradePlans.length,1);loaded=[{...plan,target_price:999}];user.id='b';await a.readTradePlans('a');assert.equal(a.state().tradePlans[0].target_price,1000);console.log('PASS: planned prices isolated from positions/costs, exact tickers, latest close, import deduplication, missing SQL, network errors and account isolation');})().catch(e=>{console.error(e);process.exit(1)});

const signalSource=html.slice(html.indexOf('function planPriceSignals('),html.indexOf('function renderPlans(){'));
const signals=new Function(signalSource+';return planPriceSignals')();
for(const direction of ['賣出','買進']){
 const base={direction,close:100,target_price:100,highest:100};
 assert.deepEqual(signals(base),{target:true,highest:true});
 const offset=direction==='賣出'?1:-1;
 assert.deepEqual(signals({...base,close:100+offset}),{target:true,highest:true});
 assert.deepEqual(signals({...base,close:100-offset}),{target:false,highest:false});
 assert.deepEqual(signals({...base,target_price:direction==='賣出'?90:110,highest:direction==='賣出'?110:90}),{target:true,highest:false});
 assert.deepEqual(signals({...base,target_price:direction==='賣出'?110:90,highest:direction==='賣出'?90:110}),{target:false,highest:true});
}
for(const close of [null,undefined,'',0,NaN])assert.deepEqual(signals({direction:'買進',close,target_price:100,highest:100}),{target:false,highest:false});
assert.deepEqual(signals({direction:'未指定',close:100,target_price:100,highest:100}),{target:false,highest:false});
assert.deepEqual(signals({direction:'賣出',close:100,target_price:null,highest:100}),{target:false,highest:true});
const priceHTML=new Function('fmt',signalSource+';return planPriceHTML')(String);
assert.match(priceHTML({direction:'賣出',close:100,target_price:100,highest:100}),/plan-highest-dot/);
assert.match(priceHTML({direction:'買進',close:100,target_price:90,highest:110}),/plan-highest/);
assert.equal(priceHTML({direction:'買進',close:null,target_price:100,highest:100}),'—');
console.log('PASS: inclusive buy/sell thresholds, independent reference prices, combined marker and missing-price handling');

// Holding hints are derived from the ledger, separate from planned quantity.
const guardSource=html.slice(html.indexOf('function planHoldingCheck('),html.indexOf('function updatePlanHoldingHint('));
let guardStates=new Map(),guardBlocked=new Set(),guardReady=true;
const guard=new Function('user','cloudReady','estimateCostLedger','LeiCorporateActions','corporateRecords','today','nameOf','fmt','return (ticker,direction,quantity)=>{const cloudDataReady=cloudReady();'+guardSource+';return planHoldingCheck(ticker,direction,quantity)}')({id:'a'},()=>guardReady,()=>({states:guardStates}),{blocked:()=>guardBlocked},[],()=> '2026-11-11',t=>t==='2330'?'台積電':'—',String);
assert.match(guard('2330','賣出','').warning,/目前無持股/);
guardStates.set('2330',{valid:true,quantity:10});
assert.match(guard('2330','賣出',11).warning,/超過/);assert.equal(guard('2330','賣出',10).warning,'');assert.equal(guard('2330','買進',100).warning,'');
assert.match(guard('2330','賣出',10).text,/台積電 2330｜目前持有 10 股/);
assert.match(guard('006201','賣出',1).warning,/目前無持股/);
guardBlocked.add('2330');assert.match(guard('2330','賣出',1).text,/股本異動待確認/);guardBlocked.clear();
guardStates.set('2330',{valid:false,quantity:10});assert.match(guard('2330','賣出',1).warning,/待核對/);
guardReady=false;assert.match(guard('2330','賣出',1).text,/尚未同步/);
console.log('PASS: holding hints and sell warnings handle zero holdings, overselling, exact codes and unconfirmed inventory');
