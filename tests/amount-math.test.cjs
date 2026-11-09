const assert=require('node:assert/strict'),m=require('../scripts/amount-math.js');
for(const buy of [true,false]){
 const gross='1762.5',fee='1',net=buy?'1763.5':'1761.5';
 for(const blank of ['gross','fee','net']){const v={gross,fee,net};v[blank]='';const r=m.solve(v,buy);assert.equal(r[blank],{gross,fee,net}[blank]);assert.equal(r.derived,blank);}
 assert.equal(m.solve({gross,fee,net},buy).derived,null);
 assert.throws(()=>m.solve({gross,fee,net:'999'},buy));
}
assert.equal(m.add('0.1','0.2'),'0.3');assert.equal(m.multiply('58.75','30'),'1762.5');assert.equal(m.multiply('0.00001','100000'),'1');
assert.equal(m.solve({gross:'100',fee:'0',net:''},false).net,'100');
assert.equal(m.solve({gross:'10',fee:'20',net:''},false).net,'-10');
assert.equal(m.solve({gross:'100',fee:'0',net:'98'},false,'fee').fee,'2');
assert.throws(()=>m.solve({gross:'100',fee:'',net:'110'},false));
assert.throws(()=>m.solve({gross:'100',fee:'',net:'90'},true));
assert.equal(m.solve({gross:'100',fee:'',net:''},true).fee,null);
assert.throws(()=>m.solve({gross:'NaN',fee:'0',net:''},true));
assert.equal(m.add('1e-7','0.0000002'),'0.0000003');assert.equal(m.add('999999.99','0.01'),'1000000');
console.log('PASS: buy/sell/income two-of-three algebra, exact decimal math, explicit zero, negative net receipts, selected overwrite and inconsistent manual values');
