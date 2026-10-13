(function(root){
'use strict';
const present=x=>x!==null&&x!==undefined&&String(x).trim()!=='';
function details(row,transactions){
 if(row.transaction_type!=='現金股息')return {rate:null,shares:null,source:'none'};
 let shares=present(row.dividend_eligible_shares)?Number(row.dividend_eligible_shares):null;
 if(shares===null&&row.trade_date&&row.ticker){
  const sameDayTrade=transactions.some(t=>t.ticker===row.ticker&&t.trade_date===row.trade_date&&t.transaction_type==='現股'&&Number(t.quantity)!==0);
  if(!sameDayTrade){
   shares=transactions.filter(t=>t.ticker===row.ticker&&t.trade_date<row.trade_date&&['現股','股票股利'].includes(t.transaction_type)).reduce((sum,t)=>sum+Number(t.quantity||0),0);
  }
 }
 if(!Number.isFinite(shares)||shares<=0)shares=null;
 if(present(row.dividend_per_share)){
  const rate=Number(row.dividend_per_share);
  return {rate:Number.isFinite(rate)&&rate>=0?rate:null,shares,source:'recorded'};
 }
 const gross=present(row.dividend_gross)?Number(row.dividend_gross):null;
 return {rate:shares&&Number.isFinite(gross)&&gross>=0?gross/shares:null,shares,source:'estimated'};
}
function format(value){return value===null?'—':Number(value).toLocaleString('zh-TW',{maximumFractionDigits:6});}
const api={details,format};root.LeiDividends=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
