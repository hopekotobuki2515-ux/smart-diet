'use strict';
// EQUINERIS navigation regression checks. Run: node equineris/tests/flow-check.cjs
// No external packages, network, or user data required.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=Object.fromEntries(
 ['setup.html','textbook.html','textbook-data.js','week-1-goal.html',
  'habit-intro.html','habit-check.html','record.html','diary-step2.html',
  'diary-step3.html','diary-step2.js','diary-step3.js','trainer-link.js']
  .map(name=>[name,read(name)])
);
const test=(label,fn)=>{fn();process.stdout.write('PASS '+label+'\n');};
const scriptOf=html=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(s=>s.trim());
 scripts.forEach((s,i)=>new vm.Script(s,{filename:'inline-'+i+'.js'}));
 return scripts;
};
test('all inline and external JavaScript parses',()=>{
 for(const [name,s] of Object.entries(source)){
  if(name.endsWith('.js'))new vm.Script(s,{filename:name});
  else scriptOf(s);
 }
});
test('registration has only previously approved three fields',()=>{
 const s=source['setup.html'];
 for(const id of ['nickname','height','weight'])assert.match(s,new RegExp('id="'+id+'"'));
 for(const id of ['age','waist','threeMonthGoal','bmiValue','rate5'])
  assert.doesNotMatch(s,new RegExp('id="'+id+'"'));
 assert.match(s,/equineris:registration:v1/);
 assert.match(s,/\.\/textbook\.html#s1-c1/);
});
test('weight goal and BMI remain inside separate lesson flow',()=>{
 const s=source['week-1-goal.html'];
 for(const n of [5,8,10,15])assert.match(s,new RegExp('name="goalRate" value="'+n+'"'));
 for(const id of ['targetWeight','bmiAutoCurrent','bmiAuto22','bmiAuto25'])
  assert.match(s,new RegExp('id="'+id+'"'));
 assert.match(s,/goalInput\.value=display\(startWeight\*\(1-Number\(input\.value\)\/100\)\)/);
 assert.match(s,/fromTextbook\?\(requestedSlide==='bmi'\?2:1\):0/);
 assert.match(s,/habit-intro\.html\?from=textbook-step2/);
});
test('17 item checklist retains its marks and local save key',()=>{
 const s=source['habit-check.html'];
 const ids=[...s.matchAll(/class="paper-checkbox" type="checkbox" data-habit="(h\d{2})"/g)]
  .map(m=>m[1]);
 assert.equal(ids.length,17);
 assert.equal(new Set(ids).size,17);
 assert.match(s,/equineris:program:habit-check:v1/);
 assert.match(s,/textbook\.html#s2-c8/);
});
test('food diary stays connected across three recording stages',()=>{
 assert.match(source['record.html'],/id="diaryStep2Link"/);
 assert.match(source['diary-step2.html'],/id="diaryStep3Link"/);
 assert.match(source['diary-step3.html'],/textbook\.html#s5-c1/);
 assert.match(source['trainer-link.js'],/if\(!status\.configured\)return/);
});
const textbookData=JSON.parse(
 source['textbook-data.js'].match(/=\s*(\[[\s\S]*\]);\s*$/)[1]
);
test('six textbook steps and all unique lesson IDs are present',()=>{
 assert.equal(textbookData.length,6);
 const cards=textbookData.flatMap(step=>step.cards);
 assert.equal(cards.length,66);
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
 for(const id of ['s2-c6','s2-c8','s4-c4','s5-c1'])
  assert.ok(cards.some(c=>c.id===id),id);
});
class MockEl {
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.handlers={};this.attributes={};
  this.className='';this.textContent='';this.value='';this.clientWidth=360;
  this.scrollLeft=0;this.hidden=false;this.disabled=false;
 }
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key];}
 addEventListener(event,fn){(this.handlers[event]??=[]).push(fn);}
 click(){if(!this.disabled)for(const f of this.handlers.click??[])f({target:this,preventDefault(){}});}
 scrollTo(opts){this.scrollLeft=opts.left;}
 scrollIntoView(){this.scrolled=true;}
}
function textbookScenario(hash=''){
 const names=['steps','stepIndex','searchInput','favoritesButton','resumeButton',
  'resultPanel','resultTitle','resultList','storageStatus'];
 const elements=Object.fromEntries(names.map(name=>[name,new MockEl()]));
 const document={
  getElementById:id=>{assert.ok(elements[id],id);return elements[id];},
  createElement:tag=>new MockEl(tag)
 };
 const events={};
 const location={hash,destination:null,assign(to){this.destination=to;}};
 const window={SMART_DIET_TEXTBOOK:textbookData,location,
  addEventListener:(type,fn)=>{(events[type]??=[]).push(fn);}};
 const localData=new Map();
 const localStorage={
  getItem:key=>localData.get(key)??null,
  setItem:(key,val)=>localData.set(key,val)
 };
 const history={replaceState(_a,_b,url){location.hash=url;}};
 const inline=scriptOf(source['textbook.html']).find(s=>s.includes('const data=window.SMART_DIET_TEXTBOOK'));
 assert.ok(inline,'textbook script');
 vm.runInNewContext(inline,{
  window,document,location,localStorage,history,requestAnimationFrame:fn=>fn()
 });
 for(const fn of events.load??[])fn();
 const sections=elements.steps.children.filter(x=>x.className==='course-step');
 const navs=sections.map(s=>s.children.find(x=>x.className==='slide-nav'));
 const next=navs.map(n=>n.children[2]),count=navs.map(n=>n.children[1]);
 return {sections,next,count,location};
}
test('STEP1 reaches STEP2; STEP2 opens the target-weight lesson',()=>{
 const t=textbookScenario();
 assert.equal(t.sections.length,6);
 for(let i=0;i<8;i++)t.next[0].click();
 assert.equal(t.count[0].textContent,'9 / 9');
 assert.equal(t.next[0].disabled,false);
 t.next[0].click();
 assert.ok(t.sections[1].scrolled);
 for(let i=0;i<5;i++)t.next[1].click();
 assert.equal(t.count[1].textContent,'6 / 10');
 assert.match(t.next[1].textContent,/目標設定/);
 t.next[1].click();
 assert.equal(t.location.destination,'./week-1-goal.html?from=textbook-step2&slide=goal');
});
test('after the checklist, STEP2 and STEP3 advance to STEP4 food diary',()=>{
 const t=textbookScenario('#s2-c8');
 assert.equal(t.count[1].textContent,'8 / 10');
 t.next[1].click();t.next[1].click();t.next[1].click();
 assert.ok(t.sections[2].scrolled,'STEP3');
 for(let i=0;i<11;i++)t.next[2].click();
 assert.equal(t.next[2].disabled,false);
 t.next[2].click();
 assert.ok(t.sections[3].scrolled,'STEP4');
 for(let i=0;i<3;i++)t.next[3].click();
 assert.match(t.next[3].textContent,/記録へ/);
 t.next[3].click();
 assert.equal(t.location.destination,'./record.html?day=1');
});
test('STEP5 can advance; STEP6 correctly finishes',()=>{
 const t=textbookScenario('#s5-c16');
 assert.equal(t.next[4].disabled,false);
 t.next[4].click();
 assert.ok(t.sections[5].scrolled);
 const end=textbookScenario('#s6-c15');
 assert.equal(end.next[5].disabled,true);
});
process.stdout.write('EQUINERIS regression tests completed.\n');
