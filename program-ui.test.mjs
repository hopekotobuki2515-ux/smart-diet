import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import * as config from './program-config.js';
import { CURRICULUM } from './program-curriculum.js';
import { SAMPLE_CATEGORIES, resolveSample } from './program-samples.js';

const html = readFileSync(new URL('./program.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./program.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const master = JSON.parse(readFileSync(new URL('./food-master.json', import.meta.url)));
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
const tokyoDate = date => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);

async function openApp(store) {
  const dom = new JSDOM(html, {url:'https://example.test/program.html',runScripts:'outside-only'});
  const win = dom.window, failures = [];
  win.addEventListener('error', event => failures.push(event.message));
  win.scrollTo = () => {};
  win.structuredClone = structuredClone;
  win.TextEncoder = TextEncoder;
  Object.defineProperty(win.crypto, 'subtle', {value:webcrypto.subtle});
  win.crypto.randomUUID = () => Math.random().toString(36).slice(2);
  win.fetch = async () => ({ok:true,json:async()=>master});
  const objectUrls = new Map();
  win.URL.createObjectURL = file => {
    const url='blob:mock/'+win.crypto.randomUUID();
    objectUrls.set(url,file);
    return url;
  };
  win.URL.revokeObjectURL = url => objectUrls.delete(url);
  if (store.photos) {
    const db={
      close(){},
      transaction(){
        const transaction={};
        const write=action=>queueMicrotask(()=>{
          if (store.abortPhoto) transaction.onabort();
          else {action();transaction.oncomplete();}
        });
        transaction.objectStore=()=>({
          put(file,id){write(()=>store.photos.set(id,file))},
          delete(id){write(()=>store.photos.delete(id))},
          get(id){
            const request={result:store.photos.get(id)};
            queueMicrotask(()=>request.onsuccess());
            return request;
          }
        });
        return transaction;
      }
    };
    win.indexedDB={open(){
      const request={result:db};
      queueMicrotask(()=>request.onsuccess());
      return request;
    }};
  }
  win.HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','')};
  win.HTMLDialogElement.prototype.close = function(){
    this.removeAttribute('open');
    this.dispatchEvent(new win.Event('close'));
  };
  Object.assign(win, config, {CURRICULUM,SAMPLE_CATEGORIES,resolveSample});
  win.initializeApp = x => x; win.getAuth = () => ({currentUser:{uid:'test-user'}});
  win.getFirestore = () => ({}); win.doc = (...args) => args;
  win.getDoc = async ref => {
    if (ref[1] === 'programAdmissions') return {exists:()=>Boolean(store.admitted)};
    if(ref[1] === 'coachComments') {
      if(store.commentError) throw new Error('permission-denied');
      return {exists:()=>Boolean(store.comment),data:()=>structuredClone(store.comment)};
    }
    return {exists:()=>Object.keys(store.value).length>0,data:()=>structuredClone(store.value)};
  };
  win.arrayUnion = value => ({__union:value});
  const merge = (target, patch) => {
    for (const [key,value] of Object.entries(patch)) {
      if (value && value.__union !== undefined) target[key] = [...(target[key]||[]),value.__union];
      else if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge(target[key]||{},value);
      else target[key] = value;
    }
    return target;
  };
  win.setDoc = async (ref,patch) => {
    if(store.failMeal && patch.meals)throw new Error('write failed');
    if (ref[1] === 'programAdmissions') {
      const expected = createHash('sha256').update('test-only invite').digest('hex');
      if (patch.digest !== expected || store.admitted) {
        throw Object.assign(new Error('denied'), {code:'permission-denied'});
      }
      store.admitted = true;
    } else {
      store.value=merge(store.value,structuredClone(patch));
    }
  };
  win.signInWithEmailAndPassword = async () => {};
  win.onAuthStateChanged = (_auth, callback) => queueMicrotask(()=>callback({uid:'test-user'}));
  win.eval(source);
  await pause();
  const q = selector => win.document.querySelector(selector);
  const fill = (selector,value) => {const input=q(selector);input.value=value;input.dispatchEvent(new win.Event('input',{bubbles:true}))};
  const submit = selector => q(selector).dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,win,q,fill,submit,failures,objectUrls};
}

