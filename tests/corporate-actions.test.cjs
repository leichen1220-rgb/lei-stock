const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ca=require('../supabase/functions/_shared/corporate-actions.js'),wb=require('../scripts/portfolio-workbench.js'),core=require('../supabase/functions/_shared/portfolio-core.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=html.slice(html.indexOf('function orderedTransactions(items){'),html.indexOf('function renderOverview(){'));
const buy=(q=100,cost=10000)=>({id:'buy',ticker:'3714',transaction_type:'現股',quantity:q,paid_cost:cost,trade_date:'2026-01-01',sequence_no:0});
const action=(more={})=>({id:'a',ticker:'3714',kind:'cash_reduction',status:'confirmed',effective_date:'2026-11-16',timing:'before',event_order:0,before_quantity:100,after_quantity:80,fractional_quantity:0,principal_cash:200,fractional_cash:0,fees:0,cash_received:false,...more});
const ledger=(trades,corporateRecords,asOf='2026-11-16')=>new Function('trades','corporateRecords','LeiCorporateActions','today',source+';return {cost:estimateCostLedger(),cash:excelCostLedger(),amount:tradeCashAmount};')(trades,corporateRecords,ca,()=>asOf);
const row=(trades,events,asOf='2026-11-16',priceDate=asOf)=>{const l=ledger(trades,events,asOf);return wb.buildRows(trades,[{ticker:'3714',close_price:130,price_date:priceDate}],l.cost.states,l.cash.states,l.amount,events,asOf)[0];};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let a=action(),r=row([buy()],[a]);assert.equal(r.quantity,80);assert.equal(r.remainingCost,9800);assert.equal(r.average,122.5);assert.equal(r.realized,0);assert.equal(r.income,0);assert.equal(r.corporateReceivable,200);assert.equal(r.total,600);near(r.total,r.realized+r.unrealized+r.income+r.otherRealized);
const paid=row([buy()],[{...a,cash_received:true}]);assert.equal(paid.corporateReceivable,0);assert.equal(paid.total,r.total);
r=row([buy()],[a],'2026-11-15');assert.equal(r.quantity,100);assert.equal(r.remainingCost,10000);
r=row([buy()],[{...a,status:'pending',after_quantity:null,principal_cash:null}],'2026-11-16');assert.equal(r.quantity,100);assert.equal(r.average,null);assert.equal(r.total,null);assert.equal(r.quote,null);assert.throws(()=>wb.simulate(r,1,100,{rate:0,discount:0,minFee:0,tax:0,rounding:'ceil'},'stock'));
assert.throws(()=>core.quantities([buy()],[{...a,status:'pending'}],'2026-11-16'));
r=row([buy()],[a],'2026-11-16','2026-11-04');assert.equal(r.market,null);assert.equal(r.total,null);
for(const [kind,after]of [['split',200],['reverse_split',50],['loss_reduction',50]]){a=action({kind,after_quantity:after,principal_cash:0});r=row([buy()],[a]);assert.equal(r.quantity,after);assert.equal(r.remainingCost,10000);assert.equal(r.otherRealized,0);assert.equal(r.fifo.lots[0].cost,10000);near(r.fifo.highestUnit,10000/after);}
a=action({kind:'subscription',before_quantity:100,after_quantity:110,subscribed_quantity:10,subscription_cost:500,principal_cash:0});r=row([buy()],[a]);assert.equal(r.quantity,110);assert.equal(r.remainingCost,10500);assert.equal(r.fifo.lots.length,2);assert.equal(r.fifo.lots[1].cost,500);
// Fractions are disposed pro rata across all remaining lots, not FIFO sales.
a=action({after_quantity:54,fractional_quantity:0.2,principal_cash:458,fractional_cash:9,fees:1});r=row([buy()],[a]);near(r.remainingCost,(10000-458)*54/54.2);near(r.otherRealized,9-(10000-458)*.2/54.2-1);near(r.total,r.realized+r.unrealized+r.income+r.otherRealized);assert.equal(r.netInvestment,9534);assert.equal(r.corporateReceivable,466);
// Costs remain on their original acquisition dates; cash returns are per old share.
let trades=[buy(50,1000),{...buy(50,3000),id:'b',trade_date:'2026-02-01'}];a=action({after_quantity:50,principal_cash:1000});r=row(trades,[a]);assert.equal(r.fifo.lots[0].cost,500);assert.equal(r.fifo.lots[1].cost,2500);assert.equal(r.fifo.lots[0].quantity,25);assert.equal(r.fifo.lots[0].date,'2026-01-01');
trades.push({id:'s',ticker:'3714',transaction_type:'現股',quantity:-25,price:120,sale_net_received:2990,trade_date:'2026-11-16',sequence_no:1});r=row(trades,[a]);assert.equal(r.quantity,25);assert.equal(r.remainingCost,1500);assert.equal(r.realized,1490);assert.equal(r.fifo.lots.length,1);assert.equal(r.fifo.lots[0].cost,2500);near(r.total,r.realized+r.unrealized+r.otherRealized+r.income);
assert.throws(()=>core.quantities(trades,[{...a,before_quantity:99}],'2026-11-16'));
const q=core.quantities(trades,[a],'2026-11-16');assert.equal(q[0].quantity,25);
// Same-day after-trade ordering, with positive imported transaction sequence numbers.
a=action({before_quantity:110,after_quantity:55,principal_cash:0,kind:'reverse_split',timing:'after'});trades=[buy(),{...buy(10,1000),id:'b',trade_date:'2026-11-16',sequence_no:999}];r=row(trades,[a]);assert.equal(r.quantity,55);assert.equal(r.remainingCost,11000);assert.equal(r.fifo.quantity,55);
// Return of capital above the remaining cost is separated, never negative principal basis.
a=action({principal_cash:150});r=row([buy(100,100)],[a]);assert.equal(r.remainingCost,0);assert.equal(r.otherRealized,50);near(r.total,r.realized+r.unrealized+r.otherRealized);
assert.throws(()=>ca.validate(action({fees:null})));assert.throws(()=>ca.validate(action({after_quantity:80.2})));assert.throws(()=>ca.validate(action({effective_date:'2026-02-30'})));assert.throws(()=>ca.validate(action({fractional_quantity:1})));
const original=JSON.stringify(trades);row(Object.freeze(trades.map(t=>Object.freeze(t))),[Object.freeze(a)]);assert.equal(JSON.stringify(trades),original);
const sql=fs.readFileSync(path.join(__dirname,'../sql/12_stock_corporate_actions.sql'),'utf8');assert.ok(sql.includes('enable row level security'));assert.ok(sql.includes('with check(owner_id=auth.uid())'));assert.ok(!/update\s+public\.stock_transactions|alter\s+table\s+public\.stock_transactions/i.test(sql));assert.ok(sql.includes('coalesce(('));
console.log('PASS: five corporate action kinds, pending/future gating, stale quotes, exact snapshots, receivables, fractional proceeds, FIFO, subsequent sales, date ordering, cash excess and unchanged executions');
