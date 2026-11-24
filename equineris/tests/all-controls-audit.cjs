'use strict';
// Read-only census of rendered buttons and links. Browser profile is disposable.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.resolve(__dirname,'..');
const pages=fs.readdirSync(root).filter(n=>n.endsWith('.html')).sort();
const additional=[
 ...Array.from({length:12},(_,i)=>'learning.html?week='+(i+1)),
 ...[1,2,3].map(i=>'record.html?stage='+i),
 'record.html?stage=history','record.html?stage=1&mode=record-only',
 'food-groups.html?from=learning&week=3&card=1',
 'point-allocation.html?from=learning&week=3&card=1',
 'maintenance-energy.html?from=learning&week=12&card=2',
 'textbook.html#s1-c1','textbook.html#s3-c1','textbook.html#s6-c14'
];
const candidate=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','google-chrome','chromium'].filter(Boolean);
const exe=candidate.find(p=>!p.includes('/')||fs.existsSync(p));
if(!exe)throw Error('Chrome is required for the button audit');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'equi-control-audit-')),port=9453;
const chrome=cp.spawn(exe,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--allow-file-access-from-files',
 '--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+tmp,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';chrome.stderr.on('data',x=>stderr+=String(x).slice(-500));
const fetchTabs=()=>new Promise((resolve,reject)=>http.get('http://127.0.0.1:'+port+'/json/list',res=>{
 let s='';res.on('data',x=>s+=x);res.on('end',()=>{try{resolve(JSON.parse(s))}catch(e){reject(e)}});
}).on('error',reject));
async function ready(fn){for(let i=0;i<300;i++){if(chrome.exitCode!==null)throw Error('Chrome exited: '+stderr);try{let r=await fn();if(r)return r}catch(e){}await sleep(100)}throw Error('Chrome startup timeout')}
function install(){
 const map=new WeakMap();window.__auditListeners=map;
 const orig=EventTarget.prototype.addEventListener;
 EventTarget.prototype.addEventListener=function(type,handler,...opts){
  if(['click','submit','change','input','pointerup','touchend'].includes(type)){
   let set=map.get(this);if(!set){set=new Set;map.set(this,set)}set.add(type);
  }
  return orig.call(this,type,handler,...opts);
 };
}
function inspect(){
 const controls=[...document.querySelectorAll('button,input[type=button],input[type=submit],a[href],[role=button]')];
 const map=window.__auditListeners;
 const visible=e=>{
  const st=getComputedStyle(e),rect=e.getBoundingClientRect();
  return st.display!=='none'&&st.visibility!=='hidden'&&rect.width>=1&&rect.height>=1&&!e.closest('[hidden],dialog:not([open])');
 };
 const items=controls.map(e=>{
  const rect=e.getBoundingClientRect();
  const isButton=e.matches('button,input[type=button],input[type=submit],[role=button]:not(a)');
  const events=new Set;
  for(let p=e;p;p=p.parentNode)for(const x of map?.get(p)||[])events.add(x);
  for(const x of map?.get(document)||[])events.add(x);
  const label=(e.getAttribute('aria-label')||e.textContent||e.value||e.title||'').replace(/\s+/g,' ').trim().slice(0,100);
  const form=e.closest('form');
  let obstacle='';
  if(visible(e)&&rect.y>=0&&rect.y<innerHeight){
   const hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,rect.left+rect.width/2)),Math.max(0,Math.min(innerHeight-1,rect.top+rect.height/2)));
   if(hit&&!e.contains(hit)&&hit!==e)obstacle=hit.tagName+'#'+hit.id;
  }
  return {tag:e.tagName,id:e.id||'',label,href:e.getAttribute('href'),isButton,disabled:!!e.disabled,
   visible:!!visible(e),hasHandler:!!e.onclick,events:[...events],form:!!form,obstacle,y:Math.round(rect.y)};
 });
 const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
 return {title:document.title,items,duplicateIds:ids.filter((v,i)=>ids.indexOf(v)!==i)};
}
(async()=>{
 const tab=await ready(async()=>{const t=await fetchTabs();return t.find(x=>x.type==='page'&&x.webSocketDebuggerUrl)});
 const ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 let id=0,currentRoute='',errors=[];
 const pending=new Map();
 ws.addEventListener('message',evt=>{
  const m=JSON.parse(evt.data);
  if(m.method==='Runtime.exceptionThrown'){errors.push({route:currentRoute,detail:m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text});return}
  const p=pending.get(m.id);if(!p)return;
  pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);
 });
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 await cdp('Page.enable');await cdp('Runtime.enable');
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'('+install.toString()+')()'});
 let totalButtons=0,totalLinks=0,visibleButtons=0,visibleLinks=0;
 const missing=[],unwired=[],obstacles=[],rows=[];
 for(const width of [390,320]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:true});
  for(const route of [...pages,...additional]){
   currentRoute=route;
   const page=route.split(/[?#]/)[0];
   const url=pathToFileURL(path.join(root,page)).href+route.slice(page.length);
   const before=errors.length;
   await cdp('Page.navigate',{url});await sleep(165);
   const info=await evaluate('('+inspect.toString()+')()');
   if(info.duplicateIds.length)errors.push({route,detail:'Duplicate DOM IDs: '+info.duplicateIds.join(',')});
   for(const el of info.items){
    if(el.isButton){
     totalButtons++;if(el.visible)visibleButtons++;
     if(el.visible&&!el.disabled&&!el.hasHandler&&!el.form&&!el.events.some(x=>['click','submit','pointerup','touchend'].includes(x)))
      unwired.push({route,width,id:el.id,label:el.label});
     if(el.visible&&!el.label)unwired.push({route,width,id:el.id,label:'NO ACCESSIBLE NAME'});
    }else{
     totalLinks++;if(el.visible)visibleLinks++;
     const href=el.href||'';
     if(href&&!/^(https?:|mailto:|tel:|\/\/|data:|javascript:)/i.test(href)){
      try{
       const target=new URL(href,url);
       if(target.protocol==='file:'&&!fs.existsSync(decodeURIComponent(target.pathname)))
        missing.push({route,width,label:el.label,href});
      }catch(e){missing.push({route,width,label:el.label,href,error:String(e.message)})}
     }
    }
    if(el.obstacle&&el.visible&&!el.disabled)obstacles.push({route,width,id:el.id,label:el.label,obstacle:el.obstacle});
   }
   rows.push({route,width,buttons:info.items.filter(x=>x.isButton).length,
    links:info.items.filter(x=>!x.isButton).length,visible:info.items.filter(x=>x.visible).length,
    disabled:info.items.filter(x=>x.isButton&&x.disabled).map(x=>x.label),exceptions:errors.length-before});
  }
 }
 currentRoute='food-groups.html?from=learning&week=3&card=1';
 await cdp('Page.navigate',{url:pathToFileURL(path.join(root,'food-groups.html')).href+'?from=learning&week=3&card=1'});
 await sleep(160);
 const group4=await evaluate("(()=>{document.querySelector('[data-tab=\"3\"]').click();const n=document.getElementById('groupNext');return {counter:document.getElementById('groupCounter').textContent,disabled:n.disabled,href:document.getElementById('pointAllocationLink').href}})()");
 if(group4.counter.trim()!=='4 / 4'||group4.disabled||!group4.href.includes('from=learning&week=3&card=1'))
  errors.push({route:currentRoute,detail:'Group 4 Next failed: '+JSON.stringify(group4)});
 const dedupe=(a,keys)=>[...new Map(a.map(x=>[keys.map(k=>x[k]).join('|'),x])).values()];
 const broken=dedupe(missing,['route','href']),dead=dedupe(unwired,['route','id','label']),blocked=dedupe(obstacles,['route','id','obstacle']);
 for(const row of rows.filter(x=>x.width===390))console.log('CONTROL_PAGE',JSON.stringify(row));
 console.log('CONTROL_TOTAL',JSON.stringify({htmlPages:pages.length,routeVariants:pages.length+additional.length,
  checkedWidths:[390,320],totalButtons,visibleButtons,totalLinks,visibleLinks,missingLinks:broken.length,
  unwiredButtons:dead.length,obscuredControls:blocked.length,runtimeExceptions:errors.length,group4}));
 for(const row of broken)console.log('BROKEN_LINK',JSON.stringify(row));
 for(const row of dead)console.log('POSSIBLY_UNWIRED',JSON.stringify(row));
 for(const row of blocked)console.log('POSSIBLY_OBSCURED',JSON.stringify(row));
 for(const row of errors)console.log('CONTROL_ERROR',JSON.stringify(row));
 if(broken.length||errors.length)process.exitCode=1;
 ws.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>chrome.kill('SIGTERM'));
