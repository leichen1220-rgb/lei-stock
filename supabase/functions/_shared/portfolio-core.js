/* Shared by the signed-in overview and the authenticated publisher. */
(function(root){
'use strict';
function decimal(value){
 const text=String(value??0);if(!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text))throw Error('Invalid shares');
 if(!Number.isFinite(Number(text)))throw Error('Invalid shares');
 const [mantissa,exponent='0']=text.toLowerCase().split('e'),negative=mantissa.startsWith('-');
 const [whole,fraction='']=mantissa.replace(/^-/, '').split('.');
 let scale=fraction.length-Number(exponent),units=BigInt(whole+fraction)*(negative?-1n:1n);
 if(Math.abs(scale)>30)throw Error('Unsupported shares precision');
 if(scale<0){units*=10n**BigInt(-scale);scale=0;}return {units,scale};
}
function quantities(transactions){
 const sums=new Map();for(const row of transactions){
  if(!['現股','股票股利'].includes(row.transaction_type))continue;
  const code=row.ticker;if(typeof code!=='string'||! /^[0-9A-Za-z]{4,10}$/.test(code))throw Error('Invalid code');
  const next=decimal(row.quantity),old=sums.get(code)||{units:0n,scale:0},scale=Math.max(next.scale,old.scale);
  sums.set(code,{units:old.units*10n**BigInt(scale-old.scale)+next.units*10n**BigInt(scale-next.scale),scale});
 }
 return [...sums].filter(([,q])=>q.units!==0n).map(([ticker,q])=>{
  const digits=(q.units<0n?-q.units:q.units).toString().padStart(q.scale+1,'0');
  const exact=(q.units<0n?'-':'')+(q.scale?digits.slice(0,-q.scale)+'.'+digits.slice(-q.scale):digits);
  const value=Number(exact);if(!Number.isFinite(value)||value===0)throw Error('Invalid shares');
  const check=decimal(value),scale=Math.max(check.scale,q.scale);
  if(check.units*10n**BigInt(scale-check.scale)!==q.units*10n**BigInt(scale-q.scale))throw Error('Shares exceed JSON number precision');
  return {ticker,quantity:value};
 }).sort((a,b)=>a.ticker.localeCompare(b.ticker));
}
function publicRows(holdings,names){
 const lookup=new Map(names.map(row=>[row.ticker,row.display_name]));
 return holdings.filter(row=>row.quantity!==0).map(row=>{
  if(!/^[0-9A-Za-z]{4,10}$/.test(row.ticker)||!Number.isFinite(row.quantity)||row.quantity<0)throw Error('Invalid holdings; publication stopped');
  const name=lookup.get(row.ticker);if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('Missing stock name; publication stopped');
  return {code:row.ticker,name,shares:row.quantity};
 });
}
const api={quantities,publicRows};root.LeiPortfolio=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
