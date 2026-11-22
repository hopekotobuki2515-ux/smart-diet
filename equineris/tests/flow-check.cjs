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
  'habit-intro.html','habit-check.html','habit-check-card.js','record.html','measurements.html','diary-step2.html',
  'diary-step3.html','diary-step2.js','diary-step3.js','trainer-link.js','weight-trend.js']
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
 assert.equal(cards.length,69);
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
 for(const id of ['s2-goal','s2-c6','s2-weight-history','s2-habit-check','s2-c8','s4-c4','s5-c1'])
  assert.ok(cards.some(c=>c.id===id),id);
});
class MockEl {
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.handlers={};this.attributes={};
  this.className='';this.textContent='';this.value='';this.dataset={};this.style={};this.offsetHeight=540;this.clientWidth=360;
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
 vm.runInNewContext(source['habit-check-card.js'],{window,document,localStorage});
 const inline=scriptOf(source['textbook.html']).find(s=>s.includes('const data=window.SMART_DIET_TEXTBOOK'));
 assert.ok(inline,'textbook script');
 vm.runInNewContext(inline,{
  window,document,location,localStorage,history,requestAnimationFrame:fn=>fn()
 });
 for(const fn of events.load??[])fn();
 const sections=elements.steps.children.filter(x=>x.className==='course-step');
 const navs=sections.map(s=>s.children.find(x=>x.className==='slide-nav'));
 const next=navs.map(n=>n.children[2]),count=navs.map(n=>n.children[1]);
 return {sections,next,count,location,localData,elements};
}
test('only one STEP is visible, with STEP1 last card advancing to STEP2 and STEP3',()=>{
 const t=textbookScenario();
 const visible=()=>t.sections.map((node,i)=>!node.hidden?i+1:null).filter(Boolean);
 assert.deepEqual(visible(),[1]);
 assert.equal(t.sections[0].children.find(c=>c.className==='track').children.length,9);
 assert.equal(t.next[0].textContent,'次へ 〉');
 for(let i=0;i<8;i++)t.next[0].click();
 assert.equal(t.count[0].textContent,'9 / 9');
 assert.match(t.next[0].textContent,/STEP 2へ/);
 t.next[0].click();
 assert.deepEqual(visible(),[2]);
 assert.equal(t.count[1].textContent,'1 / 13');
 assert.equal(t.sections[1].scrolled,true);
 assert.equal(t.sections[0].hidden,true);
 assert.equal(t.next[1].textContent,'次へ 〉');
 assert.match(t.sections[1].children.find(c=>c.className==='step-heading').children[1].textContent,/自分を知り/);
 for(let i=0;i<12;i++)t.next[1].click();
 assert.equal(t.count[1].textContent,'13 / 13');
 assert.match(t.next[1].textContent,/STEP 3へ/);
 t.next[1].click();
 assert.deepEqual(visible(),[3]);
 assert.equal(t.count[2].textContent,'1 / 12');
 assert.equal(t.sections[1].hidden,true);
 assert.equal(t.sections[2].hidden,false);
 assert.match(t.sections[2].children.find(c=>c.className==='step-heading').children[1].textContent,/スマートダイエット式食事/);
 assert.equal(t.next[2].textContent,'次へ 〉');
 t.sections[2].children.find(c=>c.className==='slide-nav').children[0].click();
 assert.deepEqual(visible(),[2]);
 assert.equal(t.count[1].textContent,'13 / 13');
});
test('search/index/deep links still show the matching STEP without revealing others',()=>{
 const first=textbookScenario();
 const idx=first.elements.stepIndex;
 assert.equal(idx.children.length,6);
 assert.equal(first.sections.filter(x=>!x.hidden).length,1);
 idx.children[4].click();
 assert.equal(first.sections[4].hidden,false);
 assert.equal(first.sections.filter(x=>!x.hidden).length,1);
 assert.equal(first.count[4].textContent,'1 / 16');
 assert.equal(first.location.hash,'#s5-c1');
 first.sections[4].children.find(c=>c.className==='slide-nav').children[0].click();
 assert.equal(first.sections[3].hidden,false);
 assert.equal(first.count[3].textContent,'4 / 4');
 const deep=textbookScenario('#s2-weight-history');
 assert.equal(deep.sections[1].hidden,false);
 assert.equal(deep.sections.filter(x=>!x.hidden).length,1);
 assert.equal(deep.count[1].textContent,'8 / 13');
 const stepLink=textbookScenario('#step-3');
 assert.equal(stepLink.sections[2].hidden,false);
 assert.equal(stepLink.sections.filter(x=>!x.hidden).length,1);
 assert.equal(stepLink.count[2].textContent,'1 / 12');
 assert.match(source['textbook.html'],/id="steps" aria-live="off"/);
 assert.ok(source['textbook.html'].indexOf('id="steps"')<source['textbook.html'].indexOf('class="toolbox"'));
});
test('standalone goal card appears immediately after STEP2 page five',()=>{
 const ids=textbookData[1].cards.map(card=>card.id);
 assert.equal(ids.length,13);
 assert.deepEqual(ids,['s2-c1','s2-c2','s2-c3','s2-c4','s2-c5','s2-goal','s2-c6','s2-weight-history','s2-c7','s2-habit-check','s2-c8','s2-c9','s2-c10']);
 const t=textbookScenario('#s2-goal');
 assert.equal(t.count[1].textContent,'6 / 13');
 const track=t.sections[1].children.find(c=>c.className==='track');
 assert.equal(track.children.length,13);
 assert.equal(track.children[4].id,'s2-c5');
 assert.equal(track.children[5].id,'s2-goal');
 assert.equal(track.children[6].id,'s2-c6');
 const prevCard=track.children[4].children.find(c=>c.className.split(' ').includes('visual'));
 const calculator=track.children[5].children.find(c=>c.className.split(' ').includes('visual'));
 const nextCard=track.children[6].children.find(c=>c.className.split(' ').includes('visual'));
 assert.equal(prevCard.children.some(c=>c.className==='goal-calculator'),false);
 assert.ok(calculator.children.some(c=>c.className==='goal-calculator'));
 assert.equal(nextCard.children.some(c=>c.className==='goal-calculator'),false);
});
test('STEP2 fifth page advances to new sixth goal card then original sixth page',()=>{
 const t=textbookScenario('#s2-c5');
 assert.equal(t.count[1].textContent,'5 / 13');
 t.next[1].click();
 assert.equal(t.count[1].textContent,'6 / 13');
 t.next[1].click();
 assert.equal(t.count[1].textContent,'7 / 13');
});
test('STEP2 page 5 explains, page 6 calculates and page 7 reviews past weights',()=>{
 const cards=textbookData[1].cards;
 assert.equal(cards[4].id,'s2-c5');
 assert.equal(cards[5].id,'s2-goal');
 assert.equal(cards[6].id,'s2-c6');
 assert.equal(cards[7].id,'s2-weight-history');
 assert.match(cards[4].body,/5％・8％・10％・15％/);
 assert.match(cards[5].body,/前のページで紹介した減量率/);
 assert.match(cards[6].body,/3か月後の目標を決めたら/);
 assert.match(cards[6].body,/次のページで記録/);
 assert.equal(cards[7].body,'覚えている体重を入力しましょう。空欄でも大丈夫です。');
 const t=textbookScenario('#s2-c5');
 const track=t.sections[1].children.find(c=>c.className==='track');
 assert.match(source['textbook.html'],/\.track\{display:flex;align-items:stretch/);
 assert.match(source['textbook.html'],/\.lesson-card\{[^}]*height:540px;min-height:0;/);
 assert.match(source['textbook.html'],/\.lesson-card\{[^}]*overflow-x:hidden;overflow-y:auto;/);
 assert.doesNotMatch(source['textbook.html'],/fitActiveCard/);
 assert.match(source['textbook.html'],/\.visual--interactive/);
 track.children[4].offsetHeight=540;
 track.children[5].offsetHeight=700;
 track.children[6].offsetHeight=540;
 t.next[1].click();
 assert.equal(t.count[1].textContent,'6 / 13');
 assert.equal(track.style.height,undefined,'height must not change per slide');
 t.next[1].click();
 assert.equal(t.count[1].textContent,'7 / 13');
 assert.equal(track.style.height,undefined,'height must remain independent of card content');
 const visual=track.children[5].children.find(c=>c.className.split(' ').includes('visual'));
 assert.equal(visual.className,'visual visual--interactive');
 assert.equal(visual.children.filter(c=>c.className==='visual-title').length,0);
});
test('every textbook card uses one fixed outer height and scrolls its own content',()=>{
 const stylesheet=source['textbook.html'];
 assert.match(stylesheet,/\.lesson-card\{[^}]*height:540px;min-height:0;/);
 assert.match(stylesheet,/\.lesson-card\{[^}]*overflow-x:hidden;overflow-y:auto;/);
 assert.match(stylesheet,/\.track\{[^}]*scroll-snap-type:x mandatory;/);
 assert.doesNotMatch(stylesheet,/fitActiveCard|refitTracks/);
 const t=textbookScenario('#s2-habit-check');
 for(const section of t.sections){
  const track=section.children.find(c=>c.className==='track');
  assert.ok(track.children.length>0);
  assert.equal(track.style.height,undefined);
  const cards=track.children;
  for(const card of cards){
   assert.ok(card.className.startsWith('lesson-card'));
   assert.equal(card.style.height,undefined,'per-card inline height is forbidden');
  }
 }
 const lessonTrack=t.sections[1].children.find(c=>c.className==='track');
 for(let i=0;i<lessonTrack.children.length;i++){
  const item=lessonTrack.children[i];
  item.offsetHeight=540+i*15;
 }
 t.next[1].click();
 t.next[1].click();
 assert.equal(lessonTrack.style.height,undefined,'outer track does not react to content length');
});
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
   'goalStartWeight','goalTargetWeight','goalLossWeight','goalLossRate','goalHistoryStatus',
  'weightTrendChart','weightChartStatus'];
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
test('registration weight computes STEP2 goal on sixth standalone card and saves percentages',()=>{
 const t=textbookScenario('',{'equineris:registration:v1':JSON.stringify({heightCm:'170',weightKg:'80'})});
 assert.equal(t.sections.length,6);
 for(let i=0;i<8;i++)t.next[0].click();
 assert.equal(t.count[0].textContent,'9 / 9');
 t.next[0].click();assert.ok(t.sections[1].scrolled);
 for(let i=0;i<5;i++)t.next[1].click();assert.equal(t.count[1].textContent,'6 / 13');
 const track=t.sections[1].children.find(c=>c.className==='track');
 const visual=track.children[5].children.find(c=>c.className.split(' ').includes('visual'));
 const calc=visual.children.find(c=>c.className==='goal-calculator');
 assert.ok(calc,'STEP2 sixth card calculator');
 const start=calc.children[0],rate=calc.children[1].children;
 const target=calc.children[2].children[0],out=calc.children[3],save=calc.children[4];
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
test('goal calculator preserves existing optional goals and blocks missing registration',()=>{
 const absent=textbookScenario('#s2-goal');
 const absentCard=absent.sections[1].children.find(c=>c.className==='track').children[5];
 const absentCalc=absentCard.children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.className==='goal-calculator');
 assert.equal(absentCalc.children[1].children[0].disabled,true);
 assert.equal(absentCalc.children[2].children[0].disabled,true);
 assert.equal(absentCalc.children[4].disabled,true);
 assert.equal(absent.localData.get('equineris:week1:goal:v1'),undefined);
 const seed={
  'equineris:registration:v1':JSON.stringify({heightCm:'170',weightKg:'80'}),
  'equineris:week1:goal:v1':JSON.stringify({startWeightKg:80,goalWeightKg:73.6,
   selectedRatePercent:8,weightAt20Kg:62,longestWeightKg:72,futureGoalWeightKg:68,selectedFutureBmi:22})
 };
 const prior=textbookScenario('#s2-goal',seed);
 const card=prior.sections[1].children.find(c=>c.className==='track').children[5];
 const calc=card.children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.className==='goal-calculator');
 assert.equal(calc.children[2].children[0].value,'73.6');
 assert.equal(calc.children[1].children[1].getAttribute('aria-pressed'),'true');
 calc.children[1].children[0].click();
 calc.children[4].click();
 const updated=JSON.parse(prior.localData.get('equineris:week1:goal:v1'));
 assert.equal(updated.goalWeightKg,76);
 assert.equal(updated.selectedRatePercent,5);
 assert.equal(updated.weightAt20Kg,62);
 assert.equal(updated.longestWeightKg,72);
 assert.equal(updated.futureGoalWeightKg,68);
 assert.equal(updated.selectedFutureBmi,22);
 const malformed='not-json';
 const blocked=textbookScenario('#s2-goal',{
  'equineris:registration:v1':JSON.stringify({heightCm:'170',weightKg:'80'}),
  'equineris:week1:goal:v1':malformed
 });
 const badCard=blocked.sections[1].children.find(c=>c.className==='track').children[5];
 const badCalc=badCard.children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.className==='goal-calculator');
 badCalc.children[1].children[1].click();
 assert.equal(badCalc.children[4].disabled,true);
 assert.equal(blocked.localData.get('equineris:week1:goal:v1'),malformed);
});
test('weight history uses a separate STEP2 slide immediately after page seven',()=>{
 const t=textbookScenario('#s2-c6');
 assert.equal(t.count[1].textContent,'7 / 13');
 t.next[1].click();
 assert.equal(t.count[1].textContent,'8 / 13');
 const track=t.sections[1].children.find(c=>c.className==='track');
 assert.equal(track.children[6].id,'s2-c6');
 assert.equal(track.children[7].id,'s2-weight-history');
 assert.equal(track.children[8].id,'s2-c7');
 const oldCard=track.children[6].children.find(c=>c.className.split(' ').includes('visual'));
 const history=track.children[7].children.find(c=>c.className.split(' ').includes('visual'));
 const newForm=history.children.find(c=>c.id==='textbookWeightHistory');
 assert.ok(newForm,'Historical weights form in dedicated slide');
 assert.equal(oldCard.children.some(c=>c.id==='textbookWeightHistory'),false);
 const first=newForm.children[0].children[0];
 const second=newForm.children[1].children[0];
 assert.equal(first.id,'textbookWeightAt20');
 assert.equal(second.id,'textbookLongestWeight');
 t.next[1].click();
 assert.equal(t.count[1].textContent,'9 / 13');
 assert.match(t.next[1].textContent,/食行動チェック/);
});
test('historical-weight guidance is exactly two sentence lines without changing text',()=>{
 const data=textbookData[1].cards[7];
 assert.equal(data.id,'s2-weight-history');
 const t=textbookScenario('#s2-weight-history');
 const track=t.sections[1].children.find(c=>c.className==='track');
 const history=track.children[7];
 const para=history.children.find(c=>c.className==='lesson-body');
 assert.ok(para,'history description');
 assert.equal(para.children.length,2);
 assert.equal(para.children[0].className,'weight-history-line');
 assert.equal(para.children[1].className,'weight-history-line');
 assert.equal(para.children[0].textContent,'覚えている体重を入力しましょう。');
 assert.equal(para.children[1].textContent,'空欄でも大丈夫です。');
 assert.equal(para.children.map(c=>c.textContent).join(''),data.body);
 assert.match(source['textbook.html'],/\.weight-history-line\{display:block\}/);
 const prev=track.children[6].children.find(c=>c.className==='lesson-body');
 const next=track.children[8].children.find(c=>c.className==='lesson-body');
 assert.equal(prev.children.length,0);
 assert.equal(next.children.length,0);
});
test('historical kg fields save and restore through the existing goal record',()=>{
 const reg={'equineris:registration:v1':JSON.stringify({name:'Test',heightCm:'170',weightKg:'80'})};
 const starting={...reg,'equineris:week1:goal:v1':JSON.stringify({startWeightKg:80,goalWeightKg:73.6,selectedRatePercent:8})};
 const t=textbookScenario('#s2-weight-history',starting);
 const track=t.sections[1].children.find(c=>c.className==='track');
 const visual=track.children[7].children.find(c=>c.className.split(' ').includes('visual'));
 const form=visual.children.find(c=>c.id==='textbookWeightHistory');
 assert.ok(form);
 const weight20=form.children[0].children[0],longest=form.children[1].children[0];
 const save=form.children[2],notice=form.children[3];
 assert.equal(weight20.value,'');
 assert.equal(longest.value,'');
 weight20.value='58.5';weight20.fire('input');
 longest.value='67.0';longest.fire('input');
 assert.equal(save.disabled,false);
 save.click();
 assert.match(notice.textContent,/記録しました/);
 const stored=JSON.parse(t.localData.get('equineris:week1:goal:v1'));
 assert.equal(stored.weightAt20Kg,58.5);
 assert.equal(stored.longestWeightKg,67);
 assert.equal(stored.goalWeightKg,73.6);
 assert.equal(stored.selectedRatePercent,8);
 assert.equal(t.localData.get('equineris:body-measurements:v1'),undefined);
 const reloaded=textbookScenario('#s2-weight-history',Object.fromEntries(t.localData));
 const reloadedForm=reloaded.sections[1].children.find(c=>c.className==='track').children[7]
  .children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.id==='textbookWeightHistory');
 assert.equal(reloadedForm.children[0].children[0].value,'58.5');
 assert.equal(reloadedForm.children[1].children[0].value,'67');
});
test('saving historical weights before goal setup keeps fields and does not break measurements page',()=>{
 const REG='equineris:registration:v1',GOAL='equineris:week1:goal:v1';
 const first=textbookScenario('#s2-weight-history',{[REG]:JSON.stringify({heightCm:'170',weightKg:'80'})});
 const card=first.sections[1].children.find(c=>c.className==='track').children[7];
 const form=card.children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.id==='textbookWeightHistory');
 const twenty=form.children[0].children[0],save=form.children[2];
 twenty.value='61.5';twenty.fire('input');
 save.click();
 const partial=JSON.parse(first.localData.get(GOAL));
 assert.equal(partial.startWeightKg,80);
 assert.equal(partial.weightAt20Kg,61.5);
 assert.equal(partial.longestWeightKg,null);
 assert.equal(partial.goalWeightKg,undefined);
 const ids=['recordDate','bodyWeight','bodyWaist','saveStatus','historyRows','metricForm',
  'recordTitle','back','startHeight','startWeight','startBMI','saveBaseline','baselineStatus',
  'goalStartWeight','goalTargetWeight','goalLossWeight','goalLossRate','goalHistoryStatus',
  'weightTrendChart','weightChartStatus'];
 const elements=Object.fromEntries(ids.map(id=>[id,new MockEl('input')]));
 const session=new Map(first.localData);
 vm.runInNewContext(scriptOf(source['measurements.html'])[0],{
  document:{referrer:'',getElementById:id=>elements[id],createElement:tag=>new MockEl(tag)},
  localStorage:{getItem:key=>session.get(key)??null,setItem:(key,v)=>session.set(key,String(v))},
  window:{confirm(){return false;}},location:{origin:'https://example.test'},URL,Date
 });
 assert.match(elements.goalHistoryStatus.textContent,/まだ設定されていません/);
 assert.equal(elements.goalHistoryStatus.dataset.error,'false');
 const next=textbookScenario('#s2-goal',Object.fromEntries(first.localData));
 const goalCard=next.sections[1].children.find(c=>c.className==='track').children[5];
 const calculator=goalCard.children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.className==='goal-calculator');
 calculator.children[1].children[1].click();
 calculator.children[4].click();
 const combined=JSON.parse(next.localData.get(GOAL));
 assert.equal(combined.weightAt20Kg,61.5);
 assert.equal(combined.goalWeightKg,73.6);
});
test('STEP2 page nine opens the original 17-item checklist as page ten',()=>{
 const ids=textbookData[1].cards.map(c=>c.id);
 assert.equal(ids[8],'s2-c7');
 assert.equal(ids[9],'s2-habit-check');
 assert.equal(ids[10],'s2-c8');
 const t=textbookScenario('#s2-c7');
 assert.equal(t.count[1].textContent,'9 / 13');
 assert.match(t.next[1].textContent,/食行動チェック/);
 t.next[1].click();
 assert.equal(t.location.destination,null,'must not jump to a separate page');
 assert.equal(t.count[1].textContent,'10 / 13');
 const track=t.sections[1].children.find(c=>c.className==='track');
 const visual=track.children[9].children.find(c=>c.className.split(' ').includes('visual'));
 assert.equal(visual.className,'visual visual--interactive');
 const widget=visual.children.find(c=>c.id==='textbookHabitCheck');
 assert.ok(widget,'standalone checklist');
 const list=widget.children[1];
 assert.equal(list.children.length,17);
 assert.equal(list.children[0].children[0].dataset.habit,'h01');
 assert.equal(list.children[16].children[0].dataset.habit,'h17');
 assert.match(source['textbook.html'],/\.habit-mini-list\{[^}]*max-height:290px;overflow-y:auto/);
 t.next[1].click();
 assert.equal(t.count[1].textContent,'11 / 13');
 assert.equal(t.location.destination,null);
 assert.match(source['habit-intro.html'],/textbook\.html#s2-c7/);
 assert.match(source['habit-check.html'],/textbook\.html#s2-c8/);
});
test('embedded checklist exactly matches the 17 original paper questions',()=>{
 const original=[...source['habit-check.html'].matchAll(/data-habit="(h\d{2})" aria-label="([^"]+)"/g)]
  .map(m=>({id:m[1],text:m[2]}));
 const seeded=textbookScenario('#s2-habit-check');
 const track=seeded.sections[1].children.find(c=>c.className==='track');
 const widget=track.children[9].children.find(c=>c.className.split(' ').includes('visual'))
  .children.find(c=>c.id==='textbookHabitCheck');
 const rows=widget.children[1].children.map(row=>({id:row.children[0].dataset.habit,
  text:row.children[2].textContent}));
 assert.equal(original.length,17);
 assert.deepEqual(rows,original,'no rewording, omissions or altered order');
});
test('checks auto-save, reload and preserve the existing localStorage key',()=>{
 const key='equineris:program:habit-check:v1';
 const original=['h02','h08'];
 const t=textbookScenario('#s2-habit-check',{[key]:JSON.stringify(original)});
 const widget=t.sections[1].children.find(c=>c.className==='track').children[9]
  .children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.id==='textbookHabitCheck');
 const rows=widget.children[1].children;
 assert.equal(rows.length,17);
 assert.equal(rows[1].children[0].checked,true);
 assert.equal(rows[7].children[0].checked,true);
 assert.equal(rows[0].children[0].checked,false);
 assert.equal(widget.children[2].textContent,'○を付けた項目：2 / 17');
 rows[0].children[0].checked=true;rows[0].children[0].fire('change');
 assert.deepEqual(JSON.parse(t.localData.get(key)),['h01','h02','h08']);
 assert.equal(widget.children[2].textContent,'○を付けた項目：3 / 17');
 rows[1].children[0].checked=false;rows[1].children[0].fire('change');
 assert.deepEqual(JSON.parse(t.localData.get(key)),['h01','h08']);
 widget.children[3].click();
 assert.deepEqual(JSON.parse(t.localData.get(key)),['h01','h08']);
 const reloaded=textbookScenario('#s2-habit-check',Object.fromEntries(t.localData));
 const restored=reloaded.sections[1].children.find(c=>c.className==='track').children[9]
  .children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.id==='textbookHabitCheck');
 assert.equal(restored.children[1].children[0].children[0].checked,true);
 assert.equal(restored.children[1].children[7].children[0].checked,true);
 assert.equal(restored.children[1].children[1].children[0].checked,false);
});
test('corrupt checklist storage is never silently overwritten',()=>{
 const key='equineris:program:habit-check:v1';
 const t=textbookScenario('#s2-habit-check',{[key]:'not-json'});
 const widget=t.sections[1].children.find(c=>c.className==='track').children[9]
  .children.find(c=>c.className.split(' ').includes('visual')).children.find(c=>c.id==='textbookHabitCheck');
 assert.equal(widget.children[3].disabled,true);
 widget.children[1].children[0].children[0].checked=true;
 widget.children[1].children[0].children[0].fire('change');
 assert.equal(t.localData.get(key),'not-json');
});
test('after the checklist, STEP2 and STEP3 advance to STEP4 food diary',()=>{
 const t=textbookScenario('#s2-c8');
 assert.equal(t.count[1].textContent,'11 / 13');
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
   'goalStartWeight','goalTargetWeight','goalLossWeight','goalLossRate','goalHistoryStatus',
  'weightTrendChart','weightChartStatus'];
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
test('weight trend uses actual dates and saved weights, without fabricated values',()=>{
 const nodes=Object.fromEntries(['weightTrendChart','weightChartStatus'].map(id=>[id,new MockEl('svg')]));
 const document={createElementNS:(_ns,tag)=>new MockEl(tag)};
 const window={};
 vm.runInNewContext(source['weight-trend.js'],{document,window,Date});
 const graph=window.EquinerisWeightTrend;
 assert.equal(graph.KEY,'equineris:body-measurements:v1');
 let result=graph.render(nodes.weightTrendChart,nodes.weightChartStatus,{});
 assert.equal(result.count,0);
 assert.equal(nodes.weightTrendChart.children.length,0,'no invented sample line');
 assert.match(nodes.weightChartStatus.textContent,/体重を記録すると/);
 result=graph.render(nodes.weightTrendChart,nodes.weightChartStatus,{
  '2026-11-10':{weight:78,waist:90},
  '2026-11-01':{weight:80,waist:92},
  '2026-11-04':{waist:91},
  '2026-11-12':{weight:76.5},
  '2026-02-30':{weight:55},
  '2026-11-15':{weight:null}
 });
 assert.equal(result.count,3);
 assert.equal(result.first,80);
 assert.equal(result.last,76.5);
 const dots=nodes.weightTrendChart.children.filter(el=>el.tagName==='circle');
 const lines=nodes.weightTrendChart.children.filter(el=>el.tagName==='path');
 assert.equal(dots.length,3);
 assert.equal(lines.length,1);
 assert.ok(Number(dots[2].attributes.cy)>Number(dots[0].attributes.cy),'decreasing kg is a downward screen line');
 assert.match(nodes.weightChartStatus.textContent,/－3\.5 kg/);
 result=graph.render(nodes.weightTrendChart,nodes.weightChartStatus,{
  '2026-11-01':{weight:70},'2026-11-03':{weight:72}
 });
 assert.equal(result.count,2);
 const risingDots=nodes.weightTrendChart.children.filter(el=>el.tagName==='circle');
 assert.ok(Number(risingDots[1].attributes.cy)<Number(risingDots[0].attributes.cy),
  'real increases must not be falsely drawn as a decrease');
});
test('weight trend updates after saving and deleting records on the measurements page',()=>{
 const key='equineris:body-measurements:v1';
 const ids=['recordDate','bodyWeight','bodyWaist','saveStatus','historyRows','metricForm',
  'recordTitle','back','startHeight','startWeight','startBMI','saveBaseline','baselineStatus',
  'goalStartWeight','goalTargetWeight','goalLossWeight','goalLossRate','goalHistoryStatus',
  'weightTrendChart','weightChartStatus'];
 const els=Object.fromEntries(ids.map(id=>[id,new MockEl('input')]));
 const document={referrer:'',getElementById:id=>els[id],
  createElement:tag=>new MockEl(tag),createElementNS:(_ns,tag)=>new MockEl(tag)};
 const storage=new Map();
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
 const window={confirm(){return true}};
 vm.runInNewContext(source['weight-trend.js'],{document,window,Date});
 vm.runInNewContext(scriptOf(source['measurements.html'])[0],
  {document,window,localStorage,Date,URL,location:{origin:'https://example.test'}});
 const dots=()=>els.weightTrendChart.children.filter(n=>n.tagName==='circle');
 const paths=()=>els.weightTrendChart.children.filter(n=>n.tagName==='path');
 assert.equal(dots().length,0);
 assert.equal(storage.get(key),undefined,'opening the graph must not create a record');
 els.recordDate.value='2026-11-01';els.bodyWeight.value='80';els.bodyWaist.value='90';
 els.metricForm.fire('submit');
 assert.equal(dots().length,1);
 assert.equal(paths().length,0);
 els.recordDate.value='2026-11-10';els.bodyWeight.value='78';els.bodyWaist.value='';
 els.metricForm.fire('submit');
 assert.equal(dots().length,2);
 assert.equal(paths().length,1);
 assert.match(els.weightChartStatus.textContent,/－2\.0 kg/);
 assert.equal(JSON.parse(storage.get(key))['2026-11-01'].weight,80);
 assert.equal(JSON.parse(storage.get(key))['2026-11-10'].weight,78);
 const firstHistory=els.historyRows.children[0];
 assert.ok(firstHistory,'latest history present');
 firstHistory.children[1].click();
 assert.equal(dots().length,1,'deleting latest record refreshes graph');
 assert.equal(paths().length,0);
 assert.equal(JSON.parse(storage.get(key))['2026-11-10'],undefined);
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
