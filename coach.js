import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
import { currentWeek } from './program-config.js';
import { CURRICULUM } from './program-curriculum.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAvSc2x_o03QKie268jX33mr14ub6TBtX0',
  authDomain: 'smart-diet-a5d4e.firebaseapp.com',
  projectId: 'smart-diet-a5d4e',
  storageBucket: 'smart-diet-a5d4e.firebasestorage.app',
  messagingSenderId: '921025558560',
  appId: '1:921025558560:web:b00079c4349fa10b15a445'
};
const auth = getAuth(initializeApp(firebaseConfig)), db = getFirestore();
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let coach = null, clientUid = null, selectedWeek = 1, clients = new Map(), comment = null;
const weekOneQuestions = {
  reason: '今回始めようと思った一番の理由',
  causes: '最近、体重が増えた原因として思い当たること',
  style: '普段の食事スタイル'
};

function message(value, error = false) {
  $('#status').textContent = value;
  $('#status').classList.toggle('error', error);
}
function renderClients() {
  $('#clients').replaceChildren(...[...clients.entries()].map(([uid, record]) => {
    const button = document.createElement('button');
    button.type = 'button';button.className = 'button ghost';
    button.textContent = record.profile?.name ? `${record.profile.name}さんの記録を見る` : '担当者の記録を見る';
    button.onclick = () => selectClient(uid);
    return button;
  }));
  if (!clients.size) $('#clients').textContent = '担当する方はまだ登録されていません。';
}
function renderAnswers(answer, weekNumber) {
  if (!answer) return '<p class="muted">回答はありません。</p>';
  const rows = [];
  if (weekNumber === 1) {
    for (const [key, title] of Object.entries(weekOneQuestions)) {
      const choices = Array.isArray(answer[key]) ? answer[key].filter(Boolean) : [];
      if (choices.length) rows.push([title, choices.join('、')]);
      const freeText = typeof answer[`${key}Text`] === 'string' ? answer[`${key}Text`].trim() : '';
      if (freeText) rows.push([`${title}・付け足し`, freeText]);
    }
    if (typeof answer.future === 'string' && answer.future.trim()) rows.push(['3か月後、どんな自分でいたいか', answer.future.trim()]);
  } else {
    const title = CURRICULUM[weekNumber - 1]?.question?.title || `第${weekNumber}週の回答`;
    const choices = Array.isArray(answer.choices) ? answer.choices.filter(Boolean) : [];
    if (choices.length) rows.push([title, choices.join('、')]);
    if (typeof answer.freeText === 'string' && answer.freeText.trim()) rows.push(['自分の言葉で付け足したこと', answer.freeText.trim()]);
  }
  return rows.length
    ? rows.map(([title, value]) => `<p><strong>${esc(title)}</strong><br>${esc(value)}</p>`).join('')
    : '<p class="muted">回答はありません。</p>';
}
function renderMeal(meal) {
  const details = [meal.food, meal.amount, meal.group, meal.points != null ? `${meal.points}点` : ''].filter(Boolean).map(esc);
  const photo = meal.photoId ? '<br><span class="muted">写真記録あり（利用者の端末内に保存）</span>' : '';
  const memo = meal.memo ? `<br>${esc(meal.memo)}` : '';
  return `<p><strong>${esc(meal.date)} ${esc(meal.type)}</strong><br>${details.join(' / ') || '写真・メモの記録'}${memo}${photo}</p>`;
}
function renderDetail() {
  const record = clients.get(clientUid), profile = record?.profile;
  if (!profile) return;
  const recentMeals = (record.meals || []).slice(-12).reverse();
  const latest = Object.entries(record.measurements || {}).sort(([a],[b]) => b.localeCompare(a)).slice(0, 3);
  const answers = record.answers?.[selectedWeek];
  $('#clientDetail').hidden = false;
  $('#clientDetail').innerHTML = `<div class="card"><span class="eyebrow">担当利用者</span><h2>${esc(profile.name)}さん　第${selectedWeek}週</h2>
    <label>コメントする週<select id="coachWeek">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===selectedWeek?'selected':''}>第${i+1}週</option>`).join('')}</select></label>
    <h3>最近の食事記録</h3>${recentMeals.length ? recentMeals.map(renderMeal).join('') : '<p class="muted">まだ記録がありません。</p>'}
    <h3>最近の体重・腹囲</h3>${latest.length ? latest.map(([date,x])=>`<p>${esc(date)}：${x.weight ? esc(x.weight)+'kg' : '体重なし'} / ${x.waist ? esc(x.waist)+'cm' : '腹囲なし'}</p>`).join('') : '<p class="muted">まだ記録がありません。</p>'}
    <h3>今週の回答</h3>${renderAnswers(answers, selectedWeek)}<h3>今週の振り返り</h3><p>${esc(record.reflections?.[selectedWeek] || '振り返りはありません。')}</p></div>
    <div class="card"><h2>HOPEからのコメント</h2><p class="muted">できていること、今週気づいてほしいこと、次にやることを一つずつ短く伝えます。</p>
    <form id="commentForm"><label>コメント<textarea name="message" maxlength="1500" required>${esc(comment?.message || '')}</textarea></label>
    <p class="muted">下書きは利用者に表示されません。公開すると利用者の第${selectedWeek}週に表示されます。</p>
    <div class="two"><button class="button ghost" type="submit" name="action" value="draft">下書き保存</button><button class="button" type="submit" name="action" value="published">公開する</button></div></form></div>`;
}
async function selectClient(uid, weekNumber) {
  if (!clients.get(uid)?.profile?.startDate || !coach) return;
  clientUid = uid;
  selectedWeek = weekNumber || currentWeek(clients.get(uid).profile.startDate);
  comment = null;$('#clientDetail').hidden = true;
  message('コメントを読み込んでいます…');
  try {
    const snap = await getDoc(doc(db, 'coachComments', uid, 'weeks', String(selectedWeek)));
    if (clientUid !== uid || selectedWeek !== (weekNumber || currentWeek(clients.get(uid).profile.startDate)) || !coach) return;
    comment = snap.exists() ? snap.data() : null;
    message('');renderDetail();
  } catch (error) { message('コメントを読み込めませんでした。担当設定と権限を確認してください。', true); }
}
$('#signIn').onclick = async () => {
  message('ログイン中…');
  try { await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value); }
  catch (error) { message('ログインできませんでした。メールアドレスとパスワードを確認してください。', true); }
};
$('#switchAccount').onclick = async () => {
  message('アカウントを切り替えています…');
  try {
    await signOut(auth);
    coach = null;clients = new Map();clientUid = null;comment = null;
    $('#login').hidden = false;$('#coachApp').hidden = true;$('#clientDetail').hidden = true;
    $('#email').focus();message('コーチ用アカウントでログインしてください。');
  }
  catch (error) { message('ログアウトできませんでした。もう一度お試しください。', true); }
};
onAuthStateChanged(auth, async account => {
  coach = account;clients = new Map();clientUid = null;comment = null;
  $('#login').hidden = Boolean(account);$('#coachApp').hidden = !account;$('#clientDetail').hidden = true;
  if (!account) {message('');return;}
  message('担当者を読み込んでいます…');
  try {
    const assigned = await getDocs(query(collection(db, 'coachAssignments'), where('coachUid', '==', account.uid)));
    if (coach?.uid !== account.uid) return;
    for (const assignment of assigned.docs) {
      const snap = await getDoc(doc(db, 'users', assignment.id, 'appData', 'hopeProgram'));
      if (coach?.uid !== account.uid) return;
      if (snap.exists() && snap.data().profile?.startDate) clients.set(assignment.id, snap.data());
    }
    renderClients();message('');
  } catch (error) { message('担当者を読み込めませんでした。権限の設定を確認してください。', true); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'coachWeek') selectClient(clientUid, Number(event.target.value));
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'commentForm') return;
  event.preventDefault();
  const form = event.target, action = event.submitter?.value;
  if (!clientUid || !clients.has(clientUid) || !coach || !['draft','published'].includes(action)) return;
  const text = form.elements.message.value.trim();
  if (!text || text.length > 1500) {message('コメントを1500文字以内で入力してください。', true);return;}
  const uid = clientUid, weekNumber = selectedWeek, account = coach;
  const data = {message:text,status:action,authorUid:account.uid,updatedAt:new Date()};
  form.querySelectorAll('button').forEach(button => button.disabled = true);
  message('保存中…');
  try {
    await setDoc(doc(db, 'coachComments', uid, 'weeks', String(weekNumber)), data);
    if (coach?.uid === account.uid && clientUid === uid && selectedWeek === weekNumber) {
      comment = data;message(action === 'published' ? 'コメントを公開しました。' : '下書きを保存しました。');renderDetail();
    }
  } catch (error) { message('保存できませんでした。担当設定と権限を確認してください。', true); }
  finally { if (form.isConnected) form.querySelectorAll('button').forEach(button => button.disabled = false); }
});
