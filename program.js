import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
import { PROGRAM, WEEK_TITLES, goalWeight, bmi, currentWeek, foodPoints } from './program-config.js';
import { CURRICULUM } from './program-curriculum.js';
import { SAMPLE_CATEGORIES, resolveSample } from './program-samples.js';

// Same Firebase project and sign-in as the existing index.html; separate document to preserve legacy records.
const firebaseConfig = {
  apiKey: 'AIzaSyAvSc2x_o03QKie268jX33mr14ub6TBtX0',
  authDomain: 'smart-diet-a5d4e.firebaseapp.com',
  projectId: 'smart-diet-a5d4e',
  storageBucket: 'smart-diet-a5d4e.firebasestorage.app',
  messagingSenderId: '921025558560',
  appId: '1:921025558560:web:b00079c4349fa10b15a445'
};
const auth = getAuth(initializeApp(firebaseConfig)), db = getFirestore();
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let state = {}, user = null, mealType = '朝食', page = 'home', sampleCategory = '自炊';
let coachComment = null;
let foodMaster = [], photoUrls = [];
const foodId = x => JSON.stringify([x.name,x.category,x.gramsPerPoint]);
const foodFromId = id => foodMaster.find(x=>foodId(x)===id);
const meals = ['朝食','昼食','夕食','間食','飲み物','飲酒'];
const questions = [
  { id:'reason', title:'今回始めようと思った一番の理由は？', multiple:false, options:['体重が増えた','お腹まわりが気になる','脚・二の腕など見た目が気になる','健康診断の結果が気になる','体力をつけたい','食生活を整えたい','その他'] },
  { id:'causes', title:'最近、体重が増えた原因として思い当たることは？', multiple:true, options:['食べる量が増えた','間食が増えた','外食が増えた','お酒が増えた','運動量が減った','生活時間が不規則','ストレスで食べる','よく分からない','その他'] },
  { id:'style', title:'普段の食事スタイルは？', multiple:true, options:['自炊','外食','コンビニ','スーパーの弁当・惣菜','ファストフード','冷凍食品・冷凍弁当','その他'] }
];
let statusTimer;
function message(s, error=false){
  clearTimeout(statusTimer);
  $('#status').textContent=s;
  $('#status').classList.toggle('error', error);
  if(s==='保存しました') statusTimer=setTimeout(()=>{
    if($('#status').textContent===s) $('#status').textContent='';
  },3500);
}
async function persist(next, patch = next){
  if (!user) throw new Error('ログインが必要です');
  const { coachComments, ...writable } = patch;
  await setDoc(doc(db,'users',user.uid,'appData','hopeProgram'), writable, {merge:true});
  state = next; message('保存しました'); render();
}
function copy(){ return structuredClone(state); }
function startProfile(){
  if (!state.profile) { $('#setup').hidden=false; $('#workspace').hidden=true; return; }
  $('#setup').hidden=true; $('#workspace').hidden=false; render();
}
function week(){ return currentWeek(state.profile.startDate); }
function daysRecorded(){ return new Set((state.meals||[]).filter(x=>x.date >= state.profile.startDate && x.date <= today()).map(x=>x.date)).size; }
function graph(){
  const logs = Object.entries(state.measurements||{}).filter(([,v])=>Number(v.weight)>0).sort(([a],[b])=>a.localeCompare(b)).slice(-30);
  if(logs.length<2) return '<p class="muted">体重を2回以上記録すると、流れを表示します。</p>';
  const values=logs.map(([,v])=>Number(v.weight)), lo=Math.min(...values)-0.5, hi=Math.max(...values)+0.5;
  const points=values.map((v,i)=>`${10+i*280/(values.length-1)},${112-(v-lo)*90/(hi-lo)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 300 130" role="img" aria-label="直近の体重の推移"><line x1="10" y1="112" x2="290" y2="112"/><polyline points="${points}"/></svg><p class="muted">一日の増減より、長い流れを見ていきましょう。</p>`;
}
function comment(){
  const body = coachComment?.status === 'published' && typeof coachComment.message === 'string'
    ? esc(coachComment.message).replace(/\n/g, '<br>')
    : 'コメントはまだ届いていません。記録だけでも続けていきましょう。';
  return `<div class="card"><div class="coach-head"><img src="./coach.svg" alt="男性コーチのイラスト"><div><span class="eyebrow">村田コーチより</span><h2>HOPEからのコメント</h2></div></div><p>${body}</p></div>`;
}
async function loadCoachComment(account, weekNumber){
  coachComment = null;
  try {
    const snap = await getDoc(doc(db, 'coachComments', account.uid, 'weeks', String(weekNumber)));
    if (user?.uid !== account.uid || week() !== weekNumber) return;
    coachComment = snap.exists() ? snap.data() : null;
  } catch (error) {
    // This separate path remains denied until the reviewed rules are deployed.
    if (user?.uid !== account.uid || week() !== weekNumber) return;
    coachComment = null;
  }
  render();
}
function renderSample(){
  let body='';
  if(sampleCategory==='自炊' && foodMaster.length){
    try{
      const sample=resolveSample(foodMaster);
      body=['朝食','昼食','夕食','間食'].map(meal=>{
        const rows=sample.items.filter(item=>item.meal===meal);
        return `<h3>${meal}</h3>${rows.map(item=>`<div class="row"><span>${esc(item.name)}　${item.grams}g<br><small>${esc(item.group)}</small></span><strong>${item.points.toFixed(2)}点</strong></div>`).join('')}`;
      }).join('')+`<p class="soft">登録した食品の重量だけで計算した合計：${sample.totalPoints.toFixed(2)}点</p>`;
    }catch(e){body='<p class="muted">食品マスターを確認できないため、食事例を表示できません。</p>'}
  }else if(sampleCategory==='自炊'){
    body='<p class="muted">食品マスターを読み込んでいます。</p>';
  }else{
    body=`<div class="sample-pending" role="status"><span class="eyebrow">準備中</span><h3>${esc(sampleCategory)}の見本は確認中です</h3><p>商品・料理の表示、量、食品グループをHOPEで確認してから掲載します。現在は食事記録から、あなたが実際に選んだものを残せます。</p></div>`;
  }
  return `<div class="card" id="sampleCard"><h2>1日の組み立て見本</h2><p>この通り食べる必要はありません。1日の組み立て方を見るための例です。</p><div class="tabs sample-tabs" role="tablist" aria-label="食事例のカテゴリー">${SAMPLE_CATEGORIES.map(x=>`<button type="button" role="tab" aria-selected="${x===sampleCategory}" data-sample="${x}" class="${x===sampleCategory?'selected':''}">${x}</button>`).join('')}</div><p class="tab-hint">左右に動かしてカテゴリーを選べます。</p>${body}<p class="muted">調理に使う油・調味料・追加した食品は含めていません。量と点数は食品マスターから計算し、あなたの摂取目標を決めるものではありません。</p></div>`;
}
function revealSelectedSample(){
  const tabs=$('#sampleCard .sample-tabs'),selected=tabs?.querySelector('[aria-selected="true"]');
  if(!tabs || !selected)return;
  const left=selected.offsetLeft-(tabs.clientWidth-selected.offsetWidth)/2;
  if(typeof tabs.scrollTo==='function')tabs.scrollTo({left:Math.max(0,left),behavior:'smooth'});
  else tabs.scrollLeft=Math.max(0,left);
}
function finalSummary(){
  const p=state.profile, logs=Object.entries(state.measurements||{}).sort(([a],[b])=>a.localeCompare(b));
  const weights=logs.filter(([,v])=>Number(v.weight)>0), waists=logs.filter(([,v])=>Number(v.waist)>0);
  const latestWeight=weights.at(-1)?.[1].weight, latestWaist=waists.at(-1)?.[1].waist;
  return `<div class="card"><h2>3か月の振り返り</h2>
    <div class="row"><span>開始時の体重</span><strong>${p.startWeight.toFixed(1)}kg</strong></div>
    <div class="row"><span>最近記録した体重</span><strong>${latestWeight?Number(latestWeight).toFixed(1)+'kg':'記録なし'}</strong></div>
    <div class="row"><span>開始時の腹囲</span><strong>${p.waist.toFixed(1)}cm</strong></div>
    <div class="row"><span>最近記録した腹囲</span><strong>${latestWaist?Number(latestWaist).toFixed(1)+'cm':'記録なし'}</strong></div>
    <div class="row"><span>食事を記録した日</span><strong>${daysRecorded()}日</strong></div>
    <p>数字とあわせて、食品量、点数、外食での選び方、身体を動かす習慣も振り返りましょう。</p>
    <div class="note">体重を保つ時期の食事量は、活動量や生活状況を見て村田コーチと確認します。減量中の設定を自動で続けることはしません。</div></div>`;
}
function renderHome(){
  const w=week(), n=daysRecorded(), bars=Array.from({length:12},(_,i)=>`<i class="${i<w?'done':''}"></i>`).join('');
  $('#home').innerHTML=`
    <div class="card"><span class="eyebrow">こんにちは、${esc(state.profile.name)}さん</span><h1>今日も、自分のペースで。</h1><p>第${w}週 / 12週間</p><div class="progress" aria-label="12週間中${w}週目">${bars}</div></div>
    <div class="card"><span class="eyebrow">今週のお話</span><h2>第${w}週　${esc(WEEK_TITLES[w-1])}</h2><p>読むことは任意です。食事の記録から始めても大丈夫です。</p><button class="button ghost" data-go="week">今週のお話を見る</button></div>
    <div class="card"><h2>今日やること</h2><div class="row"><span>${w===1?'いつもの食事を写真で記録':'食事を記録する'}</span><button data-go="record">記録する</button></div><div class="row"><span>体重・体調を残す（任意）</span><button data-go="record">入力する</button></div>${w===1?`<p class="muted">第1週は3日間、できれば平日2日と休日1日。現在 ${n}日分です。採点はしません。</p>`:''}</div>
    <div class="card"><h2>体重の流れ</h2>${graph()}</div>${comment()}${renderSample()}`;
}
function renderWeek(){
  const w=week(), q=state.answers?.[1]||{}, lesson=CURRICULUM[w-1];
  $('#week').innerHTML=`<div class="card"><span class="eyebrow">第${w}週 / 12週間</span><h1>${esc(WEEK_TITLES[w-1])}</h1><p class="muted">学ぶ → やってみる → 記録する → コメントを受け取る → 振り返る</p></div>
    <div class="card"><span class="eyebrow">今週のお話</span><h2>${esc(WEEK_TITLES[w-1])}</h2>${lesson.lesson.map(x=>`<p>${esc(x)}</p>`).join('')}</div>
    <div class="card"><h2>今週やってみること</h2><p>${esc(lesson.task)}</p><button class="button" data-go="record">食事を記録する</button></div>
    ${w===1?`<div class="card"><h2>今週の質問</h2><p class="muted">選ぶだけでも大丈夫です。付け足す言葉は任意です。</p><form id="questionForm">${questions.map(item=>`<h3>${item.title}</h3><div class="choice">${item.options.map(o=>`<label><input type="${item.multiple?'checkbox':'radio'}" name="${item.id}" value="${esc(o)}" ${(q[item.id]||[]).includes(o)?'checked':''}>${esc(o)}</label>`).join('')}</div><label>自分の言葉で付け足したいことがあれば<textarea name="${item.id}Text" maxlength="500">${esc(q[item.id+'Text']||'')}</textarea></label>`).join('')}<h3>3か月後、どんな自分でいたいですか？</h3><textarea name="future" maxlength="500" aria-label="3か月後の自分">${esc(q.future||'')}</textarea><button class="button" type="submit">回答を保存する</button></form></div>`:''}
    ${w>1?`<div class="card"><h2>今週の質問</h2><p>選択肢から選び、付け足したいことだけ入力してください。</p><form id="weeklyQuestionForm"><h3>${esc(lesson.question.title)}</h3><div class="choice">${lesson.question.options.map(o=>`<label><input type="${lesson.question.multiple||lesson.question.max?'checkbox':'radio'}" name="answer" value="${esc(o)}" ${(state.answers?.[w]?.choices||[]).includes(o)?'checked':''}>${esc(o)}</label>`).join('')}</div><label>自分の言葉で付け足したいことがあれば<textarea name="freeText" maxlength="500">${esc(state.answers?.[w]?.freeText||'')}</textarea></label><button class="button" type="submit">回答を保存する</button></form></div>`:''}
    ${w===12?finalSummary():''}
    ${comment()}
    <div class="card"><h2>週末の振り返り</h2><p>今週、気づいたことを一つ残しましょう。</p><form id="reflectionForm"><textarea name="reflection" maxlength="1000" aria-label="今週の振り返り">${esc(state.reflections?.[w]||'')}</textarea><button class="button" type="submit">振り返りを保存する</button></form></div>
    <div class="card"><h2>次の週へ</h2><p>今週のお話を読まなくても、週が進むと次のテーマを見られます。</p></div>`;
}
function renderRecord(){
  const list=(state.meals||[]).slice(-20).reverse();
  $('#record').innerHTML=`<div class="card"><span class="eyebrow">食事記録</span><h1>いつもの食事を残しましょう</h1><p>第1週は写真と簡単なメモだけで大丈夫。点数や食品群の入力は必要ありません。</p>
    <form id="mealForm"><label>日付<input id="mealDate" name="date" type="date" value="${today()}" required></label><div class="tabs" role="group" aria-label="食事の種類">${meals.map(t=>`<button type="button" data-meal="${t}" class="${t===mealType?'selected':''}">${t}</button>`).join('')}</div>
    <label>写真（任意・この端末だけに保存）<input name="photo" type="file" accept="image/*"></label><p class="muted">写真は現段階では端末内保存です。他の端末には表示されません。</p>
    <label>食品・料理名（任意）<input name="food" maxlength="120" placeholder="例：ご飯、焼き魚、みそ汁"></label>
    <label>食品マスターから探す（任意）<input id="foodSearch" type="search" autocomplete="off" placeholder="例：めし・水稲・精白米"></label>
    <div id="foodResults" class="food-results" aria-live="polite"></div>
    <div id="recentFoods" class="food-shortcuts"></div><div id="savedFoods" class="food-shortcuts"></div>
    <p id="selectedFood" class="muted">食品を選ぶと量から点数を計算できます。第1週は不要です。</p>
    <button id="saveFood" type="button" class="small-button">この食品を登録する</button>
    <label>量（分かる範囲で・任意）<input name="amount" maxlength="80" placeholder="例：ご飯150g"></label>
    <label>実測した量（g・任意）<input name="grams" type="number" min="0.1" max="10000" step="0.1" inputmode="decimal"></label><p id="pointPreview" class="muted"></p>
    <div id="riceAmounts" class="amount-guide" hidden><p>ご飯の量の目安（計量した値を優先）</p><div class="amount-options">${[100,150,200,260].map(g=>`<button type="button" data-rice-grams="${g}">${g}g</button>`).join('')}</div><p class="muted">このボタンは入力の補助です。実物写真による量の見本は準備中です。</p></div>
    <label>ひとこと（任意）<textarea name="memo" maxlength="500"></textarea></label>
    <button class="button" type="submit">この食事を保存する</button></form></div>
    <div class="card"><h2>記録した食事</h2><div id="mealList">${list.length?list.map(x=>`<div class="meal-entry"><strong>${esc(x.date)}・${esc(x.type)}</strong><br>${esc(x.food||'写真・メモの記録')}${x.amount?' / '+esc(x.amount):''}${x.points!=null?' / '+x.points+'点':''}${x.photoId?`<div data-photo-id="${esc(x.photoId)}"></div>`:''}</div>`).join(''):'<p class="muted">まだ記録はありません。</p>'}</div></div>
    <div class="card"><h2>体重・体調を記録する</h2><p class="muted">全部入力しなくても大丈夫です。</p><form id="measurementForm">
    <label>日付<input name="date" type="date" value="${today()}" required></label><div class="two"><label>体重（kg）<input name="weight" type="number" min="10" max="500" step="0.1" inputmode="decimal"></label><label>腹囲（おへその高さ）<input name="waist" type="number" min="20" max="300" step="0.1" inputmode="decimal" placeholder="cm"></label></div>
    <label>体調<select name="condition"><option value="">選択しない</option><option>とても良い</option><option>良い</option><option>普通</option><option>やや不調</option><option>不調</option></select></label>
    <label>気分<select name="mood"><option value="">選択しない</option><option>😊 良い</option><option>🙂 まあまあ</option><option>😐 普通</option><option>😟 気になる</option></select></label>
    <div class="two"><label>便通<select name="bowel"><option value="">選択しない</option><option>あり</option><option>なし</option></select></label><label>水分（L）<input name="water" type="number" min="0" max="20" step="0.1" inputmode="decimal"></label></div>
    <label>メモ<textarea name="memo" maxlength="500"></textarea></label><button class="button" type="submit">体重・体調を保存する</button></form></div>`;
  for(const url of photoUrls)URL.revokeObjectURL(url);photoUrls=[];
  loadVisiblePhotos();
  renderFoodShortcuts();
}
function renderMore(){
  const p=state.profile,g=state.goals||[],current=g.at(-1)||{percent:p.goalPercent,target:goalWeight(p.startWeight,p.goalPercent)};
  $('#more').innerHTML=`<div class="card"><h1>マイページ</h1><p>${esc(p.name)}さん / 開始日 ${esc(p.startDate)}</p><div class="row"><span>開始時の希望目標</span><strong>${p.goalPercent}％ / ${goalWeight(p.startWeight,p.goalPercent).toFixed(1)}kg</strong></div><div class="row"><span>現在の希望目標</span><strong>${current.percent}％ / ${current.target.toFixed(1)}kg</strong></div><p class="muted">体重目標は村田コーチと確認して決めます。アプリへの入力だけで確定とは扱いません。</p><div class="row"><span>開始時のBMI</span><strong>${bmi(p.heightCm,p.startWeight).toFixed(1)}</strong></div></div>
    <div class="card"><h2>目標を変更する</h2><p class="muted">最初の目標と変更履歴は残ります。体重目標は村田コーチとも確認してください。</p><form id="goalForm"><label>減量率<select name="percent">${PROGRAM.goalPercents.map(v=>`<option value="${v}" ${v===current.percent?'selected':''}>${v}％</option>`).join('')}</select></label><button class="button" type="submit">変更を記録する</button></form></div>
    <div class="card"><h2>変更履歴</h2>${g.length?g.map(x=>`<div class="row"><span>${esc(x.changedAt.slice(0,10))}</span><strong>${x.percent}％ / ${x.target.toFixed(1)}kg</strong></div>`).join(''):'<p class="muted">変更はありません。</p>'}</div>
    <div class="card"><h2>アカウント</h2><p class="muted">利用者と村田コーチの画面を切り替える時に使います。保存済みの記録は消えません。</p><button id="switchProgramAccount" class="button ghost" type="button">別のアカウントでログイン</button></div>
    <div class="card"><h2>この画面について</h2><p>この12週間の記録は、従来のSMART Dietの記録とは別に保存しています。従来の記録は上部の戻るボタンから確認できます。</p><p class="muted">HOPEコメントは公開済みのものだけを表示します。写真はこの端末内のみです。</p></div>`;
}
function render(){
  if(!state.profile)return;
  renderHome();renderWeek();renderRecord();renderMore();
  document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==page);
  document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('selected',el.dataset.page===page));
}
function open(pageName){page=pageName;render();window.scrollTo(0,0)}
$('#signIn').onclick=async()=>{
  message('ログイン中…');
  try{await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#password').value);message('')}
  catch(e){message('ログインできませんでした。メールアドレスとパスワードを確認してください。',true)}
};
onAuthStateChanged(auth,async u=>{
  user=u;coachComment=null;
  if(!u){$('#login').hidden=false;$('#app').hidden=true;return}
  $('#login').hidden=true;$('#app').hidden=false;message('記録を読み込んでいます…');
  try{const snap=await getDoc(doc(db,'users',u.uid,'appData','hopeProgram'));state=snap.exists()?snap.data():{};message('');startProfile();if(state.profile)loadCoachComment(u,week())}
  catch(e){message('記録を読み込めませんでした。通信と権限を確認してください。',true);$('#workspace').hidden=true}
});
fetch('./food-master.json').then(r=>{if(!r.ok)throw new Error('master');return r.json()}).then(v=>{foodMaster=v.foods||[];if($('#sampleCard'))$('#sampleCard').outerHTML=renderSample()}).catch(()=>{message('食品マスターを読み込めませんでした。自由入力は使えます。',true)});
$('#setupForm').addEventListener('input',()=>{
  const f=$('#setupForm'),h=Number(f.elements.heightCm.value),w=Number(f.elements.startWeight.value),p=Number(f.elements.goalPercent.value);
  $('#goalPreview').textContent=h>0&&w>0?`目標体重 ${goalWeight(w,p).toFixed(1)}kg　/　BMI ${bmi(h,w).toFixed(1)}`:'身長と体重を入力すると、目標体重とBMIを表示します。';
});
$('#setupForm').addEventListener('submit',async e=>{
  e.preventDefault(); const f=e.target;
  if(!f.reportValidity())return;
  const p={name:f.elements.name.value.trim(),age:Number(f.elements.age.value),heightCm:Number(f.elements.heightCm.value),startWeight:Number(f.elements.startWeight.value),waist:Number(f.elements.waist.value),goalPercent:Number(f.elements.goalPercent.value),startDate:today()};
  if(!p.name || !Number.isFinite(p.startWeight) || !Number.isFinite(p.heightCm))return;
  const next=copy();next.profile=p;next.goals=[{percent:p.goalPercent,target:goalWeight(p.startWeight,p.goalPercent),reviewStatus:'pending',changedAt:new Date().toISOString()}];
  try{await persist(next);startProfile()}catch(e){message('初回設定を保存できませんでした。通信と権限を確認してください。',true)}
});
document.addEventListener('click',async e=>{
  const switchAccount=e.target.closest('#switchProgramAccount');
  if(switchAccount){
    switchAccount.disabled=true;message('アカウントを切り替えています…');
    try{
      await signOut(auth);
      user=null;state={};coachComment=null;
      for(const url of photoUrls)URL.revokeObjectURL(url);photoUrls=[];
      $('#login').hidden=false;$('#app').hidden=true;$('#email').focus();
      message('利用するアカウントでログインしてください。');
    }catch(error){
      switchAccount.disabled=false;message('ログアウトできませんでした。もう一度お試しください。',true);
    }
    return;
  }
  const sample=e.target.closest('[data-sample]');
  if(sample){sampleCategory=sample.dataset.sample;$('#sampleCard').outerHTML=renderSample();revealSelectedSample();return}
  const rice=e.target.closest('[data-rice-grams]');
  if(rice){$('#mealForm').elements.grams.value=rice.dataset.riceGrams;updatePoints();return}
  const nav=e.target.closest('[data-page],[data-go],[data-meal]');
  if(!nav)return;
  if(nav.dataset.meal){mealType=nav.dataset.meal;document.querySelectorAll('[data-meal]').forEach(x=>x.classList.toggle('selected',x.dataset.meal===mealType))}
  else open(nav.dataset.page||nav.dataset.go);
});
function openPhotoDB(){
  return new Promise((resolve,reject)=>{const req=indexedDB.open('hope-program-photos',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('photos');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
}
async function savePhoto(id,file){
  const db=await openPhotoDB();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
  finally{db.close()}
}
async function deletePhoto(id){const db=await openPhotoDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
async function loadVisiblePhotos(){
  const targets=[...document.querySelectorAll('#record [data-photo-id]')];
  if(!targets.length)return;
  try{
    const photoDB=await openPhotoDB();
    for(const el of targets){
      const file=await new Promise((resolve,reject)=>{const tx=photoDB.transaction('photos','readonly');const req=tx.objectStore('photos').get(el.dataset.photoId);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
      if(file && el.isConnected){const url=URL.createObjectURL(file);photoUrls.push(url);const img=document.createElement('img');img.src=url;img.alt='記録した食事の写真';img.className='photo';el.append(img)}
    }
    photoDB.close();
  }catch(e){message('この端末の写真を読み込めませんでした。',true)}
}
document.addEventListener('input',e=>{
  const f=$('#mealForm');if(!f)return;
  if(e.target.id==='foodSearch'){
    const query=e.target.value.trim().toLocaleLowerCase('ja');
    const matches=query.length>=2?foodMaster.filter(x=>x.name.toLocaleLowerCase('ja').includes(query)).slice(0,8):[];
    $('#foodResults').replaceChildren(...matches.map(x=>{
      const b=document.createElement('button');b.type='button';b.textContent=`${x.name}（${x.category}・${x.group} / 1点 ${x.gramsPerPoint}g）`;
      b.onclick=()=>{selectFood(x);$('#foodResults').replaceChildren()};
      return b;
    }));
  }
  if(e.target.name==='food' && f.dataset.masterName!==e.target.value){delete f.dataset.masterId;delete f.dataset.masterName;$('#riceAmounts').hidden=true}
  if(e.target.name==='grams'||e.target.name==='food')updatePoints();
});
function selectFood(candidate){
  const f=$('#mealForm'),name=typeof candidate==='string'?candidate:candidate.name;
  const matches=typeof candidate==='string'?foodMaster.filter(x=>x.name===name):[candidate];
  const x=matches.length===1?matches[0]:null;
  f.elements.food.value=name;
  if(x){f.dataset.masterName=name;f.dataset.masterId=foodId(x);$('#selectedFood').textContent=`${name}｜${x.category}｜${x.group}｜1点 ${x.gramsPerPoint}g`}
  else {delete f.dataset.masterName;delete f.dataset.masterId;$('#selectedFood').textContent=matches.length>1?'同じ名前の食品が複数あります。検索結果から分類を選んでください。':'自由入力の食品です。点数は未計算のまま記録します。'}
  $('#riceAmounts').hidden=x?.name!=='めし・水稲・精白米';
  updatePoints();
}
function renderFoodShortcuts(){
  const seen=new Set(),recent=[];
  for(const entry of [...(state.meals||[])].reverse()){
    if(!entry.food)continue;
    const key=entry.masterId||entry.food;
    if(seen.has(key))continue;
    seen.add(key);recent.push({name:entry.food,master:foodFromId(entry.masterId)});
    if(recent.length===5)break;
  }
  const saved=(state.savedFoods||[]).map(name=>({name,master:null}));
  for(const [selector,label,items] of [['#recentFoods','最近使った食品',recent],['#savedFoods','登録済み食品',saved]]){
    const box=$(selector);box.replaceChildren();
    if(!items.length)continue;
    const title=document.createElement('p');title.className='muted';title.textContent=label;box.append(title);
    for(const item of items){const b=document.createElement('button');b.type='button';b.textContent=item.master?`${item.name}（${item.master.category}）`:item.name;b.onclick=()=>selectFood(item.master||item.name);box.append(b)}
  }
}
document.addEventListener('click',async e=>{
  if(e.target.id!=='saveFood')return;
  const name=$('#mealForm')?.elements.food.value.trim();
  if(!name){message('登録する食品名を入力してください。',true);return}
  const next=copy();next.savedFoods=[...new Set([...(next.savedFoods||[]),name])];
  try{await persist(next,{savedFoods:arrayUnion(name)})}catch(err){message('食品を登録できませんでした。',true)}
});
function updatePoints(){
  const f=$('#mealForm'), x=foodFromId(f.dataset.masterId), grams=Number(f.elements.grams.value);
  $('#pointPreview').textContent=x && grams>0?`${x.group}：${foodPoints(grams,x.gramsPerPoint).toFixed(2)}点 / 約${Math.round(grams/x.gramsPerPoint*PROGRAM.kcalPerPoint)}kcal（マスターの1点重量から計算）`:'';
}
document.addEventListener('submit',async e=>{
  if(!['mealForm','measurementForm','questionForm','weeklyQuestionForm','reflectionForm','goalForm'].includes(e.target.id))return;
  e.preventDefault();const f=e.target,next=copy(),w=week();
  const button=f.querySelector('button[type=submit]');button.disabled=true;message('保存中…');
  let photoId=null, writePatch=null;
  try{
    if(f.id==='mealForm'){
      const file=f.elements.photo.files[0], food=f.elements.food.value.trim(), amount=f.elements.amount.value.trim(), memo=f.elements.memo.value.trim();
      if(!file&&!food&&!memo)throw new Error('写真、食品名、メモのいずれかを入力してください。');
      if(file && (!file.type.startsWith('image/') || file.size>15*1024*1024))throw new Error('15MB以下の画像を選んでください。');
      photoId=file?crypto.randomUUID():null;
      if(file)await savePhoto(photoId,file);
      const selected=foodFromId(f.dataset.masterId),master=selected?.name===food?selected:null,grams=f.elements.grams.value?Number(f.elements.grams.value):null;
      const entry={id:crypto.randomUUID(),date:f.elements.date.value,type:mealType,food,amount,memo,photoId,grams,masterId:master?foodId(master):null,category:master?.category||null,group:master?.group||null,points:master&&grams?foodPoints(grams,master.gramsPerPoint):null,createdAt:new Date().toISOString()};
      next.meals=[...(next.meals||[]),entry];writePatch={meals:arrayUnion(entry)};
    } else if(f.id==='measurementForm'){
      const values={};
      for(const key of ['weight','waist','water'])if(f.elements[key].value)values[key]=Number(f.elements[key].value);
      for(const key of ['condition','mood','bowel','memo'])if(f.elements[key].value.trim())values[key]=f.elements[key].value.trim();
      if(!Object.keys(values).length)throw new Error('記録する項目を一つ選んでください。');
      next.measurements={...(next.measurements||{}),[f.elements.date.value]:{...(next.measurements?.[f.elements.date.value]||{}),...values}};
      writePatch={measurements:{[f.elements.date.value]:values}};
    } else if(f.id==='questionForm'){
      const a={};for(const q of questions){a[q.id]=Array.from(f.querySelectorAll(`[name="${q.id}"]:checked`)).map(x=>x.value);a[q.id+'Text']=f.elements[q.id+'Text'].value.trim()}
      a.future=f.elements.future.value.trim();next.answers={...(next.answers||{}),1:a};writePatch={answers:{1:a}};
    } else if(f.id==='weeklyQuestionForm'){
      const choices=[...f.querySelectorAll('[name="answer"]:checked')].map(x=>x.value);
      const limit=CURRICULUM[w-1].question.max;
      if(limit && choices.length>limit)throw new Error(`選択は${limit}個までにしてください。`);
      const answer={choices,freeText:f.elements.freeText.value.trim()};
      next.answers={...(next.answers||{}),[w]:answer};writePatch={answers:{[w]:answer}};
    } else if(f.id==='reflectionForm'){
      const reflection=f.elements.reflection.value.trim();
      next.reflections={...(next.reflections||{}),[w]:reflection};writePatch={reflections:{[w]:reflection}};
    }
    else if(f.id==='goalForm'){
      const percent=Number(f.elements.percent.value), last=next.goals.at(-1);
      if(percent===last.percent)throw new Error('現在と同じ目標です。');
      const goal={percent,target:goalWeight(next.profile.startWeight,percent),reviewStatus:'pending',changedAt:new Date().toISOString()};
      next.goals.push(goal);writePatch={goals:arrayUnion(goal)};
    }
    await persist(next,writePatch);
  }catch(err){if(photoId)await deletePhoto(photoId).catch(()=>{});message(err.message?.includes('ください')||err.message?.includes('同じ')?err.message:'保存できませんでした。通信と権限を確認してください。',true)}
  finally{button.disabled=false}
});
