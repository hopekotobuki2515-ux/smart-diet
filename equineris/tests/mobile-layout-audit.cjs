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
 for(let i=0;i<300;i++){
  if(chrome.exitCode!==null)throw Error('Chrome process exited before browser was ready: '+stderr.slice(-500));
  try{const result=await fn();if(result)return result;}catch(e){}
  await sleep(100);
 }
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
 const booksrc=fs.readFileSync(path.resolve(__dirname,'../textbook-data.js'),'utf8');
 const bookdata=JSON.parse(booksrc.slice(booksrc.indexOf('['),booksrc.lastIndexOf(']')+1));
 const extraRoutes=[
  ...Array.from({length:12},(_,i)=>'learning.html?week='+(i+1)),
  ...bookdata.flatMap(step=>step.cards.map(card=>'textbook.html#'+card.id)),
  '../food-search.html','../nutrient-food-search.html'
 ];
 const routes=[...cases,...extraRoutes];
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
  const stacked=[];
  let textNodeCount=0;
  for(const e of targets){
   if(textNodeCount>=350)break;
   const er=e.getBoundingClientRect();
   if(er.width<1||er.height<1)continue;
   for(const node of e.childNodes){
    if(node.nodeType!==3)continue;
    const content=node.textContent||'';
    if(content.length<9||content.includes('\n')||!/[\u3040-\u30ff\u4e00-\u9fff]/.test(content))continue;
    textNodeCount++;
    const letters=[],range=document.createRange();
    for(let i=0;i<content.length&&letters.length<12;i++){
     if(/\s/.test(content[i]))continue;
     range.setStart(node,i);range.setEnd(node,i+1);
     const br=range.getBoundingClientRect();
     if(br.width>0&&br.height>0)letters.push({top:br.top,left:br.left});
    }
    if(letters.length<7)continue;
    const size=parseFloat(getComputedStyle(e).fontSize)||14;
    let sequential=1,longest=1;
    for(let i=1;i<letters.length;i++){
     const prev=letters[i-1],curr=letters[i];
     if(curr.top-prev.top>size*.75&&Math.abs(curr.left-prev.left)<size*.8)sequential++;
     else sequential=1;
     longest=Math.max(longest,sequential);
    }
    if(longest>=7)stacked.push({tag:e.tagName,cls:String(e.className).slice(0,48),text:content.slice(0,45),lines:longest});
   }
  }
  const outside=Math.max(root.scrollWidth,document.body.scrollWidth)-innerWidth;
  return {width:innerWidth,docWidth:root.scrollWidth,outside:Math.round(outside),narrow:narrow.slice(0,15),narrowTotal:narrow.length,stacked:stacked.slice(0,10),stackedTotal:stacked.length,title:document.title,bodyText:document.body.innerText.trim().length,weekCards:document.querySelectorAll('#lessonTrack .point-slide').length,weekVisible:!document.querySelector('#lessonView')?.hidden,reader:document.documentElement.classList.contains('reader-mode'),targetVisible:!!(location.hash&&document.getElementById(location.hash.slice(1))?.getBoundingClientRect().height)};
 })())`;
 for(const width of [320,390]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:2,mobile:true});
  for(const name of routes){
   const filename=name.split(/[?#]/)[0];
   const suffix=name.slice(filename.length);
   const url=pathToFileURL(path.resolve(__dirname,'..',filename)).href+suffix;
   await cdp('Page.navigate',{url});
   await sleep(135);
   const result=JSON.parse(await evalJS(probe));
   if(!result.title||result.bodyText<15)throw Error('Page content missing '+name+' at '+width+': '+JSON.stringify(result));
   if(name.startsWith('learning.html?week=')&&(result.weekCards!==4||!result.weekVisible))throw Error('Weekly cards did not render '+name+': '+JSON.stringify(result));
   if(name.startsWith('textbook.html#')&&(!result.reader||!result.targetVisible))throw Error('Textbook card did not render '+name+': '+JSON.stringify(result));
   if(result.outside>4||result.narrowTotal>0||result.stackedTotal>0){
    const item={file:name,width,outside:result.outside,narrow:result.narrow,narrowTotal:result.narrowTotal,stacked:result.stacked,stackedTotal:result.stackedTotal};
    diagnostics.push(item);
    process.stdout.write('LAYOUT_DIAGNOSTIC '+JSON.stringify(item)+'\n');
   }
  }
 }
 process.stdout.write('AUDIT_COMPLETE routes='+routes.length+' sizes=2 warnings='+diagnostics.length+'\n');
 if(diagnostics.length)throw Error('Mobile text/layout warnings: '+diagnostics.length);
 ws.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{chrome.kill('SIGTERM');});
