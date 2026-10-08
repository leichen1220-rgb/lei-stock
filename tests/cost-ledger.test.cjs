// Run with: node tests/cost-ledger.test.cjs
// The test extracts the same function used by index.html, so it detects regressions in the deployed code.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('function estimateCostLedger(){');
const end=html.indexOf('\nfunction renderOverview()',start);
assert.ok(start>=0&&end>start,'cost ledger function must exist');
const source=html.slice(start,end);
const calculate=new Function('trades',source+';return estimateCostLedger()');
function run(trades,ticker='2330'){const result=calculate(trades);return {state:result.states.get(ticker),warnings:result.warnings};}
const buy={ticker:'2330',trade_date:'2026-01-01',transaction_type:'現股',quantity:100,price:50,trade_fees:20};
const sell={ticker:'2330',trade_date:'2026-01-02',transaction_type:'現股',quantity:-40,price:60,trade_fees:10};
let x=run([buy,sell]);
assert.equal(x.state.quantity,60);
assert.equal(x.state.cost,3012);
assert.equal(x.state.realized,382);
assert.equal(x.state.valid,true);
x=run([buy,{ticker:'2330',trade_date:'2026-01-02',transaction_type:'股票股利',quantity:20}]);
assert.equal(x.state.quantity,120);
assert.equal(x.state.cost,5020);
x=run([buy,{...sell,quantity:-101},{...buy,trade_date:'2026-01-03'}]);
assert.equal(x.state.valid,false);
assert.equal(x.state.quantity,100);
assert.ok(x.warnings.length>=2);
x=run([{...buy,price:null}]);
assert.equal(x.state.valid,false);
x=run([buy,{ticker:'2330',trade_date:'2026-01-02',transaction_type:'現金股息',dividend_gross:100}]);
assert.equal(x.state.cost,5020);
console.log('PASS: 5 cost ledger cases (sale, stock dividend, oversell, missing price, cash dividend)');
