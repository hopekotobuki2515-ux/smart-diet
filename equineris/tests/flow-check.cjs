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
 ['setup.html','textbook.html','textbook-data.js','goal-calculator.js','week-1-goal.html',
  'habit-intro.html','habit-check.html','record.html','measurements.html','diary-step2.html',
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
test('initial measurement uses registration weight without overwriting saved rows',()=>{
 const s=source['measurements.html'];
 assert.match(s,/equineris:registration:v1/);
 assert.match(s,/equineris:body-measurements:v1/);
 assert.match(s,/if\(Object\.keys\(getAll\(\)\)\.length!==0\)return/);
 assert.match(s,/date\.value=today\(\);showDay\(\);prefillRegistrationWeight\(\);renderBaseline\(\);renderGoal\(\);renderHistory\(\)/);
 assert.match(s,/all\[day\]=\{\.\.\.\(all\[day\]\|\|\{\}\),weight:w,waist:a\}/);
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
  this.className='';this.textContent='';this.value='';this.dataset={};this.clientWidth=360;
  this.scrollLeft=0;this.hidden=false;this.disabled=false;
 }
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key];}
 addEventListener(event,fn){(this.handlers[event]??=[]).push(fn);}
 click(){if(!this.disabled)for(const f of this.handlers.click??[])f({target:this,preventDefault(){}});}
 fire(type){for(const f of this.handlers[type]??[])f({target:this,preventDefault(){}});}
 checkValidity(){if(this.tagName!=='input')return true;const n=Number(this.value);return this.value.trim()!==''&&Number.isFinite(n)&&n>=0.1;}
 scrollTo(opts){this.scrollLeft=opts.left;}
 scrollIntoView(){this.scrolled=true;}
}
function textbookScenario(hash='',seed={}){
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
 const localData=new Map(Object.entries(seed));
 const localStorage={
  getItem:key=>localData.get(key)??null,
  setItem:(key,val)=>localData.set(key,val)
 };
 const history={replaceState(_a,_b,url){location.hash=url;}};
 vm.runInNewContext(source['goal-calculator.js'],{window,document,localStorage,Date});
 const inline=scriptOf(source['textbook.html']).find(s=>s.includes('const data=window.SMART_DIET_TEXTBOOK'));
 assert.ok(inline,'textbook script');
 vm.runInNewContext(inline,{
  window,document,location,localStorage,history,requestAnimationFrame:fn=>fn()
 });
 for(const fn of events.load??[])fn();
 const sections=elements.steps.children.filter(x=>x.className==='course-step');
 const navs=sections.map(s=>s.children.find(x=>x.className==='slide-nav'));
 const next=navs.map(n=>n.children[2]),count=navs.map(n=>n.children[1]);
 return {sections,next,count,location,localData};
}
test('STEP2 BMI example fills the registration and recalculates without saving',()=>{
 const seed={'equineris:registration:v1':JSON.stringify({name:'Test',heightCm:'170',weightKg:'70'})};
 const t=textbookScenario('#s2-c3',seed);
 const track=t.sections[1].children.find(x=>x.className==='track');
 const card=track.children[2];
 const visual=card.children.find(x=>x.className==='visual');
 const demo=visual.children.find(x=>x.className==='bmi-demo');
 assert.ok(demo,'BMI example');
 const h=demo.children[0].children[0],w=demo.children[1].children[0],out=demo.children[2];
 assert.equal(h.value,'170');
 assert.equal(w.value,'70');
 assert.equal(out.textContent,'現在のBMI：24.2');
 h.value='165';h.fire('input');
 assert.equal(out.textContent,'現在のBMI：25.7');
 assert.equal(JSON.parse(seed['equineris:registration:v1']).heightCm,'170');
});
test('starting BMI stays recorded after later daily weight measurements',()=>{
 const REG='equineris:registration:v1',BASE='equineris:body-start-bmi:v1',DAILY='equineris:body-measurements:v1';
 function measurementScenario(seed){
  const store=new Map(Object.entries(seed));
  const ids=['recordDate','bodyWeight','bodyWaist','saveStatus','historyRows','metricForm',
   'recordTitle','back','startHeight','startWeight','startBMI','saveBaseline','baselineStatus',
   'goalStartWeight','goalTargetWeight','goalLossWeight','goalLossRate','goalHistoryStatus'];
  const els=Object.fromEntries(ids.map(id=>[id,new MockEl('input')]));
  const document={referrer:'',getElementById:id=>els[id],createElement:tag=>new MockEl(tag)};
  const localStorage={getItem:key=>store.get(key)??null,setItem:(key,val)=>store.set(key,String(val))};
  const script=scriptOf(source['measurements.html'])[0];
  vm.runInNewContext(script,{document,localStorage,window:{confirm(){return false;}},
   location:{origin:'https://example.test'},URL,Date});
  return {els,store};
 }
 const initial={name:'Test',heightCm:'170',weightKg:'70'};
 const a=measurementScenario({[REG]:JSON.stringify(initial)});
 assert.equal(a.els.startHeight.textContent,'170.0 cm');
 assert.equal(a.els.startWeight.textContent,'70.0 kg');
 assert.equal(a.els.startBMI.textContent,'24.2（未記録）');
 assert.equal(a.els.saveBaseline.disabled,false);
 assert.equal(a.store.get(BASE),undefined);
 a.els.saveBaseline.click();
 const snapshot=JSON.parse(a.store.get(BASE));
 assert.equal(snapshot.heightCm,170);
 assert.equal(snapshot.weightKg,70);
 assert.ok(Math.abs(snapshot.bmi-70/(1.7**2))<1e-12);
 assert.equal(a.els.startBMI.textContent,'24.2（記録済み）');
 assert.equal(a.els.saveBaseline.disabled,true);
 const later=measurementScenario({[REG]:JSON.stringify({...initial,weightKg:'65'}),
  [BASE]:a.store.get(BASE),[DAILY]:JSON.stringify({'2026-11-22':{weight:65,waist:80}})});
 assert.equal(later.els.startWeight.textContent,'70.0 kg');
 assert.equal(later.els.startBMI.textContent,'24.2（記録済み）');
 assert.equal(later.els.saveBaseline.disabled,true);
 assert.equal(JSON.parse(later.store.get(DAILY))['2026-11-22'].weight,65);
});
test('registration weight computes STEP2 goal on second card and saves percentages',()=>{
 const t=textbookScenario('',{'equineris:registration:v1':JSON.stringify({heightCm:'170',weightKg:'80'})});
 assert.equal(t.sections.length,6);
 for(let i=0;i<8;i++)t.next[0].click();
 assert.equal(t.count[0].textContent,'9 / 9');
 t.next[0].click();assert.ok(t.sections[1].scrolled);
 t.next[1].click();assert.equal(t.count[1].textContent,'2 / 10');
 const track=t.sections[1].children.find(c=>c.className==='track');
 const visual=track.children[1].children.find(c=>c.className==='visual');
 const calc=visual.children.find(c=>c.className==='goal-calculator');
 assert.ok(calc,'STEP2 second card calculator');
 const start=calc.children[2],rate=calc.children[3].children;
 const target=calc.children[4].children[0],out=calc.children[5],save=calc.children[6];
 assert.equal(start.textContent,'スタート時の体重：80.0 kg');
 for(const [i,expected] of [[0,'76.0'],[1,'73.6'],[2,'72.0'],[3,'68.0']]){
  rate[i].click();assert.equal(target.value,expected);assert.equal(save.disabled,false);
 }
 rate[1].click();save.click();
 const saved=JSON.parse(t.localData.get('equineris:week1:goal:v1'));
 assert.equal(saved.startWeightKg,80);
 assert.equal(saved.goalWeightKg,73.6);
 assert.equal(saved.lossKg,6.4);
 assert.equal(saved.selectedRatePercent,8);
 assert.equal(t.localData.get('equineris:body-measurements:v1'),undefined);
 target.value='72.5';target.fire('input');
 assert.equal(rate[1].getAttribute('aria-pressed'),'false');
 save.click();
 const edited=JSON.parse(t.localData.get('equineris:week1:goal:v1'));
 assert.equal(edited.goalWeightKg,72.5);
 assert.equal(edited.selectedRatePercent,null);
 assert.match(out.textContent,/7.5 kg/);
});
test('STEP2 food behavior introduction leads to 17-item checklist without repeated goal page',()=>{
 const t=textbookScenario('#s2-c7');
 assert.equal(t.count[1].textContent,'7 / 10');
 assert.match(t.next[1].textContent,/食行動チェック/);
 t.next[1].click();
 assert.equal(t.location.destination,'./habit-intro.html?from=textbook-step2');
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
test('saved goal is shown on measurements page without modifying daily logs',()=>{
 const ids=['recordDate','bodyWeight','bodyWaist','saveStatus','historyRows','metricForm',
   'recordTitle','back','startHeight','startWeight','startBMI','saveBaseline','baselineStatus',
   'goalStartWeight','goalTargetWeight','goalLossWeight','goalLossRate','goalHistoryStatus'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new MockEl('input')]));
 const daily={'2026-11-22':{weight:78,waist:85}};
 const storage=new Map([
  ['equineris:registration:v1',JSON.stringify({heightCm:'170',weightKg:'80'})],
  ['equineris:week1:goal:v1',JSON.stringify({startWeightKg:80,goalWeightKg:73.6,selectedRatePercent:8,lossKg:6.4})],
  ['equineris:body-measurements:v1',JSON.stringify(daily)]
 ]);
 vm.runInNewContext(scriptOf(source['measurements.html'])[0],{
  document:{referrer:'',getElementById:id=>nodes[id],createElement:tag=>new MockEl(tag)},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,v)=>storage.set(key,String(v))},
  window:{confirm(){return false;}},location:{origin:'https://example.test'},URL,Date
 });
 assert.equal(nodes.goalStartWeight.textContent,'80.0 kg');
 assert.equal(nodes.goalTargetWeight.textContent,'73.6 kg');
 assert.equal(nodes.goalLossWeight.textContent,'6.4 kg');
 assert.equal(nodes.goalLossRate.textContent,'8%');
 assert.equal(storage.get('equineris:body-measurements:v1'),JSON.stringify(daily));
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
