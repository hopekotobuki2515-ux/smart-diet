import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';

const rules = readFileSync(new URL('./firestore.rules.draft', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId:'demo-smart-diet-rules',
  firestore:{rules, host:'127.0.0.1', port:8080}
});
const path = (db, ...parts) => doc(db, ...parts);
const owner = env.authenticatedContext('client-a').firestore();
const coach = env.authenticatedContext('coach-a').firestore();
const stranger = env.authenticatedContext('stranger').firestore();
const anonymous = env.unauthenticatedContext().firestore();

const invite = createHash('sha256').update('test-only invite').digest('hex');
const inactive = createHash('sha256').update('expired test invite').digest('hex');

try {
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(path(admin,'programInvites',invite),{active:true});
    await setDoc(path(admin,'programInvites',inactive),{active:false});
    await setDoc(path(admin,'coachAssignments','client-a'),{coachUid:'coach-a'});
    await setDoc(path(admin,'users','client-a','appData','hopeProgram'),{profile:{name:'テスト'}});
    await setDoc(path(admin,'users','client-a','appData','smartDiet'),{legacy:true});
  });

  const newProgram = path(stranger,'users','stranger','appData','hopeProgram');
  const admission = path(stranger,'programAdmissions','stranger');
  const profile = {profile:{name:'新規登録テスト'}};
  await assertSucceeds(getDoc(newProgram));
  await assertFails(setDoc(newProgram,profile));
  await assertSucceeds(setDoc(path(stranger,'users','stranger','appData','smartDiet'),{legacy:true}));
  await assertFails(getDoc(path(stranger,'programInvites',invite)));
  await assertFails(getDocs(collection(stranger,'programInvites')));
  await assertFails(setDoc(path(stranger,'programInvites',invite),{active:false}));
  await assertFails(setDoc(admission,{digest:'wrong'}));
  await assertFails(setDoc(admission,{digest:'a'.repeat(64)}));
  await assertFails(setDoc(admission,{digest:inactive}));
  await assertFails(setDoc(admission,{digest:invite,role:'admin'}));
  await assertFails(setDoc(path(stranger,'programAdmissions','client-a'),{digest:invite}));
  await assertFails(setDoc(path(anonymous,'programAdmissions','stranger'),{digest:invite}));
  await assertSucceeds(setDoc(admission,{digest:invite}));
  await assertFails(setDoc(admission,{digest:inactive}));
  await assertFails(getDoc(path(owner,'programAdmissions','stranger')));
  await assertSucceeds(setDoc(newProgram,profile));
  await assertSucceeds(getDoc(newProgram));

  await assertSucceeds(getDoc(path(owner,'users','client-a','appData','hopeProgram')));
  await assertSucceeds(setDoc(path(owner,'users','client-a','appData','hopeProgram'),{profile:{name:'テスト'}}));
  await assertFails(getDoc(path(stranger,'users','client-a','appData','hopeProgram')));
  await assertFails(getDoc(path(anonymous,'users','client-a','appData','hopeProgram')));
  await assertSucceeds(getDoc(path(coach,'users','client-a','appData','hopeProgram')));
  await assertFails(getDoc(path(coach,'users','client-a','appData','smartDiet')));
  await assertFails(setDoc(path(coach,'users','client-a','appData','hopeProgram'),{profile:{name:'改ざん'}}));

  await assertSucceeds(getDocs(query(collection(coach,'coachAssignments'),where('coachUid','==','coach-a'))));
  await assertFails(getDocs(query(collection(coach,'coachAssignments'),where('coachUid','==','stranger'))));
  await assertFails(getDocs(collection(coach,'coachAssignments')));
  await assertFails(getDoc(path(stranger,'coachAssignments','client-a')));
  await assertFails(setDoc(path(owner,'coachAssignments','client-a'),{coachUid:'client-a'}));

  const draft = {message:'記録できました。',status:'draft',authorUid:'coach-a',updatedAt:Timestamp.now()};
  await assertSucceeds(setDoc(path(coach,'coachComments','client-a','weeks','1'),draft));
  await assertSucceeds(getDoc(path(coach,'coachComments','client-a','weeks','1')));
  await assertFails(getDoc(path(owner,'coachComments','client-a','weeks','1')));
  await assertFails(setDoc(path(owner,'coachComments','client-a','weeks','1'),{...draft,authorUid:'client-a'}));
  await assertFails(setDoc(path(stranger,'coachComments','client-a','weeks','1'),{...draft,authorUid:'stranger'}));
  await assertFails(setDoc(path(coach,'coachComments','client-a','weeks','1'),{...draft,authorUid:'stranger'}));
  await assertSucceeds(setDoc(path(coach,'coachComments','client-a','weeks','1'),{...draft,status:'published'}));
  await assertSucceeds(getDoc(path(owner,'coachComments','client-a','weeks','1')));
  await assertFails(getDoc(path(stranger,'coachComments','client-a','weeks','1')));
  await assertFails(getDocs(collection(owner,'coachComments','client-a','weeks')));
  assert.ok(true);
  console.log('Firestore rules: owner, assigned coach, stranger, guest, draft and published checks passed');
} finally {
  await env.cleanup();
}
