const assert=require('node:assert/strict'),api=require('../scripts/excel-export.js');
const col=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s};
const utils={book_new:()=>({SheetNames:[],Sheets:{}}),aoa_to_sheet:rows=>{const s={};rows.forEach((row,r)=>row.forEach((v,c)=>{if(v!==null&&v!==undefined)s[col(c)+(r+1)]={t:typeof v==='number'?'n':typeof v==='boolean'?'b':'s',v}}));s['!ref']='A1:'+col(Math.max(...rows.map(r=>r.length))-1)+rows.length;return s},json_to_sheet:rows=>{const keys=Object.keys(rows[0]||{});return utils.aoa_to_sheet([keys,...rows.map(r=>keys.map(k=>r[k]))])},book_append_sheet:(wb,s,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=s}};
const buy={id:'buy',ticker:'0056',trade_date:'2026-01-01',transaction_type:'現股',quantity:100,price:20,trade_fees:0,paid_cost:1900,sequence_no:1};
const sale={id:'sale',ticker:'0056',trade_date:'2026-01-02',transaction_type:'現股',quantity:-40,price:30,trade_fees:5,sequence_no:2};
const dividend={id:'div',ticker:'0056',trade_date:'2026-01-03',transaction_type:'現金股息',dividend_gross:100,wire_fee:0,payment_confirmed:true};
const data={trades:[dividend,sale,buy],tickers:[{ticker:'0056',display_name:'Test ETF'}],banks:[],quotes:[{ticker:'0056',close_price:40,price_date:'2026-01-04'}]};
let wb=api.buildWorkbook(data,{utils}),s=wb.Sheets['股票明細'];
assert.equal(s.B2.t,'s');assert.equal(s.B2.v,'0056');assert.equal(s.I2.v,1900);assert.equal(s.H2.v,-100);assert.equal(s.AI2.v,0);
assert.equal(s.I3.v,-1195);assert.equal(s.E4.v,60);assert.equal(s.O4.v,-605);assert.equal(s.P4.v,605/60);assert.equal(s.N4.v,100);assert.equal(s.AC4.v,100);assert.equal(s.T4.v,1795);assert.equal(s.S4.v,40);assert.ok(s.O4.f.includes('SUMIF'));assert.ok(s.E4.f.includes('SUMIF'));assert.equal(s.Z2.v,2026);assert.equal(s.AA2.v,1);assert.equal(s.J2.t,'n');assert.equal(s.J2.z,'yyyy-mm-dd');assert.equal(s['!autofilter'].ref,'A1:AK4');assert.ok(wb.SheetNames.includes('ETF 保管銀行'));
wb=api.buildWorkbook({...data,trades:[buy,{...sale,quantity:-90,price:30,trade_fees:0},dividend]}, {utils});s=wb.Sheets['股票明細'];assert.equal(s.P4.v,0);assert.equal(s.O4.v,900);assert.equal(wb.Sheets['持股總覽'].E2.v,-900);
wb=api.buildWorkbook({...data,trades:[{...buy,paid_cost:null,trade_fees:null}]},{utils});assert.equal(wb.Sheets['股票明細'].O2.v,'待補成本');
wb=api.buildWorkbook({...data,trades:[buy,{...sale,quantity:-100,price:25,trade_fees:5}],quotes:[]},{utils});assert.equal(wb.Sheets['股票明細'].T3.v,595);assert.equal(wb.Sheets['股票明細'].T2.v,'');
console.log('PASS: familiar export preserves refunds, exact codes, dates, net dividends, formulas, recovered costs and missing-cost markers');

const rateWorkbook=api.buildWorkbook({...data,trades:[buy,{...dividend,dividend_gross:320,wire_fee:10,dividend_per_share:0.8,dividend_eligible_shares:400}]}, {utils});
const rateSheet=rateWorkbook.Sheets['股票明細'];
assert.equal(rateSheet.M3.v,0.8);assert.equal(rateSheet.N3.v,310);assert.equal(rateSheet.AJ3.v,400);assert.equal(rateSheet.AK3.v,0.8);
assert(!rateSheet.N3.f.includes('M3'));
