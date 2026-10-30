/* Pure portfolio calculations. Never writes transaction data. */
(function(root){
'use strict';
const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
function fifoLedger(transactions,cashAmount){
 const states=new Map();
 const ordered=transactions.map((t,i)=>({t,i})).sort((a,b)=>String(a.t.trade_date||'').localeCompare(String(b.t.trade_date||''))||(Number(a.t.sequence_no)||0)-(Number(b.t.sequence_no)||0)||a.i-b.i);
 for(const {t,i} of ordered){
  if(!['現股','股票股利'].includes(t.transaction_type))continue;
  const st=states.get(t.ticker)||{quantity:0,lots:[],valid:true},q=Number(t.quantity);
  if(!present(t.quantity)||!Number.isFinite(q)||q===0){st.valid=false;states.set(t.ticker,st);continue;}
  if(!st.valid){states.set(t.ticker,st);continue;}
  if(t.transaction_type==='股票股利'){
   if(q<=0||st.quantity<=0||Number(t.trade_fees||0)!==0){st.valid=false;}else{const ratio=(st.quantity+q)/st.quantity;st.lots.forEach(l=>l.quantity*=ratio);st.quantity+=q;}
  }else if(q>0){
   const cash=cashAmount(t);if(!cash.valid||cash.amount<0)st.valid=false;
   else{st.lots.push({id:t.id||String(i),date:t.trade_date,quantity:q,cost:cash.amount,estimated:cash.estimated});st.quantity+=q;}
  }else if(-q>st.quantity+1e-6){st.valid=false;}
  else{
   let left=-q;
   for(const lot of st.lots){if(left<=1e-7)break;const take=Math.min(left,lot.quantity),unit=lot.cost/lot.quantity;lot.quantity-=take;lot.cost-=take*unit;left-=take;}
   st.lots=st.lots.filter(l=>l.quantity>1e-7);st.quantity+=q;if(Math.abs(st.quantity)<1e-7)st.quantity=0;
  }
  states.set(t.ticker,st);
 }
 for(const st of states.values())st.highestUnit=st.valid&&st.lots.length?Math.max(...st.lots.map(l=>l.cost/l.quantity)):null;
 return states;
}
function buildRows(transactions,quotes,costStates,cashStates,cashAmount){
 const symbols=new Set(transactions.map(t=>t.ticker)),quantities=new Map(),income=new Map(),quoteMap=new Map(quotes.map(q=>[q.ticker,q])),fifo=fifoLedger(transactions,cashAmount);
 for(const t of transactions){
  if(['現股','股票股利'].includes(t.transaction_type)&&Number.isFinite(Number(t.quantity)))quantities.set(t.ticker,(quantities.get(t.ticker)||0)+Number(t.quantity));
  if(['現金股息','借券收入'].includes(t.transaction_type)){
   const s=income.get(t.ticker)||{dividend:0,lending:0,pending:0,pendingCount:0,valid:true};
   const gross=present(t.dividend_gross)?Number(t.dividend_gross):NaN,fee=present(t.wire_fee)?Number(t.wire_fee):0;
   if(!Number.isFinite(gross)||gross<0||!Number.isFinite(fee)||fee<0)s.valid=false;
   else{const net=gross-fee,confirmed=t.payment_confirmed===true||present(t.wire_fee);
    if(confirmed){if(t.transaction_type==='借券收入')s.lending+=net;else s.dividend+=net;}else{s.pending+=net;s.pendingCount++;}}
   income.set(t.ticker,s);
  }
 }
 return [...symbols].sort((a,b)=>a.localeCompare(b,'zh-TW',{numeric:true})).map(ticker=>{
  const quantity=quantities.get(ticker)||0,cost=costStates.get(ticker),cash=cashStates.get(ticker),i=income.get(ticker)||{dividend:0,lending:0,pending:0,pendingCount:0,valid:true};
  const quote=quoteMap.get(ticker),hasPrice=quote&&Number.isFinite(Number(quote.close_price))&&Number(quote.close_price)>0;
  const market=Math.abs(quantity)<1e-6?0:hasPrice?quantity*Number(quote.close_price):null;
  const costValid=cost?cost.valid&&Math.abs(cost.quantity-quantity)<1e-6:Math.abs(quantity)<1e-6;
  const cashValid=!!cash?.valid&&i.valid&&Math.abs(cash.quantity-quantity)<1e-6;
  const remainingCost=costValid?(cost?.cost||0):null,netInvestment=cashValid?cash.cost+i.pending:null;
  const row={ticker,quantity,quote:hasPrice?quote:null,market,remainingCost,average:remainingCost!==null&&quantity>0?remainingCost/quantity:null,
   realized:costValid?(cost?.realized||0):null,unrealized:market!==null&&remainingCost!==null?market-remainingCost:null,
   dividend:i.dividend,lending:i.lending,income:i.valid?i.dividend+i.lending:null,pendingIncome:i.pending,pendingCount:i.pendingCount,
   netInvestment,total:market!==null&&netInvestment!==null?market-netInvestment:null,costValid,cashValid,cashState:cash,costState:cost,fifo:fifo.get(ticker)};
  return row;
 });
}
function inferKind(ticker){return /^00[0-9]+B$/i.test(ticker)?'bond':/^00/.test(ticker)?'etf':'stock';}
function tick(price,kind){return kind==='etf'||kind==='bond'?(price<50?0.01:0.05):price<10?0.01:price<50?0.05:price<100?0.1:price<500?0.5:price<1000?1:5;}
function ceilPrice(price,kind){
 let cents=Math.max(1,Math.ceil(price*100-1e-7));
 for(let i=0;i<10;i++){const step=Math.round(tick(cents/100,kind)*100),next=Math.ceil((cents-1e-7)/step)*step;if(next===cents)return cents/100;cents=next;}
 throw Error('價格檔位無法計算');
}
function validateFees(f){
 if(![f.rate,f.discount,f.minFee,f.tax].every(v=>Number.isFinite(v)&&v>=0)||f.rate*f.discount+f.tax>=1||!['ceil','round','floor'].includes(f.rounding))throw Error('請填有效費率，手續費加交易稅須小於 100%');
}
function proceeds(price,quantity,fees){
 validateFees(fees);if(!Number.isFinite(price)||price<=0||!Number.isInteger(quantity)||quantity<=0)throw Error('賣價需大於 0，股數需為正整數');
 const round=Math[fees.rounding],gross=price*quantity,commission=Math.max(fees.minFee,round(gross*fees.rate*fees.discount)),tax=round(gross*fees.tax);
 return {gross,commission,tax,net:gross-commission-tax};
}
function purchase(price,quantity,fees){
 // Buy estimates use commission only; sell-side tax settings are irrelevant.
 validateFees({...fees,tax:0});
 if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(quantity)||quantity<0)throw Error('買價需大於 0，股數需為非負整數');
 const gross=price*quantity;
 if(!Number.isFinite(gross)||gross>Number.MAX_SAFE_INTEGER)throw Error('買入金額超出試算範圍');
 const commission=quantity===0?0:Math.max(fees.minFee,Math[fees.rounding](gross*fees.rate*fees.discount));
 return {quantity,gross,commission,tax:0,total:gross+commission,average:quantity?((gross+commission)/quantity):null};
}
function affordablePurchase(price,budget,fees){
 purchase(price,0,fees);
 if(!Number.isFinite(budget)||budget<0||budget>Number.MAX_SAFE_INTEGER)throw Error('請填寫有效的非負預算');
 let low=0,high=Math.floor(budget/price);
 if(!Number.isSafeInteger(high))throw Error('股數超出試算範圍');
 while(low<high){const mid=low+Math.ceil((high-low)/2);if(purchase(price,mid,fees).total<=budget+1e-7)low=mid;else high=mid-1;}
 const result=purchase(price,low,fees);
 return {...result,budget,remaining:Math.max(0,budget-result.total)};
}
function breakEven(target,quantity,fees,kind){
 validateFees(fees);if(!Number.isFinite(target)||!Number.isInteger(quantity)||quantity<=0)return null;
 // Both fee rounding errors are less than one dollar; start at a proven lower bound.
 const r=fees.rate*fees.discount,t=fees.tax;
 const lower=Math.max(0.01,(target-2)/(quantity*(1-r-t)),(target+fees.minFee-1)/(quantity*(1-t)));
 let price=ceilPrice(lower,kind);
 for(let i=0;i<100000;i++){
  if(proceeds(price,quantity,fees).net+1e-7>=target)return price;
  price=ceilPrice(price+tick(price,kind),kind);
 }
 throw Error('回本價超出試算範圍');
}
function simulate(row,quantity,price,fees,kind){
 if(!Number.isInteger(quantity)||quantity<=0||quantity>row.quantity+1e-6)throw Error('賣出股數需為正整數，且不得超過現有股數');
 const sale=proceeds(price,quantity,fees),remaining=Math.max(0,row.quantity-quantity);
 const assigned=row.average===null?null:row.average*quantity;
 const remainingMarket=remaining===0?0:row.quote?remaining*Number(row.quote.close_price):null;
 const totalTarget=row.netInvestment!==null&&remainingMarket!==null?row.netInvestment-remainingMarket:null;
 const highest=row.fifo?.valid&&Math.abs(row.fifo.quantity-row.quantity)<1e-6?row.fifo.highestUnit:null;
 return {...sale,quantity,remaining,remainingMarket,assigned,
  saleProfit:assigned===null?null:sale.net-assigned,
  totalAfter:row.netInvestment!==null&&remainingMarket!==null?sale.net+remainingMarket-row.netInvestment:null,
  holdingBreak:assigned===null?null:breakEven(assigned,quantity,fees,kind),
  totalBreak:totalTarget===null?null:breakEven(totalTarget,quantity,fees,kind),
  everyLotBreak:highest===null?null:breakEven(highest*quantity+0.01,quantity,fees,kind),
  highestUnit:highest};
}
const api={fifoLedger,buildRows,inferKind,tick,ceilPrice,proceeds,purchase,affordablePurchase,breakEven,simulate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeiWorkbench=api;
})(typeof window==='undefined'?globalThis:window);

