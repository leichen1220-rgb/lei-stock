const assert=require('node:assert/strict');
const core=require('../supabase/functions/_shared/portfolio-core.js');
const trade=(ticker,quantity,transaction_type='現股')=>({ticker,quantity,transaction_type,price:666,note:'private',owner_id:'private'});
const trades=[trade('2330',100),trade('2330',-5),trade('00981A',0.1),trade('00981A',0.2),trade('006201',10),trade('006201',-10),trade('6201',2),trade('2330',100,'現金股息'),trade('00400A',0.000001)];
const names=['2330','00981A','6201','00400A'].map(ticker=>({ticker,display_name:'股票 '+ticker,email:'private'}));
const out=core.publicRows(core.quantities(trades),names);
assert.deepEqual(out.find(x=>x.code==='00981A'),{code:'00981A',name:'股票 00981A',shares:0.3});
assert.equal(out.find(x=>x.code==='2330').shares,95);
assert.equal(out.find(x=>x.code==='00400A').shares,0.000001);
assert(!out.some(x=>x.code==='006201'));assert(out.some(x=>x.code==='6201'));
assert.deepEqual(core.quantities([trade('2330',0.1),trade('2330',0.2),trade('2330',-0.3)]),[]);
for(const row of out)assert.deepEqual(Object.keys(row),['code','name','shares']);
assert(!JSON.stringify(out).includes('private'));
assert.throws(()=>core.publicRows(core.quantities([trade('2330',-1)]),names));
assert.throws(()=>core.publicRows(core.quantities([trade('2330',1)]),[]));
assert.throws(()=>core.quantities([trade('2330',Infinity)]));
assert.throws(()=>core.quantities([trade('2330','9007199254740993')]));
(async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/publisher.mjs');
 const values={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-key',PUBLIC_PORTFOLIO_OWNER_ID:'owner',PORTFOLIO_GITHUB_TOKEN:'server-secret'};
 const env=k=>values[k];let calls=[],written;
 const fetcher=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email:'private'});
  if(url.includes('/rest/v1/stock_transactions'))return Response.json(trades);
  if(url.includes('/rest/v1/stock_tickers'))return Response.json(names);
  if(options.method==='PUT'){written=JSON.parse(options.body);return Response.json({commit:{sha:'new'}});}
  return new Response('',{status:404});
 };
 const handler=createHandler(env,fetcher);
 const req=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user-jwt',Origin:'https://leichen1220-rgb.github.io'},...(body?{body}:{})});
 assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,401);
 assert.equal(calls.length,0);
 assert.equal((await handler(req('{"owner":"injected"}'))).status,400);
 assert(!written);calls=[];
 const response=await handler(req());assert.equal(response.status,200);assert.deepEqual(await response.json(),{published:true,changed:true});
 const publicContent=Buffer.from(written.content,'base64').toString();assert.deepEqual(JSON.parse(publicContent),out);
 assert(!/private|server-secret|user-jwt|public-key/.test(publicContent));
 for(const call of calls.filter(x=>x.url.includes('/rest/v1/'))){
  const url=new URL(call.url);assert.equal(url.searchParams.get('owner_id'),'eq.owner');
  assert(!url.searchParams.get('select').includes('*'));
  assert.equal(call.options.headers.Authorization,'Bearer user-jwt');
 }
 const denied=createHandler(env,async()=>Response.json({id:'other'}));assert.equal((await denied(req())).status,403);
 assert.equal((await createHandler(()=>undefined,fetcher)(req())).status,503);
 let privateReads=0,puts=0;
 const conflict=createHandler(env,async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'});
  if(url.includes('/rest/v1/stock_transactions')){privateReads++;return Response.json(trades);}
  if(url.includes('/rest/v1/stock_tickers'))return Response.json(names);
  if(options.method==='PUT'){puts++;return puts===1?new Response('',{status:409}):Response.json({});}
  return new Response('',{status:404});
 });
 assert.equal((await conflict(req())).status,200);assert.equal(privateReads,2);
 const unchanged=createHandler(env,async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'});
  if(url.includes('/rest/v1/stock_transactions'))return Response.json(trades);
  if(url.includes('/rest/v1/stock_tickers'))return Response.json(names);
  assert.notEqual(options.method,'PUT');return Response.json({sha:'old',content:written.content});
 });assert.deepEqual(await (await unchanged(req())).json(),{published:true,changed:false});
 console.log('PASS: strict three-field publication, decimals, exact codes, authentication, owner scoping, no private payload, conflict reread and unchanged skip');
})().catch(error=>{console.error(error);process.exitCode=1;});
