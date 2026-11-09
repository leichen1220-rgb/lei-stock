/* Exact decimal arithmetic for the three cash fields. No fees are guessed. */
(function(root){
'use strict';
function decimal(value){const s=String(value).trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)||!Number.isFinite(Number(s)))throw Error('請填寫有效金額');const [m,e='0']=s.toLowerCase().split('e'),negative=m.startsWith('-'),[w,f='']=m.replace(/^[+-]/,'').split('.');let scale=f.length-Number(e),units=BigInt((w||'0')+f)*(negative?-1n:1n);if(Math.abs(scale)>24)throw Error('金額精度超出範圍');if(scale<0){units*=10n**BigInt(-scale);scale=0;}return {units,scale};}
function text(d){let n=d.units;const negative=n<0n;if(negative)n=-n;const digits=n.toString().padStart(d.scale+1,'0');return (negative?'-':'')+(d.scale?(digits.slice(0,-d.scale)+'.'+digits.slice(-d.scale)).replace(/\.?0+$/,''):digits);}
function add(a,b,sign=1){const x=decimal(a),y=decimal(b),scale=Math.max(x.scale,y.scale);return text({units:x.units*10n**BigInt(scale-x.scale)+BigInt(sign)*y.units*10n**BigInt(scale-y.scale),scale});}
function multiply(a,b){const x=decimal(a),y=decimal(b);return text({units:x.units*y.units,scale:x.scale+y.scale});}
const present=x=>x!==null&&x!==undefined&&String(x).trim()!=='';
function solve(values,buy,target='auto'){
 const v=Object.fromEntries(['gross','fee','net'].map(k=>[k,present(values[k])?String(values[k]):null]));
 for(const k of ['gross','fee','net'])if(v[k]!==null){decimal(v[k]);if(k!=='net'&&Number(v[k])<0||buy&&k==='net'&&Number(v[k])<0)throw Error('成交／收入總額與費用不能為負數，買進實付也不能為負數');}
 const blank=Object.keys(v).filter(k=>v[k]===null);let derived=null;
 if(target==='auto'&&blank.length===1)target=blank[0];
 const dependencies={gross:['net','fee'],fee:['gross','net'],net:['gross','fee']};
 if(dependencies[target]?.every(k=>v[k]!==null)){
  v[target]=target==='gross'?add(v.net,v.fee,buy?-1:1):target==='fee'?(buy?add(v.net,v.gross,-1):add(v.gross,v.net,-1)):add(v.gross,v.fee,buy?1:-1);derived=target;
  if(target!=='net'&&Number(v[target])<0||buy&&target==='net'&&Number(v[target])<0)throw Error('計算結果為負數，請核對買賣方向、總額與實際金額');
 }
 if(Object.values(v).every(present)&&Number(add(add(v.gross,v.fee,buy?1:-1),v.net,-1))!==0)throw Error('三項金額不一致；請清空要重算的一項，或選擇「改算」欄位');
 return {...v,derived};
}
const api={add,multiply,solve};root.LeiAmountMath=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
