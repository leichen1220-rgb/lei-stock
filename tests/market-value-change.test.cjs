const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),code=html.slice(html.indexOf('function marketValueComparison('),html.indexOf('function tickerDetailLink('));
const create=(corporateRecords=[])=>new Function('esc','fmt','corporateRecords','today',code+';return {marketValueComparison,marketValueChangeHTML}')(v=>String(v).replace(/</g,'&lt;'),n=>Number(n).toFixed(2),corporateRecords,()=> '2026-11-10');
const api=create(),pos=Object.freeze([{ticker:'006201',quantity:10},{ticker:'6201',quantity:20}].map(Object.freeze));
const quote=(ticker,close_price,price_date)=>({ticker,close_price,price_date});
const current=[quote('006201',12,'2026-10-15'),quote('6201',30,'2026-10-15')],prior=[quote('006201',10,'2026-10-14'),quote('6201',25,'2026-10-14')];
let r=api.marketValueComparison(pos,current,prior);assert.equal(r.currentValue,720);assert.equal(r.previousValue,600);assert.equal(r.difference,120);assert.equal(r.percent,20);assert.equal(r.comparedCount,2);assert.equal(r.carried.length,0);
assert.match(api.marketValueChangeHTML(pos,current,prior),/▲/);assert.match(api.marketValueChangeHTML(pos,current,prior),/profit-positive/);
assert.match(api.marketValueChangeHTML(pos,prior,current.map(q=>({...q,price_date:'2026-10-13'}))),/▼/);
assert.match(api.marketValueChangeHTML(pos,current,current.map(q=>({...q,price_date:'2026-10-14'}))),/持平/);
// Missing previous price excludes only that security and uses the subset denominator.
r=api.marketValueComparison(pos,current,prior.slice(0,1));assert.equal(r.ok,true);assert.equal(r.comparedCount,1);assert.equal(r.excluded.length,1);assert.equal(r.difference,20);assert.equal(r.percent,20);assert.match(api.marketValueChangeHTML(pos,current,prior.slice(0,1)),/可比較 1\/2 檔/);
// A stale displayed price is used on both sides, without guessing why it is stale.
const stale=[current[0],quote('6201',30,'2026-10-05')];r=api.marketValueComparison(pos,stale,prior);assert.equal(r.ok,true);assert.equal(r.difference,20);assert.equal(r.currentValue,720);assert.equal(r.previousValue,700);assert.equal(r.carried.length,1);assert.equal(r.carried[0].currentDate,'2026-10-05');assert.match(api.marketValueChangeHTML(pos,stale,prior),/沿用舊報價/);assert.match(api.marketValueChangeHTML(pos,stale,prior),/不代表已確認/);
// Current missing quotes are never replaced with zero, nor silently added to the main market value.
r=api.marketValueComparison(pos,[current[0]],prior);assert.equal(r.ok,true);assert.equal(r.excluded.length,1);assert.equal(r.currentValue,120);
assert.equal(api.marketValueComparison(pos,current,current).ok,false);assert.equal(api.marketValueComparison([],current,prior).ok,false);assert.equal(api.marketValueComparison(pos,current,[]).ok,false);
const monday=current.map(q=>({...q,price_date:'2026-10-19'})),friday=prior.map(q=>({...q,price_date:'2026-10-16'}));assert.equal(api.marketValueComparison(pos,monday,friday).priorDate,'2026-10-16');
// Market dates come from the feed, even when every held name is stale.
const allStale=[...stale.map(q=>({...q,price_date:'2026-10-05'})),quote('9999',1,'2026-10-15')];r=api.marketValueComparison(pos,allStale,prior);assert.equal(r.allCarried,true);assert.equal(r.difference,0);assert.equal(r.date,'2026-10-15');assert.match(api.marketValueChangeHTML(pos,allStale,prior),/估值持平/);
// A fresh current quote may use an older observed prior value, with disclosure.
r=api.marketValueComparison(pos,current,[prior[0],{...prior[1],price_date:'2026-10-05'}]);assert.equal(r.difference,120);assert.equal(r.carried[0].priorCarried,true);assert.match(api.marketValueChangeHTML(pos,current,[prior[0],{...prior[1],price_date:'2026-10-05'}]),/前期沿用/);
// An individual action must not block the rest of the portfolio.
const event={ticker:'6201',effective_date:'2026-10-15',status:'confirmed'};
let ca=create([event]);r=ca.marketValueComparison(pos,current,prior);assert.equal(r.ok,true);assert.equal(r.comparedCount,1);assert.equal(r.difference,20);assert.match(r.excluded[0].reason,/跨股本異動/);
ca=create([{...event,status:'pending'}]);r=ca.marketValueComparison(pos,current,prior);assert.equal(r.excluded[0].reason,'股本異動尚待確認');assert.equal(r.comparedCount,1);
ca=create([{...event,effective_date:'2026-11-16',status:'pending'}]);assert.equal(ca.marketValueComparison(pos,stale,prior).comparedCount,2);
ca=create([event]);assert.equal(ca.marketValueComparison(pos,monday,friday).comparedCount,2);
// A stale prior quote from before the action cannot sneak past a newer global prior date.
r=ca.marketValueComparison(pos,monday,[friday[0],quote('6201',30,'2026-10-05')]);assert.equal(r.comparedCount,1);
assert.equal(create(pos.map(p=>({...event,ticker:p.ticker,status:'pending'}))).marketValueComparison(pos,current,prior).ok,false);
r=api.marketValueComparison(pos,[current[0],quote('6201',0,'2026-10-15')],prior);assert.equal(r.excluded.length,1);
r=api.marketValueComparison(pos,[current[0],quote('6201',30,'2026-11-11')],prior);assert.equal(r.excluded.length,1);
const snapshot=JSON.stringify({pos,current,prior});api.marketValueComparison(pos,current,prior);assert.equal(JSON.stringify({pos,current,prior}),snapshot);
console.log('PASS: per-security comparison, same-share basis, stale-price carry, subset percentages, full missing data, holidays, corporate action isolation, resumed quotes, future/invalid prices and immutable inputs');
