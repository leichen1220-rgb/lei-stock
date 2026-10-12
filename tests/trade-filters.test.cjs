const assert=require('node:assert/strict'),f=require('../scripts/trade-filters.js');
const rows=[
 {id:'a',ticker:'0056',trade_date:'2025-01-01',transaction_type:'現股',quantity:100,price:30,trade_fees:0,note:'long term',sequence_no:1},
 {id:'b',ticker:'0056',trade_date:'2026-01-01',transaction_type:'現金股息',dividend_gross:100,wire_fee:null,payment_confirmed:false,sequence_no:2},
 {id:'c',ticker:'0056',trade_date:'2026-02-01',transaction_type:'現金股息',dividend_gross:200,wire_fee:0,payment_confirmed:true,sequence_no:3},
 {id:'d',ticker:'2330',trade_date:'2026-02-01',transaction_type:'現股',quantity:-20,price:500,trade_fees:2,note:'sold',sequence_no:4},
 {id:'e',ticker:'006201',trade_date:'2026-03-01',transaction_type:'股票股利',quantity:5},
 {id:'f',ticker:'6201',trade_date:'2026-03-01',transaction_type:'現股',quantity:10,price:20,trade_fees:1}
];
const names=t=>({'0056':'元大高股息','2330':'台積電'}[t]||t),rule=(field,op,value,value2)=>({field,op,value,value2});
const result=(rules,extra={})=>f.apply(rows,{rules,mode:'all',sort:'trade_date',direction:'desc',...extra},names).map(t=>t.id);
assert.deepEqual(result([rule('year','eq','2026'),rule('transaction_type','eq','現金股息'),rule('wire_fee','blank')]),['b']);
assert.deepEqual(result([rule('wire_fee','eq','0')]),['c']);
assert.deepEqual(result([rule('wire_fee','notblank')]),['c']);
assert.deepEqual(result([rule('quantity','lt','0')]),['d']);
assert.deepEqual(result([rule('ticker','eq','6201')]),['f']);
assert.deepEqual(result([{field:'ticker',op:'in',values:['0056','2330']}]),['d','c','b','a']);
assert.deepEqual(result([{field:'ticker',op:'in',values:[]}]),[]);
assert.deepEqual(result([rule('trade_date','between','2026-01-01','2026-02-01')]),['d','c','b']);
assert.deepEqual(result([rule('dividend_gross','between','100','200')]),['c','b']);
assert.deepEqual(result([rule('ticker','eq','2330'),rule('year','eq','2025')],{mode:'any'}),['d','a']);
assert.deepEqual(result([rule('quantity','gt','0')],{query:'0056'}),['a']);
assert.deepEqual(result([rule('note','notcontains','sold')]),['a']);
assert.deepEqual(result([rule('payment_state','eq','待確認')]),['b']);
assert.deepEqual(result([],{sort:'quantity',direction:'desc'}),['a','f','e','d','c','b']);
assert.equal(f.activeRule(rule('quantity','eq',0)),true);
const original=JSON.stringify(rows);result([rule('quantity','gt','0')]);assert.equal(JSON.stringify(rows),original);
console.log('PASS: combined/OR filters, zero versus blank, dates, multiselect, exact ETF codes, account flags, sorting and immutable data');
