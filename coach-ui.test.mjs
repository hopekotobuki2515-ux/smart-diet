import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { currentWeek } from './program-config.js';

const html = readFileSync(new URL('./coach.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./coach.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const pause = () => new Promise(resolve => setTimeout(resolve, 10));

test('only assigned clients appear; coach can draft and publish a separate comment', async () => {
  const dom = new JSDOM(html, {url:'https://example.test/coach.html',runScripts:'outside-only'});
  const win = dom.window, writes = [], reads = [], failures = [];
  const profile = {name:'テスト',startDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())};
  win.addEventListener('error', e => failures.push(e.message));
  win.currentWeek = currentWeek;
  win.initializeApp = value => value;
  win.getAuth = () => ({});
  win.getFirestore = () => ({});
  win.collection = (_db, name) => name;
  win.where = (...args) => args;
  win.query = (...args) => args;
  win.doc = (...args) => args.slice(1);
  win.getDocs = async ref => {
    assert.equal(ref[1][2],'verified-coach');
    return {docs:[{id:'assigned-client'}]};
  };
  win.getDoc = async ref => {
    reads.push(ref);
    if (ref[0] === 'users') return {exists:()=>true,data:()=>({profile,meals:[{date:'2026-09-27',type:'昼食',food:'おにぎり'}]})};
    if (ref[0] === 'coachComments') return {exists:()=>false};
    throw new Error('unexpected path');
  };
  win.setDoc = async (ref,data) => writes.push({ref,data});
  win.signInWithEmailAndPassword = async () => {};
  let authChanged;
  win.onAuthStateChanged = (_auth,callback) => {authChanged=callback;queueMicrotask(()=>callback({uid:'verified-coach'}));};
  win.signOut = async () => authChanged(null);
  win.eval(source);
  try {
    await pause();
    assert.equal(win.document.querySelectorAll('#clients button').length,1);
    assert.deepEqual(reads[0],['users','assigned-client','appData','hopeProgram']);
    win.document.querySelector('#clients button').click();await pause();
    assert.match(win.document.querySelector('#clientDetail').textContent,/おにぎり/);
    const form = win.document.querySelector('#commentForm');
    form.elements.message.value='記録を続けられました。次は夕食を見てみましょう。';
    const draft = form.querySelector('[value="draft"]');
    form.dispatchEvent(new win.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:draft}));await pause();
    assert.deepEqual(writes[0].ref,['coachComments','assigned-client','weeks','1']);
    assert.equal(writes[0].data.status,'draft');
    assert.equal(writes[0].data.authorUid,'verified-coach');
    const published = win.document.querySelector('#commentForm');
    published.dispatchEvent(new win.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:published.querySelector('[value="published"]')}));await pause();
    assert.equal(writes[1].data.status,'published');
    win.document.querySelector('#switchAccount').click();await pause();
    assert.equal(win.document.querySelector('#login').hidden,false);
    assert.equal(win.document.querySelector('#coachApp').hidden,true);
    assert.deepEqual(failures,[]);
  } finally {dom.window.close()}
});