test('initial setup, master calculation, records and goal history survive reload', async () => {
  const store = {value:{}}, app = await openApp(store);
  try {
    assert.equal(app.q('#invite').hidden,false);
    assert.equal(app.q('#setup').hidden,true);
    app.fill('#inviteForm input','wrong code');
    app.submit('#inviteForm');await pause();
    assert.equal(app.q('#setup').hidden,true);
    assert.match(app.q('#status').textContent,/共通パスワードを確認してください/);
    app.fill('#inviteForm input','test-only invite');
    app.submit('#inviteForm');await pause();
    assert.equal(app.q('#invite').hidden,true);
    assert.equal(app.q('#setup').hidden,false);
    assert.equal(store.admitted,true);
    for(const [name,value] of Object.entries({name:'テスト',age:'45',heightCm:'170',startWeight:'70',waist:'85'})) app.fill(`[name="${name}"]`,value);
    assert.match(app.q('#goalPreview').textContent,/66\.5kg/);
    app.submit('#setupForm');await pause();
    assert.equal(store.value.profile.name,'テスト');
    assert.equal(store.value.onboarding.mode,'observe');
    app.q('[data-mode="program"]').click();await pause();
    assert.equal(store.value.onboarding.programStartDate,tokyoDate(new Date()));
    assert.match(app.q('#sampleCard').textContent,/15\.00点/);
    app.q('#sampleCard [data-sample="コンビニ"]').click();
    assert.match(app.q('#sampleCard').textContent,/コンビニの見本は確認中/);
    assert.equal(app.q('#sampleCard [data-sample="コンビニ"]').getAttribute('aria-selected'),'true');
    assert.equal(app.q('#sampleCard [data-sample="ファストフード"]').textContent,'ファストフード');
    app.q('[data-page="record"]').click();
    store.value.meals=[{id:'from-another-device',date:tokyoDate(new Date()),type:'昼食',food:'普通牛乳',amount:'120g',points:1,photoId:null}];
    app.fill('#foodSearch','めし・水稲・精白米');
    app.q('#foodResults button').click();
    app.fill('#quickGrams','150');
    assert.equal(app.q('#mealForm [name="grams"]').value,'150');
    assert.match(app.q('#pointPreview').textContent,/3\.00点/);
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals.length,2);
    assert.equal(store.value.meals[0].id,'from-another-device');
    assert.equal(store.value.meals[1].points,3);
    app.fill('#measurementForm [name="weight"]','69.2');
    app.submit('#measurementForm');await pause();
    assert.equal(Object.values(store.value.measurements)[0].weight,69.2);
    app.q('[data-page="week"]').click();
    app.q('#questionForm [name="reason"]').click();
    app.submit('#questionForm');await pause();
    assert.ok(store.value.answers[1].reason.length);
    app.q('[data-page="more"]').click();
    app.fill('#goalForm select','8');
    app.submit('#goalForm');await pause();
    assert.equal(store.value.goals.at(-1).target,64.4);
    assert.equal(store.value.goals[0].target,66.5);
    assert.equal(store.value.goals.at(-1).reviewStatus,'pending');
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
  const reloaded = await openApp(store);
  try {
    assert.equal(reloaded.q('#setup').hidden,true);
    assert.match(reloaded.q('#home').textContent,/テストさん/);
    reloaded.q('[data-page="record"]').click();
    assert.match(reloaded.q('#mealList').textContent,/3点/);
    assert.deepEqual(reloaded.failures,[]);
  } finally {reloaded.dom.window.close()}
});

test('weeks advance without requiring the lesson and the final week shows more than weight', async () => {
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:tokyoDate(new Date(Date.now()-8*86400000))};
  const store={value:{profile,goals:[{percent:5,target:66.5,changedAt:new Date().toISOString()}],meals:[],measurements:{}}};
  const app=await openApp(store);
  try {
    app.q('[data-page="week"]').click();
    assert.match(app.q('#week').textContent,/第2週/);
    app.q('[data-page="learn"]').click();
    assert.equal(app.win.document.querySelectorAll('#learn li').length,12);
    assert.equal(app.win.document.querySelectorAll('#learn details').length,2);
    app.q('#learn details').open=true;
    assert.match(app.q('#learn details').textContent,/まず今の自分を知ろう/);
    app.q('#learn [data-go="week"]').click();
    assert.equal(app.q('#week').hidden,false);
    const options=app.win.document.querySelectorAll('#weeklyQuestionForm [name="answer"]');
    options[0].click();options[1].click();options[2].click();
    app.submit('#weeklyQuestionForm');await pause();
    assert.match(app.q('#status').textContent,/2個まで/);
    options[2].click();app.submit('#weeklyQuestionForm');await pause();
    assert.equal(store.value.answers[2].choices.length,2);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
  store.value.profile.startDate=tokyoDate(new Date(Date.now()-90*86400000));
  const final = await openApp(store);
  try {
    final.q('[data-page="week"]').click();
    assert.match(final.q('#week').textContent,/第12週/);
    assert.match(final.q('#week').textContent,/食事を記録した日/);
    assert.match(final.q('#week').textContent,/食品量/);
    assert.deepEqual(final.failures,[]);
  } finally {final.dom.window.close()}
});

