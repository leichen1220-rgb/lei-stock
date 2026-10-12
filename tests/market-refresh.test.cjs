const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function decodeMarketFeed('),html.indexOf('\nfunction hasFilledWireFee'));
const feed=(date,price=10)=>({schema_version:1,sources:{TWSE:{price_date:date,status:'ok'},TPEX:{price_date:date,status:'ok'}},quotes:Array.from({length:100},(_,i)=>({ticker:String(1000+i),price_date:date,close_price:price,market:'TWSE'}))});
let remote=feed('2026-10-08'),fail=false,rendered=0;const cache=new Map(),nodes={refreshPrices:{},priceRefreshResult:{classList:{toggle(){},add(){}}}};
const ctx={marketQuotes:remote.quotes.slice(),marketPriceMessage:'',officialPriceFeed:'https://example.test/quotes',prices:[],trades:[],today:()=> '2026-10-12',$:id=>nodes[id],AbortController,setTimeout,clearTimeout,Date,localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},fetch:async()=>{if(fail)throw Error('network');return {ok:true,json:async()=>remote}},renderOverview:()=>rendered++};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
 await ctx.refreshClosingPrices();assert.match(nodes.priceRefreshResult.textContent,/沒有新報價/);assert.match(nodes.priceRefreshResult.textContent,/2026-10-08/);assert.equal(nodes.refreshPrices.disabled,false);
 remote=feed('2026-10-12',11);await ctx.refreshClosingPrices();assert.match(nodes.priceRefreshResult.textContent,/已更新 100 檔/);assert.equal(ctx.marketQuotes[0].close_price,11);
 remote=feed('2026-10-08',9);await ctx.refreshClosingPrices();assert.equal(ctx.marketQuotes[0].price_date,'2026-10-12');assert.equal(ctx.marketQuotes[0].close_price,11);
 fail=true;await ctx.refreshClosingPrices();assert.match(nodes.priceRefreshResult.textContent,/連線失敗/);assert.match(nodes.priceRefreshResult.textContent,/2026-10-12/);assert.equal(ctx.marketQuotes[0].close_price,11);
 cache.clear();await ctx.refreshClosingPrices();assert.match(nodes.priceRefreshResult.textContent,/保留原有資料/);assert.equal(ctx.marketQuotes.length,100);assert.equal(nodes.refreshPrices.disabled,false);assert.equal(rendered,5);
 const overview=html.slice(html.indexOf('<section id="overview"'),html.indexOf('<section id="dividends"'));
 assert.ok(overview.includes('id="refreshPrices"'));assert.equal((html.match(/id="refreshPrices"/g)||[]).length,1);
 console.log('PASS: refresh feedback distinguishes new, unchanged and failed reads; old responses cannot regress prices; button lives in overview');
})().catch(err=>{console.error(err);process.exitCode=1});
