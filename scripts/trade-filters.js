(function(root){
 'use strict';
 const fields=[['trade_date','成交／除權息日','date'],['year','年份','number'],['month','月份','number'],['ticker','代號','text'],['name','股票名稱','text'],['transaction_type','交易別','text'],['quantity','股數','number'],['price','成交價','number'],['trade_fees','交易費用','number'],['paid_cost','實付買入成本','number'],['dividend_per_share','每股配息（記錄）','number'],['dividend_eligible_shares','配息股數（記錄）','number'],['dividend_gross','股息總額（扣匯費前）','number'],['dividend_net','實領股息','number'],['wire_fee','匯費','number'],['payment_date','預計入帳日','date'],['payment_state','入帳狀態','text'],['note','備註','text']].map(([key,label,type])=>({key,label,type}));
 const empty=v=>v===null||v===undefined||String(v).trim()==='';
 const text=v=>String(v??'').normalize('NFKC').toLocaleUpperCase('zh-TW');
 function valueOf(t,key,nameOf){if(key==='dividend_net')return t.transaction_type==='現金股息'&&!empty(t.dividend_gross)&&!empty(t.wire_fee)?Number((Number(t.dividend_gross)-Number(t.wire_fee)).toPrecision(15)):null;if(key==='name')return nameOf(t.ticker);if(key==='year')return t.trade_date?Number(t.trade_date.slice(0,4)):null;if(key==='month')return t.trade_date?Number(t.trade_date.slice(5,7)):null;if(key==='payment_state')return t.transaction_type==='現金股息'?(t.payment_confirmed?'已確認':'待確認'):null;return t[key];}
 function activeRule(rule){return ['blank','notblank','in','notin'].includes(rule.op)||!empty(rule.value);}
 function matchesRule(t,rule,nameOf){
  const field=fields.find(f=>f.key===rule.field);if(!field||!activeRule(rule))return true;
  const raw=valueOf(t,rule.field,nameOf);if(rule.op==='blank')return empty(raw);if(rule.op==='notblank')return !empty(raw);
  if(rule.op==='in'||rule.op==='notin'){const included=(rule.values||[]).some(v=>text(v)===text(raw));return rule.op==='in'?included:!included;}
  if(empty(raw))return false;
  const a=field.type==='number'?Number(raw):field.type==='date'?String(raw):text(raw),b=field.type==='number'?Number(rule.value):field.type==='date'?String(rule.value):text(rule.value);
  if(field.type==='number'&&(!Number.isFinite(a)||!Number.isFinite(b)))return false;
  if(rule.op==='contains')return text(raw).includes(text(rule.value));if(rule.op==='notcontains')return !text(raw).includes(text(rule.value));if(rule.op==='starts')return text(raw).startsWith(text(rule.value));if(rule.op==='ends')return text(raw).endsWith(text(rule.value));
  if(rule.op==='eq')return a===b;if(rule.op==='neq')return a!==b;if(rule.op==='gt')return a>b;if(rule.op==='gte')return a>=b;if(rule.op==='lt')return a<b;if(rule.op==='lte')return a<=b;
  if(rule.op==='between'){if(empty(rule.value2))return false;const c=field.type==='number'?Number(rule.value2):String(rule.value2);if(field.type==='number'&&!Number.isFinite(c))return false;return a>=b&&a<=c;}
  return false;
 }
 function apply(rows,state,nameOf){
  const rules=(state.rules||[]).filter(activeRule),query=text(state.query||''),sortField=fields.find(f=>f.key===state.sort)||fields[0],direction=state.direction==='asc'?1:-1;
  return rows.map((t,index)=>({t,index})).filter(({t})=>{
   if(query&&!text([t.ticker,nameOf(t.ticker),t.note].join(' ')).includes(query))return false;
   return !rules.length||(state.mode==='any'?rules.some(rule=>matchesRule(t,rule,nameOf)):rules.every(rule=>matchesRule(t,rule,nameOf)));
  }).sort((a,b)=>{
   const av=valueOf(a.t,sortField.key,nameOf),bv=valueOf(b.t,sortField.key,nameOf);if(empty(av)!==empty(bv))return empty(av)?1:-1;
   const cmp=empty(av)?0:sortField.type==='number'?Number(av)-Number(bv):String(av).localeCompare(String(bv),'zh-TW');
   return direction*(cmp||(Number(a.t.sequence_no)||0)-(Number(b.t.sequence_no)||0)||a.index-b.index);
  }).map(x=>x.t);
 }
 function choices(rows,key,nameOf){return [...new Set(rows.map(t=>valueOf(t,key,nameOf)).filter(v=>!empty(v)).map(String))].sort((a,b)=>a.localeCompare(b,'zh-TW',{numeric:key==='year'||key==='month'}));}
 const api={fields,valueOf,activeRule,matchesRule,apply,choices};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeiTradeFilters=api;
})(typeof window==='undefined'?globalThis:window);