test('foods with the same name use the selected master category for points', async () => {
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:tokyoDate(new Date())};
  const store={value:{profile,meals:[],savedFoods:['ひき肉']}};
  const app=await openApp(store);
  try {
    app.q('[data-page="record"]').click();
    app.q('#savedFoods button').click();
    app.fill('#mealForm [name="grams"]','50');
    assert.match(app.q('#selectedFood').textContent,/分類を選んで/);
    assert.equal(app.q('#pointPreview').textContent,'');
    app.fill('#foodSearch','ひき肉');
    const candidates=[...app.win.document.querySelectorAll('#foodResults button')];
    assert.equal(candidates.length,3);
    assert.match(candidates[2].textContent,/鶏肉/);
    candidates[2].click();
    assert.match(app.q('#pointPreview').textContent,/1\.00点/);
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals[0].points,1);
    assert.match(store.value.meals[0].category,/鶏肉/);
    assert.match(app.q('#recentFoods button').textContent,/鶏肉/);
    app.q('#recentFoods button').click();
    app.fill('#mealForm [name="grams"]','50');
    assert.match(app.q('#pointPreview').textContent,/1\.00点/);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('a client can record a food group and points without a master match', async () => {
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:tokyoDate(new Date())};
  const store={value:{profile,meals:[]}};
  const app=await openApp(store);
  try {
    app.q('[data-page="record"]').click();
    app.fill('#mealForm [name="food"]','野菜炒め');
    app.fill('#mealForm [name="amount"]','小皿1杯');
    app.fill('#mealForm [name="group"]','第4群');
    app.fill('#mealForm [name="points"]','2.5');
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals[0].food,'野菜炒め');
    assert.equal(store.value.meals[0].group,'第4群');
    assert.equal(store.value.meals[0].points,2.5);
    assert.equal(store.value.meals[0].pointSource,'user');
    assert.match(app.q('#mealList').textContent,/第4群/);
    assert.match(app.q('#mealList').textContent,/2\.5点/);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('the day sheet combines legacy meals and a multi-ingredient draft, then restores it after retry and reload', async () => {
  const date=tokyoDate(new Date());
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date};
  const store={value:{profile,meals:[
    {date,type:'朝食',food:'普通牛乳',group:'第1群',points:1}
  ],measurements:{[date]:{weight:69.5,condition:'良い',memo:'今日の記録'}}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    app.q('[data-meal="夕食"]').click();
    app.fill('#mealForm [name=time]','19:15');
    function add(query, grams){
      app.fill('#foodSearch',query);
      app.q('#foodResults button').click();
      app.fill('#quickGrams',grams);
      app.q('#addIngredient').click();
    }
    add('ご飯','80');
    app.fill('#mealForm [name=dish]','ささみのソテー');
    app.fill('#foodSearch','ささみ');
    app.q('#foodResults button').click();
    app.fill('#quickGrams','custom');
    app.fill('#mealForm [name=grams]','42');
    app.q('#addIngredient').click();
    add('ごま油','');
    assert.equal(app.q('#ingredientList').children.length,3);
    app.q('#dayPreview').click();
    assert.equal(app.q('#daySheet').open,true);
    assert.match(app.q('#daySheet').textContent,/69.5 kg/);
    assert.match(app.q('#daySheet').textContent,/今日の記録/);
    assert.match(app.q('#daySheet tbody').textContent,/普通牛乳/);
    const dinner=app.q('#daySheet tbody:nth-of-type(3)');
    assert.equal(dinner.querySelector('time').textContent,'19:15');
    assert.equal(dinner.querySelectorAll('.sheet-dish').length,1);
    assert.equal([...dinner.rows].find(row=>row.textContent.includes('ごま油')).cells[4].textContent,'○');
    assert.match(dinner.querySelector('.sheet-subtotal').textContent,/2\.16点/);
    assert.match(app.q('#daySheet tfoot').textContent,/3\.16点/);
    assert.equal(store.value.meals.length,1);
    app.q('#daySheet button').click();
    assert.equal(app.q('#daySheet').open,false);
    store.failMeal=true;
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals.length,1);
    assert.equal(app.q('#ingredientList').children.length,3);
    store.failMeal=false;
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals.length,2);
    assert.deepEqual(store.value.meals[1].ingredients.map(item=>item.points),[1.6,0.56,null]);
    assert.equal(store.value.meals[1].ingredients[2].group,'第4群');
    assert.equal(app.q('#ingredientList').children.length,0);
    const reloaded=await openApp(store);
    try {
      reloaded.q('[data-page=record]').click();
      reloaded.q('#dayPreview').click();
      assert.match(reloaded.q('#daySheet tfoot').textContent,/3\.16点/);
      assert.match(reloaded.q('#daySheet').textContent,/ささみのソテー/);
    } finally {reloaded.dom.window.close()}
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('selecting another food keeps the first portion and resets the next amount before one meal save', async () => {
  const date=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const select = query => {
      app.fill('#foodSearch',query);
      app.q('#foodResults button').click();
    };
    select('ご飯');
    app.fill('#quickGrams','80');
    app.fill('#foodSearch','ごま油');
    assert.match(app.q('#selectedFood').textContent,/精白米/);
    app.q('#foodResults button').click();
    assert.match(app.q('#ingredientList').textContent,/精白米.*80g.*1\.6点/);
    assert.match(app.q('#ingredientCount').textContent,/1品/);
    assert.equal(app.q('#quickGrams').value,'');
    assert.match(app.q('#pointPreview').textContent,/量不明/);
    select('ごま油');
    assert.equal(app.q('#ingredientList').children.length,1);
    select('ささみ');
    app.q('#clearSelectedFood').click();
    assert.equal(app.q('#ingredientList').children.length,2);
    assert.equal(app.q('#pointPreview').textContent,'');
    select('ささみ');
    app.fill('#quickGrams','75');
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals.length,1);
    assert.deepEqual(store.value.meals[0].ingredients.map(item=>[item.grams,item.points]),[[80,1.6],[null,null],[75,1]]);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('dish choices keep ingredients in their respective dishes and remember a custom name after saving', async () => {
  const date=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const pickDish=value=>{
      const picker=app.q('#dishChoice');
      picker.value=value;
      picker.dispatchEvent(new app.win.Event('change',{bubbles:true}));
    };
    const selectFood=query=>{
      app.fill('#foodSearch',query);
      app.q('#foodResults button').click();
    };
    assert.equal(app.q('#customDish').hidden,true);
    pickDish('name:焼き魚');
    selectFood('ささみ');
    app.fill('#quickGrams','75');
    pickDish('custom');
    assert.match(app.q('#ingredientList').textContent,/焼き魚.*ささ身.*75g/);
    assert.equal(app.q('#customDish').hidden,false);
    assert.equal(app.q('#quickGrams').value,'');
    app.fill('[name=dish]','うちの和え物');
    selectFood('ごま油');
    app.q('#dayPreview').click();
    assert.deepEqual([...app.win.document.querySelectorAll('.sheet-dish')].map(x=>x.textContent),['焼き魚','うちの和え物']);
    app.q('#daySheet button').click();
    app.submit('#mealForm');await pause();
    assert.deepEqual(store.value.meals[0].ingredients.map(x=>x.dish),['焼き魚','うちの和え物']);
    assert.ok([...app.q('#dishChoice').options].some(option=>option.textContent==='うちの和え物'));
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('dish name suggestions use master foods and prior selections without assigning quantities', async () => {
  const date=tokyoDate(new Date());
  const sesame=master.foods.find(food=>food.name==='ごま油');
  const masterId=JSON.stringify([sesame.name,sesame.category,sesame.gramsPerPoint]);
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date},meals:[
    {date,type:'朝食',ingredients:[{dish:'いつもの和え物',food:sesame.name,masterId,grams:5,points:0.56}]}
  ]}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const picker=app.q('#dishChoice');
    const pick=value=>{
      picker.value=value;
      picker.dispatchEvent(new app.win.Event('change',{bubbles:true}));
    };
    const options=()=>[...app.win.document.querySelectorAll('#dishSuggestions button')];
    assert.equal(app.q('#dishSuggestions').hidden,true);
    pick('name:ご飯');
    assert.deepEqual(options().map(button=>button.textContent),['めし・水稲・精白米']);
    pick('name:焼き魚');
    assert.equal(options().length,3);
    pick('name:アジフライ');
    assert.equal(options().length,5);
    assert.ok(options().some(button=>button.textContent==='調合油'));
    pick('custom');
    app.fill('[name=dish]','味噌汁');
    assert.equal(options().length,7);
    assert.equal(app.q('#ingredientList').children.length,0);
    assert.equal(app.q('[name=food]').value,'');
    options().find(button=>button.textContent==='もめん豆腐').click();
    assert.equal(app.q('[name=food]').value,'もめん豆腐');
    assert.equal(app.q('#quickGrams').value,'');
    assert.equal(app.win.document.activeElement,app.q('#quickGrams'));
    pick('name:いつもの和え物');
    options()[0].click();
    assert.equal(app.q('[name=food]').value,'ごま油');
    assert.equal(app.q('[name=grams]').value,'');
    pick('custom');
    app.fill('[name=dish]','名前だけの料理');
    assert.match(app.q('#dishSuggestions').textContent,/候補はありません/);
    assert.equal(options().length,0);
    assert.equal(store.value.meals.length,1);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('spaghetti names suggest the dry master entry without assuming the cooked weight', async () => {
  const startDate=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const picker=app.q('#dishChoice');
    picker.value='custom';
    picker.dispatchEvent(new app.win.Event('change',{bubbles:true}));
    const name='マカロニ・スパゲッティ・乾';
    for(const title of ['スパゲティ','スパゲッティ','パスタ']){
      const label=title==='パスタ'?'パスタ（乾麺）':'スパゲッティ（乾麺）';
      app.fill('[name=dish]',title);
      assert.deepEqual([...app.win.document.querySelectorAll('#dishNameSuggestions button')].map(button=>button.textContent),
        ['ミートソーススパゲティ','ナポリタン','カルボナーラ','ペペロンチーノ']);
      assert.equal(app.q('#dishSuggestions button').textContent,label);
      assert.match(app.q('#dishSuggestions').textContent,/ゆでる前の量/);
      app.fill('#foodSearch',title);
      assert.ok(app.q('#foodResults button').textContent.startsWith('スパゲッティ（乾麺）'));
    }
    app.fill('[name=dish]','ナポ');
    assert.deepEqual([...app.win.document.querySelectorAll('#dishNameSuggestions button')].map(button=>button.textContent),['ナポリタン']);
    app.q('#dishNameSuggestions button').click();
    assert.equal(app.q('[name=dish]').value,'ナポリタン');
    assert.equal(app.q('#dishNameSuggestions').hidden,true);
    assert.equal(app.q('#dishSuggestions button').textContent,'スパゲッティ（乾麺）');
    assert.equal(app.q('#ingredientList').children.length,0);
    app.q('#dishSuggestions button').click();
    assert.equal(app.q('#selectedFood').textContent,'スパゲッティ（乾麺）｜食品群：第4群｜乾麺21gで1点');
    assert.equal(app.q('#quickGrams').value,'');
    assert.match(app.q('#pointPreview').textContent,/第4群：○（量不明）/);
    app.fill('#quickGrams','custom');
    app.fill('[name=grams]','21');
    app.q('#dayPreview').click();
    assert.match(app.q('#daySheet').textContent,/スパゲッティ（乾麺） 21g.*1点/);
    app.q('#daySheet button').click();
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals[0].ingredients[0].dish,'ナポリタン');
    assert.equal(store.value.meals[0].ingredients[0].food,name);
    assert.equal(store.value.meals[0].ingredients[0].points,1);
    assert.match(app.q('#mealList').textContent,/スパゲッティ（乾麺）/);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('meal entry opens quantity only for a selected ingredient and keeps the simplified flow through save', async () => {
  const startDate=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const editor=app.q('#ingredientEditor');
    assert.equal(editor.hidden,true);
    assert.equal(app.q('#foodShortcuts').hidden,true);
    const extras=app.q('[name=memo]').closest('details');
    assert.equal(extras.open,false);
    app.fill('#foodSearch','ご飯');
    app.q('#foodResults button').click();
    assert.equal(editor.hidden,false);
    assert.equal(app.q('#exactGrams').hidden,true);
    assert.equal(app.win.document.activeElement,app.q('#quickGrams'));
    app.fill('#quickGrams','80');
    app.q('#addIngredient').click();
    assert.equal(editor.hidden,true);
    assert.match(app.q('#ingredientList').textContent,/80g.*1\.6点/);
    assert.equal(app.win.document.activeElement,app.q('#foodSearch'));
    extras.open=true;
    app.fill('[name=time]','12:30');
    app.fill('[name=memo]','食事のメモ');
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals[0].ingredients[0].points,1.6);
    assert.equal(store.value.meals[0].time,'12:30');
    assert.equal(store.value.meals[0].memo,'食事のメモ');
    assert.equal(app.q('#foodShortcuts').hidden,false);
    assert.equal(app.q('#foodShortcuts').open,false);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('food search displays and saves spaghetti and macaroni as distinct labels for the same master entry', async () => {
  const startDate=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const spaghetti='スパゲッティ（乾麺）', macaroni='マカロニ（乾麺）';
    const results=()=>[...app.win.document.querySelectorAll('#foodResults button')];
    app.fill('#foodSearch','スパゲ');
    assert.equal(results().length,1);
    assert.ok(results()[0].textContent.startsWith(spaghetti));
    app.fill('#foodSearch','マカロニ');
    assert.ok(results()[0].textContent.startsWith(macaroni));
    app.fill('#foodSearch','マカロニ・スパゲッティ・乾');
    assert.equal(results().length,2);
    assert.ok(results()[0].textContent.startsWith(spaghetti));
    assert.ok(results()[1].textContent.startsWith(macaroni));
    results()[0].click();
    assert.equal(app.q('#foodSearch').value,spaghetti);
    app.fill('#quickGrams','custom');
    app.fill('[name=grams]','21');
    app.fill('#foodSearch','マカロニ');
    results()[0].click();
    assert.equal(app.q('#foodSearch').value,macaroni);
    assert.equal(app.q('#quickGrams').value,'');
    app.fill('#quickGrams','custom');
    app.fill('[name=grams]','42');
    app.submit('#mealForm');await pause();
    const [first,second]=store.value.meals[0].ingredients;
    assert.deepEqual([first.foodLabel,second.foodLabel],[spaghetti,macaroni]);
    assert.equal(first.masterId,second.masterId);
    assert.deepEqual([first.points,second.points],[1,2]);
    app.q('#mealList [data-saved-diary]').click();
    assert.match(app.q('#daySheet').textContent,/スパゲッティ（乾麺） 21g.*マカロニ（乾麺） 42g/s);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('photo and memo survive retries after local and remote failures, with one final local copy', async () => {
  const date=tokyoDate(new Date());
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date};
  const store={value:{profile,meals:[]},photos:new Map()};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const input=app.q('#mealForm [name=photo]');
    const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WkQAAAAASUVORK5CYII=','base64');
    const photo=new app.win.File([pixel],'sample.png',{type:'image/png'});
    Object.defineProperty(input,'files',{value:[photo]});
    app.fill('#mealForm [name=memo]','朝食のメモ');
    app.q('#dayPreview').click();
    const draftUrl=app.q('#daySheet img').getAttribute('src');
    assert.equal(app.objectUrls.get(draftUrl),photo);
    assert.match(app.q('#daySheet').textContent,/朝食のメモ/);
    assert.equal(store.photos.size,0);
    app.q('#daySheet button').click();
    assert.equal(app.objectUrls.has(draftUrl),false);
    store.abortPhoto=true;
    app.submit('#mealForm');await pause();
    assert.equal(app.q('#mealForm button[type=submit]').disabled,false);
    assert.equal(store.value.meals.length,0);
    assert.equal(store.photos.size,0);
    store.abortPhoto=false;
    store.failMeal=true;
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals.length,0);
    assert.equal(store.photos.size,0);
    assert.equal(input.files[0],photo);
    store.failMeal=false;
    app.submit('#mealForm');await pause();
    assert.equal(store.value.meals.length,1);
    const entry=store.value.meals[0];
    assert.equal(store.photos.size,1);
    assert.equal(store.photos.get(entry.photoId),photo);
    assert.equal(entry.memo,'朝食のメモ');
    assert.equal(entry.ingredients.length,0);
    assert.equal(Object.values(entry).includes(photo),false);
    const reloaded=await openApp(store);
    try {
      reloaded.q('[data-page=record]').click();
      reloaded.q('#dayPreview').click();await pause();
      const savedUrl=reloaded.q('#daySheet img').getAttribute('src');
      assert.equal(reloaded.objectUrls.get(savedUrl),photo);
      reloaded.q('#daySheet button').click();
      assert.equal(reloaded.objectUrls.has(savedUrl),false);
      assert.deepEqual(reloaded.failures,[]);
    } finally {reloaded.dom.window.close()}
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('food master offers a browsable catalog and recipe ingredients in the direct diary', async () => {
  const date=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date},meals:[]}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    const openCatalog=selector=>{
      const panel=app.q(selector);
      panel.open=true;
      panel.dispatchEvent(new app.win.Event('toggle'));
      return panel;
    };
    const catalog=openCatalog('#foodCatalog');
    assert.match(catalog.querySelector('[data-catalog-status]').textContent,/686件中 1〜12件/);
    catalog.querySelector('[data-catalog-next]').click();
    assert.match(catalog.querySelector('[data-catalog-status]').textContent,/13〜24件/);
    app.fill('#foodCatalog input[type=search]','ご飯');
    assert.match(catalog.querySelector('[data-catalog-status]').textContent,/1件見つかりました/);
    const rice=catalog.querySelector('[data-catalog-results] button');
    assert.match(rice.textContent,/^ご飯（.*精白米.*第4群.*50gで1点/);
    rice.click();
    assert.equal(catalog.open,false);
    assert.equal(app.q('#ingredientEditor').hidden,false);
    app.q('#clearSelectedFood').click();
    app.q('#editDaySheet').click();
    app.q('[data-sheet-meal="昼食"]').click();
    const direct=openCatalog('[data-sheet-catalog]');
    const group=direct.querySelector('select');
    group.value='第1群';
    group.dispatchEvent(new app.win.Event('change'));
    app.fill('[data-sheet-catalog] input[type=search]','牛乳');
    assert.match(direct.querySelector('[data-catalog-results] button').textContent,/牛乳.*第1群/);
    app.fill('[data-sheet-catalog] input[type=search]','ご飯');
    assert.match(direct.querySelector('[data-catalog-status]').textContent,/0件.*すべて/);
    app.fill('[data-sheet-catalog] input[type=search]','牛乳');
    direct.querySelector('[data-catalog-results] button').click();
    assert.equal(direct.open,false);
    assert.match(app.q('[data-sheet-points]').textContent,/第1群/);
    app.fill('#sheetEntryForm [name=food]','スパゲッティ');
    const napolitan=[...app.win.document.querySelectorAll('[data-sheet-results] button')].find(button=>button.textContent==='ナポリタン');
    assert.ok(napolitan);
    napolitan.click();
    assert.match(app.q('[data-sheet-results]').textContent,/この料理の食材候補.*スパゲッティ（乾麺）/);
    app.fill('#sheetEntryForm [name=food]','味噌');
    const soup=[...app.win.document.querySelectorAll('[data-sheet-results] button')].find(button=>button.textContent==='みそ汁');
    assert.ok(soup);
    soup.click();
    assert.match(app.q('[data-sheet-results] p').textContent,/この料理の食材候補/);
    const tofu=[...app.win.document.querySelectorAll('[data-sheet-results] button')].find(button=>button.textContent.startsWith('もめん豆腐'));
    tofu.click();
    const wakame=[...app.win.document.querySelectorAll('[data-sheet-results] button')].find(button=>button.textContent.startsWith('カットわかめ'));
    assert.ok(wakame,'the other recipe ingredients remain available');
    wakame.click();
    const greenOnion=[...app.win.document.querySelectorAll('[data-sheet-results] button')].find(button=>button.textContent.startsWith('こねぎ'));
    greenOnion.click();
    const currentGreenOnion=()=>[...app.win.document.querySelectorAll('[data-sheet-results] button')].find(button=>button.textContent.startsWith('こねぎ'));
    assert.equal(currentGreenOnion().disabled,true);
    app.q('[aria-label="こねぎを外す"]').click();
    assert.equal(currentGreenOnion().disabled,false);
    assert.equal(app.win.document.querySelectorAll('[data-sheet-recipe-item]').length,2);
    assert.equal(store.value.meals.length,0);
    app.fill('[data-sheet-recipe-item] [data-recipe-quantity]','custom');
    app.fill('[data-sheet-recipe-item] [data-recipe-grams]','110');
    assert.match(app.q('[data-sheet-recipe-item] [data-recipe-points]').textContent,/第2群：1点/);
    assert.match(app.q('[data-sheet-recipe-item]:nth-child(2) [data-recipe-points]').textContent,/第3群：○/);
    store.failMeal=true;
    app.submit('#sheetEntryForm');await pause();
    assert.equal(store.value.meals.length,0);
    assert.equal(app.q('[data-recipe-grams]').value,'110');
    assert.equal(app.win.document.querySelectorAll('[data-sheet-recipe-item]').length,2);
    store.failMeal=false;
    app.submit('#sheetEntryForm');await pause();
    assert.equal(store.value.meals.length,1);
    assert.deepEqual(store.value.meals[0].ingredients.map(({dish,food,grams,points})=>[dish,food,grams,points]),[
      ['みそ汁','もめん豆腐',110,1],['みそ汁','カットわかめ',null,null]
    ]);
    assert.equal(store.value.meals[0].points,1);
    assert.match(app.q('#daySheet').textContent,/みそ汁.*もめん豆腐 110g.*カットわかめ/s);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('paper-style diary accepts ingredients directly in the selected meal and refreshes the saved totals', async () => {
  const date=tokyoDate(new Date());
  const store={value:{profile:{name:'テスト',heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date},meals:[]}};
  const app=await openApp(store);
  try {
    app.q('#home [data-go=record]').click();
    app.fill('#mealForm [name=memo]','入力途中のメモ');
    app.q('#editDaySheet').click();
    assert.equal(app.win.document.querySelectorAll('[data-sheet-meal]').length,4);
    const lunch=app.q('[data-sheet-meal="昼食"]');
    lunch.click();
    const form=app.q('#sheetEntryForm');
    assert.equal(form.closest('tbody'),lunch.closest('tbody'));
    assert.equal(form.querySelector('[data-sheet-amount]').hidden,true);
    assert.equal(form.querySelector('details').open,false);
    app.fill('#sheetEntryForm [name=food]','ご飯');
    assert.match(app.q('[data-sheet-points]').textContent,/精白米.*第4群：○/);
    assert.equal(form.querySelector('[data-sheet-amount]').hidden,false);
    assert.equal(form.querySelector('[data-sheet-manual-group]').hidden,true);
    app.fill('#sheetEntryForm [name=quickAmount]','80');
    assert.match(app.q('[data-sheet-points]').textContent,/第4群：1\.6点/);
    store.failMeal=true;
    app.submit('#sheetEntryForm');await pause();
    assert.match(app.q('[data-sheet-error]').textContent,/保存できませんでした/);
    assert.equal(form.elements.quickAmount.value,'80');
    store.failMeal=false;
    app.submit('#sheetEntryForm');await pause();
    assert.equal(store.value.meals.length,1);
    assert.equal(store.value.meals[0].type,'昼食');
    assert.equal(store.value.meals[0].points,1.6);
    assert.match(app.q('#daySheet tfoot').textContent,/1\.6点/);
    app.q('[data-sheet-meal="夕食"]').click();
    app.fill('#sheetEntryForm [name=food]','ひき肉');
    assert.equal(app.win.document.querySelectorAll('[data-sheet-results] button').length,3);
    app.submit('#sheetEntryForm');await pause();
    assert.match(app.q('[data-sheet-error]').textContent,/食材候補から選んで/);
    assert.equal(store.value.meals.length,1);
    app.fill('#sheetEntryForm [name=food]','ごま油');
    assert.match(app.q('[data-sheet-points]').textContent,/第4群：○/);
    app.submit('#sheetEntryForm');await pause();
    assert.equal(store.value.meals[1].type,'夕食');
    assert.equal(store.value.meals[1].points,null);
    assert.equal(store.value.meals[1].group,'第4群');
    assert.match(app.q('#daySheet tfoot').textContent,/1\.6点/);
    app.q('#daySheet header button').click();
    assert.equal(app.q('#mealForm [name=memo]').value,'入力途中のメモ');
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('saved days reopen without mixing in a draft, and the home measurement button focuses the measurement form', async () => {
  const date=tokyoDate(new Date());
  const oldDate='2026-08-20';
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:date};
  const store={value:{profile,meals:[
    {date,type:'朝食',food:'普通牛乳',group:'第1群',points:1},
    {date,type:'昼食',food:'ご飯',group:'第4群',points:1.6},
    {date:oldDate,type:'間食',food:'別の日の記録'}
  ],measurements:{[date]:{weight:69.5}}}};
  const app=await openApp(store);
  try {
    app.q('#home [data-measurement]').click();
    assert.equal(app.win.document.activeElement,app.q('#measurementTitle'));
    app.fill('#mealForm [name=memo]','保存前のメモ');
    const opener=app.q(`[data-saved-diary="${date}"]`);
    assert.equal(app.win.document.querySelectorAll('[data-saved-diary]').length,2);
    assert.equal(app.q('[data-saved-diary]'),opener);
    opener.click();
    assert.match(app.q('#daySheet').textContent,/69.5 kg/);
    assert.match(app.q('#daySheet tfoot').textContent,/2\.6点/);
    assert.doesNotMatch(app.q('#daySheet').textContent,/保存前のメモ|別の日の記録/);
    app.q('#daySheet button').click();
    assert.equal(app.win.document.activeElement,opener);
    assert.equal(app.q('#mealForm [name=memo]').value,'保存前のメモ');
    app.q('#dayPreview').click();
    assert.match(app.q('#daySheet').textContent,/保存前のメモ/);
    assert.equal(store.value.meals.length,3);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
});

test('coach comment is read from the separate path, and an owner-writable field is ignored', async () => {
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate:tokyoDate(new Date())};
  const store={value:{profile,coachComments:{status:'published',message:'偽のコメント'}},comment:{status:'published',message:'今週も記録できました。\n次はご飯の量を見てみましょう。'}};
  const app=await openApp(store);
  try {
    await pause();
    assert.match(app.q('#home').textContent,/今週も記録できました/);
    assert.doesNotMatch(app.q('#home').textContent,/偽のコメント/);
    assert.equal(app.q('#home .coach-head').parentElement.querySelectorAll('br').length,1);
    assert.deepEqual(app.failures,[]);
  } finally {app.dom.window.close()}
  store.commentError=true;
  const blocked=await openApp(store);
  try {
    await pause();
    assert.match(blocked.q('#home').textContent,/まだ届いていません/);
    assert.doesNotMatch(blocked.q('#home').textContent,/偽のコメント/);
    assert.deepEqual(blocked.failures,[]);
  } finally {blocked.dom.window.close()}
});

test('three distinct meal dates unlock diary mode and the choice survives reload', async () => {
  const startDate=tokyoDate(new Date(Date.now()-9*86400000));
  const profile={name:'テスト',age:45,heightCm:170,startWeight:70,waist:85,goalPercent:5,startDate};
  const store={value:{profile,onboarding:{mode:'observe'},meals:[]}};
  const app=await openApp(store);
  try {
    assert.equal(app.q('[data-mode="diary"]'),null);
    assert.equal(app.q('[data-page="learn"]').hidden,true);
    for (const dayOffset of [0, 0, 1, 2]) {
      app.q('[data-page="record"]').click();
      app.fill('#mealDate',tokyoDate(new Date(Date.now()-(9-dayOffset)*86400000)));
      app.fill('#mealForm [name="food"]','ご飯');
      app.submit('#mealForm');await pause();
      if (dayOffset < 2) assert.equal(app.q('[data-mode="diary"]'),null);
    }
    app.q('[data-page="home"]').click();
    app.q('[data-mode="diary"]').click();await pause();
    assert.equal(store.value.onboarding.mode,'diary');
  } finally {app.dom.window.close()}
  const reloaded=await openApp(store);
  try {
    assert.match(reloaded.q('#home').textContent,/いつもの食事を記録/);
    reloaded.q('[data-mode="program"]').click();await pause();
    assert.equal(store.value.profile.startDate,startDate);
    assert.equal(store.value.meals.length,4);
    assert.match(reloaded.q('#home').textContent,/第1週/);
    assert.equal(reloaded.q('[data-page="learn"]').hidden,false);
    assert.deepEqual(reloaded.failures,[]);
  } finally {reloaded.dom.window.close()}
});
