import './portfolio-core.js';
const REPO='leichen1220-rgb/lei-stock',PATH='portfolio.json';
const ORIGIN='https://leichen1220-rgb.github.io';
export function createHandler(env,transport=fetch){
 const fetcher=(url,options={})=>transport(url,{...options,signal:AbortSignal.timeout(20000)});
 const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.headers.get('origin')&&request.headers.get('origin')!==ORIGIN)return respond({error:'Origin denied'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return respond({error:'POST required'},405);
  const auth=request.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(auth))return respond({error:'Login required'},401);
  const url=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY'),owner=env('PUBLIC_PORTFOLIO_OWNER_ID'),token=env('PORTFOLIO_GITHUB_TOKEN');
  if(!url||!key||!owner||!token)return respond({error:'Publisher not configured'},503);
  const dbHeaders={apikey:key,Authorization:auth};
  try{
   const userResponse=await fetcher(url+'/auth/v1/user',{headers:dbHeaders});
   if(!userResponse.ok)return respond({error:'Login expired'},401);
   const user=await userResponse.json();if(user.id!==owner)return respond({error:'Account denied'},403);
   // No client-supplied holdings, path, owner or repository is ever accepted.
   if((await request.text()).trim())return respond({error:'Request body must be empty'},400);
   async function rows(table,select){
    const result=[];for(let offset=0;offset<100000;offset+=500){
     const query=new URLSearchParams({select,owner_id:'eq.'+user.id,order:table==='stock_transactions'?'id.asc':'ticker.asc',limit:'500',offset:String(offset)});
     const response=await fetcher(url+'/rest/v1/'+table+'?'+query,{headers:dbHeaders});
     if(!response.ok)throw Error('Private read failed');const batch=await response.json();
     if(!Array.isArray(batch))throw Error('Invalid private response');result.push(...batch);if(batch.length<500)return result;
    }throw Error('Incomplete private response');
   }
   const ghHeaders={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
   const endpoint='https://api.github.com/repos/'+REPO+'/contents/'+PATH;
   for(let attempt=0;attempt<3;attempt++){
    // Read the file lease BEFORE the current private snapshot; retry conflicts from scratch.
    const current=await fetcher(endpoint+'?ref=main',{headers:ghHeaders});
    if(!current.ok&&current.status!==404)throw Error('Repository read failed');
    const file=current.ok?await current.json():null;
    const [trades,names]=await Promise.all([rows('stock_transactions','ticker,transaction_type,quantity'),rows('stock_tickers','ticker,display_name')]);
    const output=globalThis.LeiPortfolio.publicRows(globalThis.LeiPortfolio.quantities(trades),names);
    const content=JSON.stringify(output,null,2)+'\n';
    const bytes=new TextEncoder().encode(content);let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const encoded=btoa(binary);
    if(file?.content?.replace(/\s/g,'')===encoded)return respond({published:true,changed:false});
    const response=await fetcher(endpoint,{method:'PUT',headers:ghHeaders,body:JSON.stringify({message:'Update public holdings snapshot',content:encoded,branch:'main',...(file?{sha:file.sha}:{})})});
    if(response.ok)return respond({published:true,changed:true});
    if(![409,422].includes(response.status))throw Error('Publication failed');
   }throw Error('Publication conflict');
  }catch{return respond({error:'Publication failed; previous public file retained'},502);}
 };
}
