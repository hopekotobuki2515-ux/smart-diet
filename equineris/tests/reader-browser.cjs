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
 const url=pathToFileURL(path.resolve(__dirname,'../textbook.html')).href;
 const cases=[[390,844,'s2-habit-check'],[320,568,'s2-goal'],[375,667,'s2-weight-history'],
  [390,844,'s1-c1'],[375,667,'s3-c1']];
 const probe="JSON.stringify((()=>{"+
  "const step=document.querySelector('.course-step:not([hidden])');"+
  "const track=step?.querySelector('.track');const cards=[...(track?.children||[])];"+
  "const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);"+
  "const duplicateIds=ids.filter((x,i)=>ids.indexOf(x)!==i);"+
  "const heights=cards.map(x=>Math.round(x.getBoundingClientRect().height));"+
  "const unequal=heights.some(h=>Math.abs(h-heights[0])>2);"+
  "const unscrollable=cards.filter(x=>{if(x.scrollHeight<=x.clientHeight+3)return false;"+
  "if(getComputedStyle(x).overflowY!=='auto')return true;const before=x.scrollTop;"+
  "x.scrollTop=30;const works=x.scrollTop>before;x.scrollTop=before;return !works;}).length;"+
  "const lesson=window.SMART_DIET_TEXTBOOK[Number(step.id.slice(-1))-1];"+
  "const contentLost=lesson.cards.some(c=>{let node=track.querySelector('#'+c.id),found='';"+
  "if(!node)return true;const first=node;while(node&&(node===first||!node.id)){"+
  "found+=[...node.querySelectorAll('.lesson-body')].map(e=>e.textContent).join('');node=node.nextElementSibling;}"+
  "return found!==c.body;});"+
  "return {reader:document.documentElement.classList.contains('reader-mode'),"+
  "height:innerHeight,docHeight:document.documentElement.scrollHeight,cardCount:cards.length,"+
  "navBottom:step.querySelector('.slide-nav').getBoundingClientRect().bottom,"+
  "tocVisible:!document.getElementById('backToIndex').hidden,"+
  "footer:step.querySelector('.step-footer a').getBoundingClientRect().bottom,"+
  "unequal,unscrollable,duplicateIds,contentLost,habitRows:track.querySelectorAll('.habit-reference-list li').length};"+
  "})())";
 for(const [width,height,hash] of cases){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
  await cdp('Page.navigate',{url:url+'?browser='+width+'x'+height+hash+'#'+hash});
  await ready(async()=>await evalJS("document.documentElement.classList.contains('reader-mode')"));
  const snap=JSON.parse(await evalJS(probe));
  assert.equal(snap.reader,true);
  assert.ok(snap.docHeight<=snap.height+3,'vertical scroll '+JSON.stringify({width,height,hash,snap}));
  assert.equal(snap.unequal,false,'card heights differ '+JSON.stringify({width,height,hash,snap}));
  assert.equal(snap.unscrollable,0,'overflowing card cannot scroll '+JSON.stringify({width,height,hash,snap}));
  assert.deepEqual(snap.duplicateIds,[],'duplicate ids '+hash);
  assert.equal(snap.contentLost,false,'text lost '+hash);
  assert.ok(snap.cardCount>=1 && snap.navBottom<=snap.height+3,'navigation off screen '+hash);
  assert.equal(snap.tocVisible,false,'floating contents button overlaps navigation '+hash);
  assert.ok(snap.footer<=snap.height+3,'in-flow contents link offscreen '+hash);
  if(hash==='s2-habit-check')assert.equal(snap.habitRows,17);
  process.stdout.write('PASS '+width+'x'+height+' '+hash+' slides='+snap.cardCount+'\n');
 }

 // Click stability regression: selected cards must not flash back while buttons navigate.
 const lessons=pathToFileURL(path.resolve(__dirname,'../learning.html')).href+'?week=2';
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await cdp('Page.navigate',{url:lessons});
 await ready(async()=>await evalJS("document.querySelector('#lessonNext')&&document.querySelectorAll('#lessonTabs button').length===4"));
 const traceReply=await cdp('Runtime.evaluate',{expression:"(async()=>{"+
   "const track=document.getElementById('lessonTrack');const next=document.getElementById('lessonNext');"+
   "const tabs=[...document.querySelectorAll('#lessonTabs button')];const trace=[];"+
   "const snap=(label)=>{trace.push({label,x:Math.round(track.scrollLeft),selected:tabs.findIndex(b=>b.getAttribute('aria-pressed')==='true'),"+
   "counter:document.getElementById('lessonCounter').textContent,buttonX:Math.round(next.getBoundingClientRect().left)});};"+
   "snap('before');next.click();snap('after-click');"+
   "for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,16));snap('t'+(i+1)*16);}"+
   "return JSON.stringify({trace,scrollBehavior:getComputedStyle(track).scrollBehavior,snapType:getComputedStyle(track).scrollSnapType});"+
   "})()",returnByValue:true,awaitPromise:true});
 if(traceReply.exceptionDetails)throw Error(traceReply.exceptionDetails.text);
 const trace=JSON.parse(traceReply.result.value);
 assert.equal(trace.scrollBehavior,'auto','lesson buttons should not use smooth scroll');
 assert.equal(trace.trace[0].selected,0);
 assert.equal(trace.trace[1].selected,1);
 assert.ok(trace.trace.slice(1).every(x=>x.selected===1&&x.counter==='2 / 4'),'lesson highlight flashed back during click: '+JSON.stringify(trace.trace));
 assert.equal(new Set(trace.trace.map(x=>x.buttonX)).size,1,'lesson next button shifted horizontally');
 process.stdout.write('PASS stable weekly lesson buttons (no selection flash)\n');

 // The same regression appeared in the original STEP1 and reference lesson controls.
 for(const [filename,hash,trackSelector,nextSelector,counterSelector] of [
  ['diary-step1.html','','#mealTrack','#mealNext','#mealCounter'],
  ['diary-step2.html','','#mealTrack','#mealNext','#mealCounter'],
  ['textbook.html','#s2-c5','.course-step:not([hidden]) .track','.course-step:not([hidden]) .slide-nav .next','.course-step:not([hidden]) .counter']
 ]){
  await cdp('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'../'+filename)).href+hash});
  await ready(async()=>await evalJS("!!(document.querySelector("+JSON.stringify(trackSelector)+")&&document.querySelector("+JSON.stringify(nextSelector)+"))"));
  const expression="(async()=>{const track=document.querySelector("+JSON.stringify(trackSelector)+"),"+
   "btn=document.querySelector("+JSON.stringify(nextSelector)+"),counter=document.querySelector("+JSON.stringify(counterSelector)+");"+
   "const samples=[];const add=(tag)=>samples.push({tag,x:Math.round(track.scrollLeft),counter:counter?.textContent.trim()});"+
   "add('before');btn.click();add('after');for(let i=0;i<23;i++){await new Promise(r=>setTimeout(r,16));add('t'+i);}"+
   "return JSON.stringify({file:"+JSON.stringify(filename)+",samples})})()";
  const response=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.text);
  const output=JSON.parse(response.result.value),samples=output.samples;
  const current=samples[1]?.counter,previous=samples[0]?.counter;
  assert.ok(previous&&current&&previous!==current,'click must advance card: '+filename+' '+JSON.stringify(samples));
  assert.ok(samples.slice(1).every(x=>x.counter===current),'card selection flickered in '+filename+': '+JSON.stringify(samples));
  process.stdout.write('PASS stable card navigation: '+filename+'\n');
 }

 // Prevent the same 1/4 -> 2/4 -> 1/4 flash in both four-group reference readers.
 for(const [file,trackId,nextId,counterId] of [
  ['food-groups.html','groupTrack','groupNext','groupCounter'],
  ['point-allocation.html','pointTrack','pointNext','pointCounter']
 ]){
  await cdp('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'../'+file)).href});
  await ready(async()=>await evalJS("!!(document.getElementById("+JSON.stringify(nextId)+")&&document.getElementById("+JSON.stringify(trackId)+"))"));
  const expression="(async()=>{"+
   "const track=document.getElementById("+JSON.stringify(trackId)+"),btn=document.getElementById("+JSON.stringify(nextId)+"),"+
   "counter=document.getElementById("+JSON.stringify(counterId)+");"+
   "const tabs=[...document.querySelectorAll('[data-tab]')];"+
   "const reads=[];function snap(){reads.push({x:Math.round(track.scrollLeft),text:counter.textContent.trim(),selected:tabs.findIndex(t=>t.getAttribute('aria-pressed')==='true')});}"+
   "snap();btn.click();snap();for(let i=0;i<23;i++){await new Promise(r=>setTimeout(r,16));snap();}"+
   "return JSON.stringify({reads,css:getComputedStyle(track).scrollBehavior});})()";
  const response=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.text);
  const result=JSON.parse(response.result.value),reads=result.reads;
  assert.equal(reads[0].text,'1 / 4');
  assert.equal(reads[1].text,'2 / 4');
  assert.ok(reads.slice(1).every(x=>x.text==='2 / 4'&&x.selected===1),
   'the food-group reader button flashed back after selection: '+file+' '+JSON.stringify(result));
  process.stdout.write('PASS stable food-group navigation: '+file+'\\n');
 }

 ws.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{
 // The CI runner removes its own temporary filesystem after the job.
 // Do not race Chromium's child processes while deleting its live profile.
 chrome.kill('SIGTERM');
});
