'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','google-chrome','chromium'].filter(Boolean);
const executable=candidates.find(x=>!x.includes('/')||fs.existsSync(x));
const port=9389,temp=fs.mkdtempSync(path.join(os.tmpdir(),'equineris-browser-'));
const chrome=cp.spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--allow-file-access-from-files','--remote-allow-origins=*','--remote-debugging-port='+port,
 '--user-data-dir='+temp,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';chrome.stderr.on('data',x=>stderr+=String(x).slice(-500));
const fetchPages=()=>new Promise((resolve,reject)=>{
 http.get('http://127.0.0.1:'+port+'/json/list',res=>{
  let body='';res.on('data',x=>body+=x);res.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});
 }).on('error',reject);
});
const ready=async(fn)=>{
 for(let i=0;i<100;i++){try{const result=await fn();if(result)return result;}catch(e){}await sleep(100);}
 throw Error('Browser not ready: '+stderr.slice(-500));
};
(async()=>{
 const tabs=await ready(async()=>{const list=await fetchPages();return list.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);});
 const ws=new WebSocket(tabs.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let id=0;const pending=new Map();
 ws.addEventListener('message',evt=>{
  const msg=JSON.parse(evt.data),p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);
  if(msg.error)p.reject(Error(msg.error.message));else p.resolve(msg.result);
 });
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{
  const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));
 });
 const evalJS=async code=>{
  const reply=await cdp('Runtime.evaluate',{expression:code,returnByValue:true});
  if(reply.exceptionDetails)throw Error(reply.exceptionDetails.text);
  return reply.result.value;
 };
 await cdp('Page.enable');

 const cases=['index.html','program-intro.html','setup.html','learning.html','textbook.html','record.html',
  'diary-step1.html','diary-step2.html','diary-step3.html','record-history.html','measurements.html',
  'habit-check.html','habit-intro.html','food-groups.html','week-1-goal.html',
  'week-1-3-record.html','maintenance-energy.html','point-allocation.html',
  'photo-record.html','daily-result.html','program-choice.html','smart-diet.html'];
 const diagnostics=[];
 const probe=String.raw`JSON.stringify((()=>{
  const root=document.documentElement;
  const targets=document.querySelectorAll('h1,h2,h3,h4,p,li,label,summary,.lesson-body,.visual-row-text,.food-name,.meal-food-name,.food-search-item h3,.point-panel');
  const narrow=[];
  for(const e of targets){
   const txt=(e.textContent||'').replace(/\s+/g,' ').trim();
   if(txt.length<7||!/[ぁ-んァ-ヶ一-龠]/.test(txt))continue;
   const rect=e.getBoundingClientRect(),st=getComputedStyle(e);
   if(rect.width<3||rect.height<3||st.display==='none'||st.visibility==='hidden')continue;
   const font=parseFloat(st.fontSize)||14;
   if(rect.width<font*2.55&&txt.length>7)narrow.push({tag:e.tagName,cls:String(e.className).slice(0,50),w:Math.round(rect.width),font:Math.round(font),text:txt.slice(0,45)});
  }
  const outside=Math.max(root.scrollWidth,document.body.scrollWidth)-innerWidth;
  return {width:innerWidth,docWidth:root.scrollWidth,outside:Math.round(outside),narrow:narrow.slice(0,15),narrowTotal:narrow.length,title:document.title};
 })())`;
 for(const width of [320,390]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:2,mobile:true});
  for(const name of cases){
   const url=pathToFileURL(path.resolve(__dirname,'..',name)).href;
   await cdp('Page.navigate',{url});
   await sleep(170);
   const result=JSON.parse(await evalJS(probe));
   if(result.outside>4||result.narrowTotal>0){
    const item={file:name,width,outside:result.outside,narrow:result.narrow,narrowTotal:result.narrowTotal};
    diagnostics.push(item);
    process.stdout.write('LAYOUT_DIAGNOSTIC '+JSON.stringify(item)+'\n');
   }
  }
 }
 process.stdout.write('AUDIT_COMPLETE pages='+cases.length+' sizes=2 warnings='+diagnostics.length+'\n');
 ws.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{chrome.kill('SIGTERM');});
