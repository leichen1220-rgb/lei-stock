/* Corporate actions are separate records. Original executions are never rewritten. */
(function(root){
'use strict';
const labels={subscription:'現金增資認購',cash_reduction:'現金減資',loss_reduction:'彌補虧損減資',split:'分割',reverse_split:'反分割／併股'};
const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const number=(a,key)=>present(a[key])?Number(a[key]):NaN;
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
function validate(a,confirmed=a.status==='confirmed'){
 if(!labels[a.kind])throw Error('未知的股本異動類型');
 if(!/^[0-9A-Z]{4,10}$/.test(a.ticker||''))throw Error('請填寫完整股票代號');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a.effective_date||'')||!Number.isFinite(Date.parse(a.effective_date))||new Date(a.effective_date+'T00:00:00Z').toISOString().slice(0,10)!==a.effective_date)throw Error('請填寫有效生效日');
 if(!['pending','confirmed'].includes(a.status)||!['before','after'].includes(a.timing)||!Number.isSafeInteger(Number(a.event_order))||Number(a.event_order)<0)throw Error('事件狀態或順序無效');
 if(!confirmed)return a;
 const before=number(a,'before_quantity'),after=number(a,'after_quantity'),fraction=number(a,'fractional_quantity');
 if(!Number.isFinite(before)||before<0||!Number.isSafeInteger(after)||after<0||!Number.isFinite(fraction)||fraction<0||fraction>=1)throw Error('請填寫異動前股數、實際整股數及不足 1 股的畸零股數');
 if(a.kind==='subscription'){
  if(!Number.isSafeInteger(number(a,'subscribed_quantity'))||number(a,'subscribed_quantity')<=0||Math.abs(after-before-number(a,'subscribed_quantity'))>1e-7||!Number.isFinite(number(a,'subscription_cost'))||number(a,'subscription_cost')<0)throw Error('認購股數、含費實付金額或異動後股數不符');
  if(fraction!==0||['principal_cash','fractional_cash','fees'].some(k=>number(a,k)!==0))throw Error('增資認購費用請併入含費實付金額');
 }else{
  if(before<=0||after+fraction<=0)throw Error('異動前後股數必須大於 0');
  if(['cash_reduction','loss_reduction','reverse_split'].includes(a.kind)&&after+fraction>=before)throw Error('減資／併股後股數應小於原股數');
  if(a.kind==='split'&&after+fraction<=before)throw Error('分割後股數應大於原股數');
  for(const k of ['principal_cash','fractional_cash','fees'])if(!Number.isFinite(number(a,k))||number(a,k)<0)throw Error('請填寫實際退款、畸零股款及費用；沒有請填 0');
  if(a.kind!=='cash_reduction'&&number(a,'principal_cash')!==0)throw Error('只有現金減資可記退回本金');
  if(fraction===0&&number(a,'fractional_cash')!==0)throw Error('有畸零股款時請填畸零股數');
 }
 return a;
}
function timeline(trades,actions=[],asOf=day()){
 const active=actions.filter(a=>a.status==='confirmed'&&a.effective_date<=asOf).map(a=>{validate(a);return {id:'action:'+a.id,ticker:a.ticker,trade_date:a.effective_date,transaction_type:'股本異動',action:a};});
 return [...trades,...active].map((t,i)=>({t,i})).sort((a,b)=>String(a.t.trade_date||'').localeCompare(String(b.t.trade_date||''))||rank(a.t)-rank(b.t)||(Number(a.t.action?.event_order??a.t.sequence_no)||0)-(Number(b.t.action?.event_order??b.t.sequence_no)||0)||String(a.t.action?.id||'').localeCompare(String(b.t.action?.id||''))||a.i-b.i).map(x=>x.t);
}
function rank(t){return t.action?(t.action.timing==='before'?-1:1):0;}
function checkQuantity(quantity,a){validate(a);if(Math.abs(quantity-Number(a.before_quantity))>1e-6)throw Error(a.ticker+' '+a.effective_date+' 異動前庫存與紀錄不符，請核對同日順序及交易');}
function transform(quantity,cost,a){
 checkQuantity(quantity,a);
 if(a.kind==='subscription')return {quantity:Number(a.after_quantity),cost:cost+Number(a.subscription_cost),other:0,netOutlay:Number(a.subscription_cost),receivable:0};
 const principal=Number(a.principal_cash),after=Number(a.after_quantity),fraction=Number(a.fractional_quantity),fractionCash=Number(a.fractional_cash),fees=Number(a.fees);
 const excess=Math.max(0,principal-cost),basis=Math.max(0,cost-principal),oddCost=basis*fraction/(after+fraction);
 return {quantity:after,cost:basis-oddCost,other:excess+fractionCash-oddCost-fees,netOutlay:fees-principal-fractionCash,receivable:a.cash_received?0:principal+fractionCash-fees};
}
function adjustLots(st,a){
 checkQuantity(st.quantity,a);
 if(a.kind==='subscription'){st.lots.push({id:'action:'+a.id,date:a.effective_date,quantity:Number(a.subscribed_quantity),cost:Number(a.subscription_cost),estimated:false});}
 else{
  const before=st.quantity,after=Number(a.after_quantity),principal=Number(a.principal_cash),total=st.lots.reduce((s,l)=>s+l.cost,0),basis=Math.max(0,total-principal),fraction=Number(a.fractional_quantity);
  st.lots.forEach(l=>{const weight=l.quantity/before;l.quantity=after*weight;l.cost=basis===0?0:(l.cost-principal*weight)*after/(after+fraction);});
  st.lots=st.lots.filter(l=>l.quantity>1e-9);
 }
 st.quantity=Number(a.after_quantity);return st;
}
function quantities(trades,actions=[],asOf=day()){
 const q=new Map();
 for(const t of timeline(trades,actions,asOf)){
  if(t.action){checkQuantity(q.get(t.ticker)||0,t.action);q.set(t.ticker,Number(t.action.after_quantity));}
  else if(['現股','股票股利'].includes(t.transaction_type))q.set(t.ticker,(q.get(t.ticker)||0)+Number(t.quantity));
 }
 return [...q].map(([ticker,quantity])=>({ticker,quantity}));
}
function blocked(actions,asOf=day()){return new Set(actions.filter(a=>a.status==='pending'&&a.effective_date<=asOf).map(a=>a.ticker));}
function usableQuotes(quotes,actions,asOf=day()){
 const pending=blocked(actions,asOf),last=new Map();for(const a of actions)if(a.status==='confirmed'&&a.effective_date<=asOf)last.set(a.ticker,[last.get(a.ticker)||'',a.effective_date].sort().at(-1));
 return quotes.filter(q=>!pending.has(q.ticker)&&(!last.has(q.ticker)||q.price_date>=last.get(q.ticker)));
}
const api={labels,validate,timeline,transform,adjustLots,quantities,blocked,usableQuotes,day};root.LeiCorporateActions=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
