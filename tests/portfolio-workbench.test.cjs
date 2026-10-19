const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),api=require('../scripts/portfolio-workbench.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=html.slice(html.indexOf('function orderedTransactions(items){'),html.indexOf('function renderOverview(){'));
const ledger=rows=>new Function('trades',source+';return {cost:estimateCostLedger(),cash:excelCostLedger(),amount:tradeCashAmount}')(rows);
const buy=(id,day,qty,price,paid=qty*price)=>({id,ticker:'TEST',trade_date:day,transaction_type:'現股',quantity:qty,price,paid_cost:paid,trade_fees:0});
const sell=(day,qty,price)=>({ticker:'TEST',trade_date:day,transaction_type:'現股',quantity:-qty,price,trade_fees:0});
let trades=[buy('high','2026-01-01',10,50,505),buy('low','2026-01-02',10,20,205),sell('2026-01-03',10,30)],l=ledger(trades);
let fifo=api.fifoLedger(trades,l.amount).get('TEST');
assert.equal(fifo.quantity,10);assert.equal(fifo.lots.length,1);assert.equal(fifo.lots[0].id,'low');assert.equal(fifo.highestUnit,20.5);
trades=[buy('a','2026-01-01',10,100),buy('b','2026-01-02',20,100),{ticker:'TEST',trade_date:'2026-01-03',transaction_type:'股票股利',quantity:3},sell('2026-01-04',11,110)];l=ledger(trades);fifo=api.fifoLedger(trades,l.amount).get('TEST');
assert.ok(Math.abs(fifo.quantity-22)<1e-6);assert.equal(fifo.lots[0].id,'b');assert.ok(Math.abs(fifo.lots[0].cost-2000)<1e-6);assert.ok(Math.abs(fifo.highestUnit-2000/22)<1e-6);
fifo=api.fifoLedger([sell('2026-01-01',1,100)],ledger([]).amount).get('TEST');assert.equal(fifo.valid,false);
const fees={rate:0.001425,discount:0.28,minFee:1,tax:0.003,rounding:'ceil'};
assert.equal(api.breakEven(10000,100,fees,'stock'),100.5);
for(const kind of ['stock','etf','bond'])for(const q of [1,10,100,1000])for(const target of [-100,0,1,9.99,50,999.99,10000,100003])for(const rounding of ['ceil','round','floor']){
 const f={...fees,rounding},p=api.breakEven(target,q,f,kind);assert.ok(api.proceeds(p,q,f).net+1e-7>=target);
 // Exhaustively verify prices within the last 3 currency units of the solution.
 for(let c=Math.max(1,Math.floor((p-3)*100));c<Math.round(p*100);c++){const candidate=c/100;if(Math.abs(api.ceilPrice(candidate,kind)-candidate)<1e-7)assert.ok(api.proceeds(candidate,q,f).net<target+1e-7);}
}
const noFees={rate:0,discount:0,minFee:0,tax:0,rounding:'ceil'};
const exactRow={quantity:100,average:100,netInvestment:10000,quote:{close_price:100},fifo:{valid:true,quantity:100,highestUnit:100}};
const strict=api.simulate(exactRow,100,100,noFees,'stock');assert.equal(strict.holdingBreak,100);assert.equal(strict.everyLotBreak,100.5);
assert.equal(api.ceilPrice(9.999,'stock'),10);assert.equal(api.ceilPrice(49.999,'stock'),50);assert.equal(api.ceilPrice(99.999,'stock'),100);assert.equal(api.ceilPrice(999.999,'stock'),1000);assert.equal(api.ceilPrice(1000.01,'stock'),1005);assert.equal(api.ceilPrice(50.01,'etf'),50.05);
assert.throws(()=>api.proceeds(100,0,fees));assert.throws(()=>api.proceeds(100,1.5,fees));assert.throws(()=>api.proceeds(100,10,{...fees,tax:1}));
const income=(confirmed,fee)=>({ticker:'TEST',trade_date:'2026-01-03',transaction_type:'現金股息',dividend_gross:100,payment_confirmed:confirmed,wire_fee:fee});
trades=[buy('a','2026-01-01',100,100),income(false,null)];l=ledger(trades);
let rows=api.buildRows(trades,[{ticker:'TEST',close_price:110,price_date:'2026-10-19'}],l.cost.states,l.cash.states,l.amount),row=rows[0];assert.equal(row.pendingIncome,100);assert.equal(row.income,0);assert.equal(row.total,1000);assert.equal(row.netInvestment,10000);
trades=[buy('a','2026-01-01',100,100),income(true,0)];l=ledger(trades);row=api.buildRows(trades,[{ticker:'TEST',close_price:110,price_date:'2026-10-19'}],l.cost.states,l.cash.states,l.amount)[0];assert.equal(row.income,100);assert.equal(row.total,1100);assert.equal(row.total,row.realized+row.unrealized+row.income);
let sim=api.simulate(row,40,120,fees,'stock');assert.equal(sim.remaining,60);assert.equal(sim.remainingMarket,6600);assert.equal(sim.assigned,4000);assert.equal(sim.totalAfter,sim.net+6600-row.netInvestment);assert.ok(sim.everyLotBreak>=100);
assert.throws(()=>api.simulate(row,101,100,fees,'stock'));assert.throws(()=>api.simulate(row,0,100,fees,'stock'));
const snapshot=JSON.stringify(trades);api.fifoLedger(Object.freeze(trades.map(t=>Object.freeze({...t}))),l.amount);assert.equal(JSON.stringify(trades),snapshot);
assert.equal(api.inferKind('00679B'),'bond');assert.equal(api.inferKind('006201'),'etf');assert.equal(api.inferKind('6201'),'stock');
trades=[buy('a','2026-01-01',100,100),sell('2026-01-02',100,110)];l=ledger(trades);row=api.buildRows(trades,[],l.cost.states,l.cash.states,l.amount)[0];assert.equal(row.quantity,0);assert.equal(row.total,1000);assert.equal(row.market,0);assert.equal(row.realized,1000);
console.log('PASS: FIFO lot depletion, stock dividends, pending/confirmed income, 288 fee/tick threshold scenarios, partial sale reconciliation, liquidation and immutable records');
