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
 const url=pathToFileURL(path.resolve(__dirname,'../textbook.html')).href;
 const cases=[[390,844,'s2-habit-check'],[320,568,'s2-goal'],[375,667,'s2-weight-history'],
  [390,844,'s1-c1'],[375,667,'s3-c1']];
 const probe="JSON.stringify((()=>{"+
  "const step=document.querySelector('.course-step:not([hidden])');"+
  "const track=step?.querySelector('.track');const cards=[...(track?.children||[])];"+
  "const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);"+
  "const duplicateIds=ids.filter((x,i)=>ids.indexOf(x)!==i);"+
  "const clipped=cards.map((x,i)=>({i,extra:x.scrollHeight-x.clientHeight})).filter(x=>x.extra>3);"+
  "const lesson=window.SMART_DIET_TEXTBOOK[Number(step.id.slice(-1))-1];"+
  "const contentLost=lesson.cards.some(c=>{let node=track.querySelector('#'+c.id),found='';"+
  "if(!node)return true;const first=node;while(node&&(node===first||!node.id)){"+
  "found+=[...node.querySelectorAll('.lesson-body')].map(e=>e.textContent).join('');node=node.nextElementSibling;}"+
  "return found!==c.body;});"+
  "return {reader:document.documentElement.classList.contains('reader-mode'),"+
  "height:innerHeight,docHeight:document.documentElement.scrollHeight,cardCount:cards.length,"+
  "navBottom:step.querySelector('.slide-nav').getBoundingClientRect().bottom,"+
  "clipped,duplicateIds,contentLost,habitRows:track.querySelectorAll('.habit-mini-row').length};"+
  "})())";
 for(const [width,height,hash] of cases){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
  await cdp('Page.navigate',{url:url+'?browser='+width+'x'+height+hash+'#'+hash});
  await ready(async()=>await evalJS("document.documentElement.classList.contains('reader-mode')"));
  const snap=JSON.parse(await evalJS(probe));
  assert.equal(snap.reader,true);
  assert.ok(snap.docHeight<=snap.height+3,'vertical scroll '+JSON.stringify({width,height,hash,snap}));
  assert.deepEqual(snap.clipped,[],'card clipping '+JSON.stringify({width,height,hash,snap}));
  assert.deepEqual(snap.duplicateIds,[],'duplicate ids '+hash);
  assert.equal(snap.contentLost,false,'text lost '+hash);
  assert.ok(snap.cardCount>=1 && snap.navBottom<=snap.height+3,'navigation off screen '+hash);
  if(hash==='s2-habit-check')assert.equal(snap.habitRows,17);
  process.stdout.write('PASS '+width+'x'+height+' '+hash+' slides='+snap.cardCount+'\n');
 }
 ws.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{
 chrome.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});
});
