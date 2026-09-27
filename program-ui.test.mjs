import assert from 'node:assert/strict';
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
  win.crypto.randomUUID = () => Math.random().toString(36).slice(2);
  win.fetch = async () => ({ok:true,json:async()=>master});
  Object.assign(win, config, {CURRICULUM,SAMPLE_CATEGORIES,resolveSample});
  win.initializeApp = x => x; win.getAuth = () => ({currentUser:{uid:'test-user'}});
  win.getFirestore = () => ({}); win.doc = (...args) => args;
  win.getDoc = async () => ({exists:()=>Object.keys(store.value).length>0,data:()=>structuredClone(store.value)});
  win.arrayUnion = value => ({__union:value});
  const merge = (target, patch) => {
    for (const [key,value] of Object.entries(patch)) {
      if (value && value.__union !== undefined) target[key] = [...(target[key]||[]),value.__union];
      else if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge(target[key]||{},value);
      else target[key] = value;
    }
    return target;
  };
  win.setDoc = async (_ref,patch) => {store.value=merge(store.value,structuredClone(patch))};
  win.signInWithEmailAndPassword = async () => {};
  win.onAuthStateChanged = (_auth, callback) => queueMicrotask(()=>callback({uid:'test-user'}));
  win.eval(source);
  await pause();
  const q = selector => win.document.querySelector(selector);
  const fill = (selector,value) => {const input=q(selector);input.value=value;input.dispatchEvent(new win.Event('input',{bubbles:true}))};
  const submit = selector => q(selector).dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,win,q,fill,submit,failures};
}

test('initial setup, master calculation, records and goal history survive reload', async () => {
  const store = {value:{}}, app = await openApp(store);
  try {
    assert.equal(app.q('#setup').hidden,false);
    for(const [name,value] of Object.entries({name:'テスト',age:'45',heightCm:'170',startWeight:'70',waist:'85'})) app.fill(`[name="${name}"]`,value);
    assert.match(app.q('#goalPreview').textContent,/66\.5kg/);
    app.submit('#setupForm');await pause();
    assert.equal(store.value.profile.name,'テスト');
    assert.match(app.q('#sampleCard').textContent,/15\.00点/);
    app.q('#sampleCard [data-sample="コンビニ"]').click();
    assert.match(app.q('#sampleCard').textContent,/確認してから掲載/);
    app.q('[data-page="record"]').click();
    store.value.meals=[{id:'from-another-device',date:tokyoDate(new Date()),type:'昼食',food:'普通牛乳',amount:'120g',points:1,photoId:null}];
    app.fill('#foodSearch','めし・水稲・精白米');
    app.q('#foodResults button').click();
    assert.equal(app.q('#riceAmounts').hidden,false);
    app.q('[data-rice-grams="150"]').click();
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
