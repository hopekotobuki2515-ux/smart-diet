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
let masterStatus = 'loading', recordDate = '', ingredients = [];
const foodId = x => JSON.stringify([x.name,x.category,x.gramsPerPoint]);
const foodFromId = id => foodMaster.find(x=>foodId(x)===id);
const meals = ['朝食','昼食','夕食','間食','飲み物','飲酒'];
const groups = ['第1群','第2群','第3群','第4群'];
const exampleDishes = ['ご飯','焼き魚','みそ汁','アジフライ','スパゲティ'];
const dryPasta = 'マカロニ・スパゲッティ・乾';
const drySpaghettiLabel = 'スパゲッティ（乾麺）';
const dryMacaroniLabel = 'マカロニ（乾麺）';
const dryPastaLabels = [drySpaghettiLabel,dryMacaroniLabel,'パスタ（乾麺）'];
const pastaDishes = ['ミートソーススパゲティ','ナポリタン','カルボナーラ','ペペロンチーノ'];
const recipeFoodNames = new Map([
  ['牛ひき肉',['ひき肉','肉類・牛肉（脂身つき）']],
  ['鶏もも肉（皮つき）',['もも・皮つき','肉類・鶏肉（若鶏）・鶏の副生物']],
  ['豚バラ肉',['ばら','肉類・豚肉（大型種脂身つき）']],
  ['豚ロース肉',['ロース','肉類・豚肉（大型種脂身つき）']],
  ['牛バラ肉（輸入牛）',['ばら・輸入牛','肉類・牛肉（脂身つき）']],
  ['牛もも肉（輸入牛）',['もも・輸入牛','肉類・牛肉（脂身つき）']]
]);
const dishIngredients = new Map([
  ['ご飯',['めし・水稲・精白米']],
  ['焼き魚',['マサバ','シロサケ','マアジ']],
  ['みそ汁',['米みそ・淡色辛みそ','米みそ・赤色辛みそ','もめん豆腐','絹ごし豆腐','カットわかめ','油揚げ','こねぎ']],
  ['アジフライ',['マアジ','小麦粉・薄力粉','鶏卵・全卵・生','パン粉・乾燥','調合油']],
  ['スパゲティ',[dryPasta]],
  // Recipe sources identify suggested foods only. The master supplies all groups and point weights.
  // https://www.kagome.co.jp/products/recipe/10037/
  ['ミートソーススパゲティ',[dryPasta,'牛ひき肉','トマト・缶詰・ホール','玉ねぎ','にんじん','セロリ','にんにく','オリーブ油']],
  // https://www.kagome.co.jp/products/recipe/Z6900/
  ['ナポリタン',[dryPasta,'ウインナーソーセージ','玉ねぎ','青ピーマン','トマトケチャップ','調合油']],
  // https://www.nisshin-seifun-welna.com/index/recipe/detail/p-1193.html
  ['カルボナーラ',[dryPasta,'ベーコン','鶏卵・卵黄・生','パルメザンチーズ','普通牛乳','オリーブ油']],
  // https://housefoods.jp/recipe/rcp_00025666.html
  ['ペペロンチーノ',[dryPasta,'にんにく','とうがらし','オリーブ油']],
  // https://www.kikkoman.co.jp/homecook/search/recipe/00054362/
  ['親子丼',['めし・水稲・精白米','鶏もも肉（皮つき）','鶏卵・全卵・生','玉ねぎ','しょうゆ・濃い口しょうゆ']],
  // https://www.marukome.co.jp/recipe/detail/koji_405/
  ['豚汁',['豚バラ肉','大根','にんじん','ごぼう','板こんにゃく・精粉','根深ねぎ','米みそ・淡色辛みそ','米みそ・赤色辛みそ']],
  // https://www.kikkoman.co.jp/homecook/search/recipe/00007345/
  ['肉じゃが',['じゃが芋','玉ねぎ','にんじん','しらたき','しょうゆ・濃い口しょうゆ','上白糖','牛バラ肉（輸入牛）','牛もも肉（輸入牛）']],
  // https://housefoods.jp/recipe/rcp_00008909.html
  ['カレーライス',['めし・水稲・精白米','玉ねぎ','じゃが芋','にんじん','カレールウ','調合油','豚ロース肉']]
]);
const misoOptions = ['米みそ・淡色辛みそ','米みそ・赤色辛みそ'];
const dishOptionalIngredients = new Map([
  ['焼き魚',['マサバ','シロサケ','マアジ']],
  ['みそ汁',[...misoOptions,'もめん豆腐','絹ごし豆腐']],
  ['豚汁',misoOptions],
  ['肉じゃが',['牛バラ肉（輸入牛）','牛もも肉（輸入牛）']],
  ['カレーライス',['豚ロース肉']]
]);
function recipeFoodMatches(food,ingredient){
  const [name,category]=recipeFoodNames.get(ingredient)??[ingredient];
  return food.name===name&&(!category||food.category===category);
}
const quickGrams = [1,2,3,5,10,15,20,30,40,50,60,65,75,80,100,120,150,200,250,260,300];
const pointFormat = new Intl.NumberFormat('ja-JP',{maximumFractionDigits:2});
const formatPoints = points => points == null ? '—' : pointFormat.format(points)+'点';
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
async function persist(next, patch = next, afterWrite){
  if (!user) throw new Error('ログインが必要です');
  const account = user;
  const { coachComments, ...writable } = patch;
  await setDoc(doc(db,'users',account.uid,'appData','hopeProgram'), writable, {merge:true});
  if (user !== account) return;
  state = next; afterWrite?.(); message('保存しました'); render();
}
function copy(){ return structuredClone(state); }
function startProfile(admitted = false){
  $('#invite').hidden = Boolean(state.profile) || admitted;
  if (!state.profile) { $('#setup').hidden=!admitted; $('#workspace').hidden=true; return; }
  $('#setup').hidden=true; $('#workspace').hidden=false; render();
}
function mode(){ return state.onboarding?.mode ?? 'program'; }
function week(){ return currentWeek(state.onboarding?.programStartDate ?? state.profile.startDate); }
function recordedDates(){
  const end = today();
  return [...new Set((state.meals || [])
    .filter(meal => meal.date >= state.profile.startDate && meal.date <= end)
    .map(meal => meal.date))].sort();
}
function daysRecorded(){ return recordedDates().length; }
function observationSummary(){
  const dates = new Set(recordedDates().slice(0, 3));
  const entries = (state.meals || []).filter(meal => dates.has(meal.date));
  const rows = meals.map(type => `<li>${type} ${entries.filter(meal => meal.type === type).length}件</li>`).join('');
  return `<div class="card"><h2>最初の3日分を振り返る</h2><p>${[...dates].map(esc).join('、')}に保存した記録を集計しました。</p><ul>${rows}</ul></div>`;
}
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
  return `<div class="card coach-comment"><div class="coach-head"><img src="./coach.svg" alt="男性コーチのイラスト"><div><span class="eyebrow">村田コーチより</span><h2>HOPEからのコメント</h2></div></div><p>${body}</p></div>`;
}
async function loadCoachComment(account, weekNumber){
  coachComment = null;
  try {
    const snap = await getDoc(doc(db, 'coachComments', account.uid, 'weeks', String(weekNumber)));
    if (user !== account || week() !== weekNumber) return;
    coachComment = snap.exists() ? snap.data() : null;
  } catch (error) {
    // This separate path remains denied until the reviewed rules are deployed.
    if (user !== account || week() !== weekNumber) return;
    coachComment = null;
  }
  for (const card of document.querySelectorAll('#home .coach-comment, #week .coach-comment')) {
    card.outerHTML = comment();
  }
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
  if (mode() !== 'program') {
    const n = daysRecorded();
    const observing = mode() === 'observe';
    $('#home').innerHTML = `
      <div class="card"><h1>${observing ? 'まずは普段の食事を記録' : 'いつもの食事を記録'}</h1>
      ${observing ? `<p>最初の3日間は、いつも通りの食事を記録します。点数の入力は任意です。</p><p>食事を記録した日 <strong>${Math.min(n, 3)} / 3日</strong></p>` : '<p>食事や体重の記録を続けられます。</p>'}
      <button class="button" data-go="record">食事を記録する</button></div>
      ${observing && n >= 3 ? observationSummary() : ''}
      <div class="card"><h2>12週間のSMART Diet</h2><p>食事を記録しながら、毎週の教材で食品の量や食事の組み立て方を学びます。</p>
      <button type="button" class="button ghost" data-mode="program">SMART Dietを始める</button>
      ${observing && n >= 3 ? '<button type="button" class="button ghost" data-mode="diary">食事記録だけを続ける</button>' : ''}
      </div><div class="card"><h2>体重の流れ</h2>${graph()}</div>`;
    return;
  }
  const w=week(), n=daysRecorded(), bars=Array.from({length:12},(_,i)=>`<i class="${i<w?'done':''}"></i>`).join('');
  $('#home').innerHTML=`
    <div class="card"><span class="eyebrow">こんにちは、${esc(state.profile.name)}さん</span><h1>今日も、自分のペースで。</h1><p>第${w}週 / 12週間</p><div class="progress" aria-label="12週間中${w}週目">${bars}</div></div>
    <div class="card"><span class="eyebrow">今週のお話</span><h2>第${w}週　${esc(WEEK_TITLES[w-1])}</h2><p>読むことは任意です。食事の記録から始めても大丈夫です。</p><button class="button ghost" data-go="week">今週のお話を見る</button></div>
    <div class="card"><h2>今日やること</h2><div class="row"><span>${w===1?'いつもの食事を記録':'食事を記録する'}</span><button data-go="record">記録する</button></div><div class="row"><span>体重・体調を残す（任意）</span><button data-go="record" data-measurement>入力する</button></div>${w===1?`<p class="muted">第1週は3日間、できれば平日2日と休日1日。現在 ${n}日分です。写真やメモだけでも記録できます。</p>`:''}</div>
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
function renderLearn(){
  const w = week();
  $('#learn').innerHTML = `<div class="card"><h1>学び</h1>
    <p>12週間のテーマを確認できます。今週のお話と、すでに進んだ週の教材を読み返せます。</p>
    <button class="button ghost" data-go="week">今週のお話を見る</button></div>
    <div class="card"><h2>12週間のテーマ</h2><ol class="lesson-list">
    ${WEEK_TITLES.map((title, index) => {
      const number = index + 1;
      const label = `第${number}週　${esc(title)}`;
      return number <= w
        ? `<li><details><summary>${label}${number === w ? '（今週）' : ''}</summary>${CURRICULUM[index].lesson.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}<p><strong>やってみること</strong><br>${esc(CURRICULUM[index].task)}</p></details></li>`
        : `<li><span>${label}</span></li>`;
    }).join('')}</ol></div>`;
}
function renderRecord(){
  const list=(state.meals||[]).slice(-20).reverse();
  const dates=[...new Set(list.map(entry=>entry.date))].sort().reverse();
  const date = recordDate || today();
  const previous = $('#mealForm');
  const dishNames = [...new Set([...list.flatMap(meal => meal.ingredients || [meal])
    .map(item => item.dish).filter(name => typeof name === 'string' && name.trim())
    .slice(0,20), ...exampleDishes])].slice(0,12);
  const sheet = $('#daySheet');
  if (sheet?.open) sheet.close();
  $('#record').innerHTML=`<div class="card"><h1>食事ダイアリー</h1><p>食材を選んで、1食分をまとめて保存します。写真やメモだけでも記録できます。</p>
    <form id="mealForm"><label>日付<input id="mealDate" name="date" type="date" value="${esc(date)}" required></label>
    <button id="editDaySheet" class="button ghost" type="button">ダイアリーに直接入力</button>
    <div class="tabs diary-tabs" role="group" aria-label="食事の種類">${meals.map(t=>`<button type="button" data-meal="${t}" aria-pressed="${t===mealType}" class="${t===mealType?'selected':''}">${t}</button>`).join('')}</div>
    <label>写真（任意・この端末だけに保存）<input name="photo" type="file" accept="image/*"></label>
    <label>料理名（任意）<select id="dishChoice">
      <option value="">料理名を付けない</option>
      ${dishNames.map(name=>`<option value="name:${esc(name)}">${esc(name)}</option>`).join('')}
      <option value="custom">料理名を入力する</option>
    </select></label>
    <div id="customDish" hidden><label>料理名を入力<input name="dish" maxlength="120" placeholder="例：ささみのソテー"></label></div>
    <div id="dishNameSuggestions" class="food-shortcuts" aria-live="polite" hidden></div>
    <div id="dishSuggestions" class="food-shortcuts" aria-live="polite" hidden></div>
    <label>食材を探す<input id="foodSearch" type="search" autocomplete="off" placeholder="例：ご飯、ささみ、ごま油"></label>
    <div id="foodResults" class="food-results" aria-live="polite"></div>
    <details id="foodCatalog" class="meal-options"></details>
    <details id="foodShortcuts" class="meal-options" hidden><summary>最近使った食材・登録済みの食材</summary>
    <div id="recentFoods" class="food-shortcuts"></div><div id="savedFoods" class="food-shortcuts"></div></details>
    <p id="selectedFood" class="muted" aria-live="polite"></p>
    <div id="ingredientEditor" hidden>
    <label>食べた量<select id="quickGrams"><option value="">量がわからない</option>${quickGrams.map(g=>`<option value="${g}">${g}g</option>`).join('')}<option value="custom">グラムを入力する</option></select></label>
    <label id="exactGrams" hidden>食べた量（g）<input name="grams" type="number" min="0.1" max="10000" step="0.1" inputmode="decimal"></label><p id="pointPreview" class="muted" aria-live="polite"></p>
    <button id="addIngredient" type="button" class="button ghost">この食材を追加</button>
    <button id="clearSelectedFood" type="button" class="small-button">選んだ食材を取り消す</button>
    </div>
    <div id="mealFeedback" class="muted" role="status"></div>
    <p id="ingredientCount" class="muted" hidden></p>
    <ul id="ingredientList" class="ingredient-list" aria-label="追加した食材"></ul>
    <details id="manualFood" class="meal-options"><summary>食材名・食品群・点数を手入力</summary>
    <label>食材名<input name="food" maxlength="120"></label><label>量のメモ<input name="amount" maxlength="80"></label>
    <div class="two"><label>食品群<select name="group"><option value="">未選択</option>${groups.map(g=>`<option>${g}</option>`).join('')}</select></label><label>点数<input name="points" type="number" min="0" max="1000" step="0.01" inputmode="decimal"></label></div>
    <button id="saveFood" type="button" class="small-button">この食品を登録する</button></details>
    <details class="meal-options"><summary>時刻・メモを追加（任意）</summary>
    <label>食べた時刻<input name="time" type="time"></label>
    <label>ひとこと<textarea name="memo" maxlength="500"></textarea></label></details>
    <button class="button" type="submit">この食事を保存する</button>
    <button id="dayPreview" class="button ghost" type="button">1日のダイアリーをプレビュー</button></form>
    <dialog id="daySheet" aria-labelledby="daySheetTitle"></dialog></div>
    <div class="card"><h2>記録した食事</h2><div id="mealList">${dates.length?dates.map(date=>`
      <section class="saved-diary"><h3><time datetime="${esc(date)}">${esc(date)}</time></h3>
      ${list.filter(entry=>entry.date===date).map(x=>`<div class="meal-entry"><strong>${esc(x.type)}</strong><br>${esc(foodLabel(x.food,x.ingredients?.[0]?.dish??x.dish,x.ingredients?.[0]?.foodLabel)||'写真・メモの記録')}${x.amount?' / '+esc(x.amount):''}${x.group?' / '+esc(x.group):''}${x.points!=null?' / '+esc(x.points)+'点':''}${x.photoId?`<div data-photo-id="${esc(x.photoId)}"></div>`:''}</div>`).join('')}
      <button type="button" class="small-button" data-saved-diary="${esc(date)}" aria-label="${esc(date)}のダイアリーを開く">この日のダイアリーを開く</button></section>`).join(''):'<p class="muted">まだ記録はありません。</p>'}</div></div>
    <div class="card"><h2 id="measurementTitle" tabindex="-1">体重・体調を記録する</h2><p class="muted">全部入力しなくても大丈夫です。</p><form id="measurementForm">
    <label>日付<input name="date" type="date" value="${esc(date)}" required></label><div class="two"><label>体重（kg）<input name="weight" type="number" min="10" max="500" step="0.1" inputmode="decimal"></label><label>腹囲（おへその高さ）<input name="waist" type="number" min="20" max="300" step="0.1" inputmode="decimal" placeholder="cm"></label></div>
    <label>体調<select name="condition"><option value="">選択しない</option><option>とても良い</option><option>良い</option><option>普通</option><option>やや不調</option><option>不調</option></select></label>
    <label>気分<select name="mood"><option value="">選択しない</option><option>😊 良い</option><option>🙂 まあまあ</option><option>😐 普通</option><option>😟 気になる</option></select></label>
    <div class="two"><label>便通<select name="bowel"><option value="">選択しない</option><option>あり</option><option>なし</option></select></label><label>水分（L）<input name="water" type="number" min="0" max="20" step="0.1" inputmode="decimal"></label></div>
    <label>メモ<textarea name="memo" maxlength="500"></textarea></label><button class="button" type="submit">体重・体調を保存する</button></form></div>`;
  for(const url of photoUrls)URL.revokeObjectURL(url);photoUrls=[];
  loadVisiblePhotos();
  if (previous) $('#mealForm').replaceWith(previous);
  const catalog=$('#foodCatalog');
  if(!catalog.firstChild)mountFoodCatalog(catalog,({food,label})=>{if(selectFood(food,label))$('#quickGrams').focus();});
  renderFoodShortcuts();
  renderDishSuggestions();
  renderIngredients();
  updatePoints();
  if (!$('#mealForm').elements.food.value) showMasterStatus();
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
  const active = mode() === 'program';
  if (!active && (page === 'week' || page === 'learn')) page = 'home';
  renderHome();renderRecord();renderMore();
  if (active) { renderWeek(); renderLearn(); }
  for (const name of ['week', 'learn']) {
    document.querySelector(`[data-page="${name}"]`).hidden = !active;
    if (!active) $(`#${name}`).replaceChildren();
  }
  document.querySelectorAll('.panel').forEach(el=>el.hidden=el.id!==page);
  document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('selected',el.dataset.page===page));
}
function open(pageName){page=pageName;render();window.scrollTo(0,0)}
$('#signIn').onclick=async()=>{
  message('ログイン中…');
  try{await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#password').value);message('')}
  catch(e){message('ログインできませんでした。メールアドレスとパスワードを確認してください。',true)}
};
onAuthStateChanged(auth, async account => {
  user = account;
  state = {};
  ingredients = [];
  recordDate = '';
  mealType = meals[0];
  const sheet = $('#daySheet');
  if (sheet?.open) sheet.close();
  $('#record').replaceChildren();
  page = 'home';
  coachComment = null;
  $('#login').hidden = Boolean(account);
  $('#app').hidden = !account;
  $('#invite').hidden = true;
  $('#inviteForm').reset();
  $('#setup').hidden = true;
  $('#workspace').hidden = true;
  if (!account) return;
  message('記録を読み込んでいます…');
  try {
    const snap = await getDoc(doc(db, 'users', account.uid, 'appData', 'hopeProgram'));
    if (user !== account) return;
    state = snap.exists() ? snap.data() : {};
    const admission = state.profile ? null : await getDoc(doc(db, 'programAdmissions', account.uid));
    if (user !== account) return;
    message('');
    startProfile(admission?.exists());
    if (state.profile && mode() === 'program') loadCoachComment(account, week());
  } catch {
    if (user === account) message('記録を読み込めませんでした。通信と権限を確認してください。', true);
  }
});
$('#inviteForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const account = user;
  const code = form.elements.invite.value;
  if (!account || !code || button.disabled) return;
  button.disabled = true;
  message('共通パスワードを確認しています…');
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    const admission = doc(db, 'programAdmissions', account.uid);
    try {
      await setDoc(admission, {digest});
    } catch (error) {
      // Another tab may have completed enrollment while this form was open.
      if (error.code !== 'permission-denied' || !(await getDoc(admission)).exists()) throw error;
    }
    if (user !== account) return;
    message('');
    startProfile(true);
  } catch (error) {
    if (user !== account) return;
    message(error.code === 'permission-denied'
      ? '共通パスワードを確認してください。'
      : '確認できませんでした。通信を確認して、もう一度お試しください。', true);
  } finally {
    form.reset();
    button.disabled = false;
  }
});
fetch('./food-master.json')
  .then(r=>{if(!r.ok)throw new Error('master');return r.json()})
  .then(v=>{
    if (!Array.isArray(v.foods) || !v.foods.length) throw new Error('master');
    foodMaster=v.foods;
    masterStatus='ready';
    if($('#sampleCard'))$('#sampleCard').outerHTML=renderSample();
    if($('#mealForm'))renderFoodShortcuts();
  })
  .catch(()=>{masterStatus='failed'})
  .finally(()=>{
    if($('#foodSearch')){showMasterStatus();searchFoods();renderDishSuggestions();}
    $('#sheetEntryForm')?.dispatchEvent(new Event('foodmasterchange'));
    document.querySelectorAll('#foodCatalog,[data-sheet-catalog]').forEach(catalog=>catalog.dispatchEvent(new Event('foodmasterchange')));
  });
$('#setupForm').addEventListener('input',()=>{
  const f=$('#setupForm'),h=Number(f.elements.heightCm.value),w=Number(f.elements.startWeight.value),p=Number(f.elements.goalPercent.value);
  $('#goalPreview').textContent=h>0&&w>0?`目標体重 ${goalWeight(w,p).toFixed(1)}kg　/　BMI ${bmi(h,w).toFixed(1)}`:'身長と体重を入力すると、目標体重とBMIを表示します。';
});
$('#setupForm').addEventListener('submit',async e=>{
  e.preventDefault(); const f=e.target;
  if(!f.reportValidity())return;
  const p={name:f.elements.name.value.trim(),age:Number(f.elements.age.value),heightCm:Number(f.elements.heightCm.value),startWeight:Number(f.elements.startWeight.value),waist:Number(f.elements.waist.value),goalPercent:Number(f.elements.goalPercent.value),startDate:today()};
  if(!p.name || !Number.isFinite(p.startWeight) || !Number.isFinite(p.heightCm))return;
  const next=copy();next.profile=p;next.onboarding={mode:'observe'};next.goals=[{percent:p.goalPercent,target:goalWeight(p.startWeight,p.goalPercent),reviewStatus:'pending',changedAt:new Date().toISOString()}];
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
  const selection = e.target.closest('[data-mode]');
  if (selection) {
    if (mode() === 'program') return;
    const selectedMode = selection.dataset.mode;
    if (selectedMode !== 'program' && (selectedMode !== 'diary' || mode() !== 'observe' || daysRecorded() < 3)) return;
    const account = user;
    selection.parentElement.querySelectorAll('[data-mode]').forEach(button => button.disabled = true);
    const next = copy();
    next.onboarding = selectedMode === 'program'
      ? {mode:'program', programStartDate:today()}
      : {mode:'diary'};
    try {
      await persist(next, {onboarding:next.onboarding});
      if (selectedMode === 'program' && user === account) loadCoachComment(account, week());
    } catch {
      message('利用方法を保存できませんでした。通信と権限を確認してください。', true);
      selection.parentElement.querySelectorAll('[data-mode]').forEach(button => button.disabled = false);
    }
    return;
  }
  const sample=e.target.closest('[data-sample]');
  if(sample){sampleCategory=sample.dataset.sample;$('#sampleCard').outerHTML=renderSample();revealSelectedSample();return}
  const nav=e.target.closest('[data-page],[data-go],[data-meal]');
  if(!nav)return;
  if(nav.dataset.meal){
    mealType=nav.dataset.meal;
    document.querySelectorAll('[data-meal]').forEach(button=>{
      const selected=button.dataset.meal===mealType;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
  }
  else {
    open(nav.dataset.page||nav.dataset.go);
    if(nav.hasAttribute('data-measurement')) $('#measurementTitle').focus();
  }
});
function openPhotoDB(){
  return new Promise((resolve,reject)=>{const req=indexedDB.open('hope-program-photos',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('photos');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
}
async function writePhoto(id,file){
  const photoDB=await openPhotoDB();
  try {
    await new Promise((resolve,reject)=>{
      const tx=photoDB.transaction('photos','readwrite');
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error || new Error('写真の保存が中断されました。'));
      tx.onerror=()=>reject(tx.error);
      const photos=tx.objectStore('photos');
      if(file)photos.put(file,id);
      else photos.delete(id);
    });
  } finally {photoDB.close()}
}
async function loadVisiblePhotos(root = $('#mealList'), urls = photoUrls){
  const targets=[...root.querySelectorAll('[data-photo-id]')];
  if(!targets.length)return;
  let photoDB;
  try{
    photoDB=await openPhotoDB();
    for(const el of targets){
      const file=await new Promise((resolve,reject)=>{const tx=photoDB.transaction('photos','readonly');const req=tx.objectStore('photos').get(el.dataset.photoId);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
      if(file && el.isConnected){const url=URL.createObjectURL(file);urls.push(url);const img=document.createElement('img');img.src=url;img.alt='記録した食事の写真';img.className='photo';el.append(img)}
      else if(el.isConnected) el.textContent='写真は撮影・選択した端末で表示されます。';
    }
  }catch(e){message('この端末の写真を読み込めませんでした。',true)}
  finally {photoDB?.close()}
}
function showMasterStatus(){
  $('#selectedFood').textContent=({loading:'食品マスターを読み込んでいます。',failed:'食品マスターを読み込めませんでした。食材名は手入力できます。',ready:''})[masterStatus];
}
const searchKey = value => value.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s・]/g,'');
const dishAliases = new Map([
  ['白ご飯','ご飯'],['ごはん','ご飯'],['白ごはん','ご飯'],
  ['味噌汁','みそ汁'],['味噌しる','みそ汁'],['みそしる','みそ汁'],
  ['あじフライ','アジフライ'],['鯵フライ','アジフライ'],
  ['スパゲッティ','スパゲティ'],['パスタ','スパゲティ'],
  ['ミートソーススパゲッティ','ミートソーススパゲティ'],['ミートソース','ミートソーススパゲティ'],
  ['おやこ丼','親子丼'],['とん汁','豚汁'],['とんじる','豚汁'],['ぶた汁','豚汁'],
  ['肉ジャガ','肉じゃが'],['カレー','カレーライス']
]);
const dishKey = name => {
  const key=searchKey(name);
  return dishAliases.get(key)??key;
};
function foodLabel(name, dish='', explicitLabel){
  if(name!==dryPasta)return recipeFoodNames.get(explicitLabel)?.[0]===name?explicitLabel:name;
  if(dryPastaLabels.includes(explicitLabel))return explicitLabel;
  if(searchKey(dish)==='パスタ')return 'パスタ（乾麺）';
  const key=dishKey(dish);
  return key==='スパゲティ'||pastaDishes.includes(key)?drySpaghettiLabel:name;
}
function foodDescription(food, label){
  return food.name!==dryPasta||label===food.name
    ? `${label}｜${food.category}｜${food.group}｜1点 ${food.gramsPerPoint}g`
    : `${label}｜食品群：${food.group}｜乾麺${food.gramsPerPoint}gで1点`;
}
const foodAliases = new Map([
  ...['ご飯','ごはん','白ご飯','白ごはん'].map(name=>[name,'めし水稲精白米']),
  ['ささみ','ささ身'],['ササミ','ささ身']
]);
function findFoods(value, foods=foodMaster, limit=15){
  const typed=searchKey(value);
  const spelling=typed.replace(/\(乾麺\)$/,'');
  const spaghettiQuery=Boolean(spelling)&&['スパゲティ','スパゲッティ'].some(name=>name.startsWith(spelling));
  const macaroniQuery=Boolean(spelling)&&'マカロニ'.startsWith(spelling);
  const pastaQuery=spelling==='パスタ';
  const query=spaghettiQuery||pastaQuery?searchKey(dryPasta):(foodAliases.get(spelling)??spelling);
  const searchLabel=spaghettiQuery?drySpaghettiLabel:macaroniQuery?dryMacaroniLabel:null;
  const rank=name=>name===query?0:name.startsWith(query)?1:2;
  return query?foods.map(food=>({food,key:searchKey(food.name)}))
    .filter(({key})=>key.includes(query))
    .sort((a,b)=>rank(a.key)-rank(b.key))
    .slice(0,limit).flatMap(({food})=>{
    const labels=food.name===dryPasta
      ? searchLabel?[searchLabel]:[drySpaghettiLabel,dryMacaroniLabel]
      : [food.name];
    return labels.map(label=>({food,label}));
  }):[];
}
function exactFood(value,candidates){
  const key=searchKey(value);
  const canonical=foodAliases.get(key)??key;
  const exact=candidates.filter(({food,label})=>searchKey(food.name)===canonical
    || searchKey(label).replace(/\(乾麺\)$/,'')===key || searchKey(label)===key
    || (key==='スパゲティ'&&label===drySpaghettiLabel));
  return exact.length===1?exact[0]:null;
}
function mountFoodCatalog(catalog,onSelect){
  catalog.innerHTML=`<summary>食品マスターから選ぶ</summary>
    <label>食品マスター内を検索<input type="search" placeholder="例：ご飯、豆腐、牛乳" autocomplete="off"></label>
    <label>食品群で絞る<select><option value="">すべて</option>${groups.map(group=>`<option>${group}</option>`).join('')}</select></label>
    <p class="muted" data-catalog-status aria-live="polite"></p>
    <div class="food-results" data-catalog-results></div>
    <div class="food-catalog-pages">
      <button type="button" class="small-button" data-catalog-prev>前へ</button>
      <button type="button" class="small-button" data-catalog-next>次へ</button>
    </div>`;
  const group=catalog.querySelector('select');
  const search=catalog.querySelector('input[type=search]');
  const status=catalog.querySelector('[data-catalog-status]');
  const results=catalog.querySelector('[data-catalog-results]');
  const prev=catalog.querySelector('[data-catalog-prev]');
  const next=catalog.querySelector('[data-catalog-next]');
  const size=12;
  let page=0;
  function renderCatalog(){
    if(!catalog.open)return;
    const foods=foodMaster.filter(food=>!group.value||food.group===group.value);
    const query=search.value.trim();
    const matches=query?findFoods(query,foods,Infinity):null;
    const count=matches?new Set(matches.map(({food})=>foodId(food))).size:foods.length;
    const available=matches?.length??foods.length;
    const start=page*size;
    status.textContent=masterStatus==='ready'
      ? query?`${count}件見つかりました。${count?'':'食品群を「すべて」にするか、食品名を変えて検索してください。'}`
        : `${foods.length}件中 ${foods.length?start+1:0}〜${Math.min(start+size,foods.length)}件`
      : masterStatus==='loading'?'食品マスターを読み込み中です。':'食品マスターを読み込めませんでした。ページを再読み込みしてください。';
    const rows=matches?matches.slice(start,start+size):foods.slice(start,start+size).flatMap(food=>{
      const labels=food.name===dryPasta?[drySpaghettiLabel,dryMacaroniLabel]:[food.name];
      return labels.map(label=>({food,label}));
    });
    results.replaceChildren(...rows.map(({food,label})=>{
      const button=document.createElement('button');
      button.type='button';
      const familiarName=foodAliases.get(searchKey(query))===searchKey(food.name)?query:'';
      button.textContent=`${familiarName?`${familiarName}（${label}）`:label}｜${food.group}｜${food.gramsPerPoint}gで1点`;
      button.onclick=()=>{
        catalog.open=false;
        onSelect({food,label});
      };
      return button;
    }));
    prev.disabled=page===0;
    next.disabled=start+size>=available;
    prev.parentElement.hidden=available<=size;
  }
  catalog.addEventListener('toggle',renderCatalog);
  catalog.addEventListener('foodmasterchange',renderCatalog);
  group.onchange=()=>{page=0;renderCatalog();};
  search.oninput=()=>{page=0;renderCatalog();};
  search.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing)event.preventDefault();};
  prev.onclick=()=>{page-=1;renderCatalog();};
  next.onclick=()=>{page+=1;renderCatalog();};
}
function searchFoods(){
  const value=$('#foodSearch').value;
  const matches=findFoods(value);
  $('#foodResults').replaceChildren(...matches.map(({food:x,label})=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label===x.name?`${x.name}（${x.category}・${x.group} / 1点 ${x.gramsPerPoint}g）`:foodDescription(x,label);
    button.onclick=()=>{if(selectFood(x,label))$('#quickGrams').focus();};
      return button;
  }));
  if(value.trim() && !matches.length && masterStatus==='ready') $('#foodResults').textContent='該当する食材がありません。検索語を変えるか、下の手入力欄を使えます。';
}
function findDishNames(value){
  const query=searchKey(value);
  if(!query)return [];
  const dish=dishKey(value);
  if(dish==='スパゲティ')return pastaDishes;
  const names=new Map([...dishIngredients.keys()].map(name=>[name,name]));
  for(const meal of state.meals??[]){
    for(const item of meal.ingredients??[meal]){
      if(typeof item.dish==='string' && item.dish.trim()){
        const key=dishKey(item.dish);
        if(!names.has(key))names.set(key,item.dish);
      }
    }
  }
  if(names.has(dish))return [];
  const matches=new Map();
  for(const [spelling,key] of [...names.keys()].map(key=>[key,key]).concat([...dishAliases])){
    if(names.has(key) && spelling.includes(query)){
      const rank=spelling.startsWith(query)?0:1;
      matches.set(key,Math.min(matches.get(key)??rank,rank));
    }
  }
  return [...matches].sort((a,b)=>a[1]-b[1]).slice(0,8).map(([key])=>names.get(key));
}
function dishNameButtons(titles,onSelect,showCaption=true){
  if(!titles.length)return [];
  const caption=document.createElement('p');
  caption.className='muted';
  caption.textContent='料理候補';
  const buttons=titles.map(title=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=title;
    button.onclick=()=>onSelect(title);
    return button;
  });
  return showCaption?[caption,...buttons]:buttons;
}
function dishFoodChoices(value){
  const dish=dishKey(value);
  if(!dish||masterStatus!=='ready')return [];
  const foods=new Map();
  for(const meal of [...(state.meals||[])].reverse()){
    for(const item of meal.ingredients??[meal]){
      if(typeof item.dish!=='string' || dishKey(item.dish)!==dish)continue;
      const food=foodFromId(item.masterId);
      if(food)foods.set(foodId(food),food);
    }
    if(foods.size>=8)break;
  }
  for(const name of dishIngredients.get(dish)??[]){
    const matches=foodMaster.filter(food=>recipeFoodMatches(food,name));
    if(matches.length===1)foods.set(foodId(matches[0]),matches[0]);
  }
  return [...foods.values()].slice(0,8).map(food=>{
    const recipeLabel=[...recipeFoodNames.keys()].find(name=>recipeFoodMatches(food,name));
    return {food,label:foodLabel(food.name,value,recipeLabel)};
  });
}
function dishDraftFoods(value,choices){
  const key=dishKey(value);
  for(const meal of [...(state.meals??[])].reverse()){
    const saved=new Set((meal.ingredients??[meal])
      .filter(item=>typeof item.dish==='string' && dishKey(item.dish)===key)
      .map(item=>item.masterId));
    const recent=choices.filter(({food})=>saved.has(foodId(food)));
    if(!recent.length)continue;
    // Older pasta drafts only offered dry noodles. Use the expanded template for those records.
    if(!meal.recipeReviewed && pastaDishes.includes(key) && recent.every(({food})=>food.name===dryPasta))break;
    return recent;
  }
  const optional=dishOptionalIngredients.get(key)??[];
  const registered=dishIngredients.get(key)??[];
  return choices.filter(({food})=>registered.some(ingredient=>recipeFoodMatches(food,ingredient))
    && !optional.some(ingredient=>recipeFoodMatches(food,ingredient)));
}
function renderDishSuggestions(){
  const dishInput=$('#mealForm').elements.dish;
  const dish=dishKey(dishInput.value);
  const names=$('#dishNameSuggestions');
  const titles=findDishNames(dishInput.value);
  names.hidden=!titles.length;
  names.replaceChildren(...dishNameButtons(titles,title=>{
    $('#dishChoice').value='custom';
    $('#customDish').hidden=false;
    dishInput.value=title;
    renderDishSuggestions();
    ($('#dishSuggestions button')||dishInput).focus();
  }));
  const box=$('#dishSuggestions');
  const foods=dishFoodChoices(dishInput.value);
  box.hidden=!dish || masterStatus!=='ready' || (!foods.length && titles.length>0);
  if(box.hidden){box.replaceChildren();return}
  const caption=document.createElement('p');
  caption.className='muted';
  caption.textContent=foods.length?'食材候補（食べたものだけ選択）':'この料理の候補はありません。下の欄から食材を探せます。';
  const buttons=foods.map(({food,label})=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=label;
    button.onclick=()=>{if(selectFood(food,label))$('#quickGrams').focus();};
    return button;
  });
  box.replaceChildren(caption,...buttons);
  if((dish==='スパゲティ'||pastaDishes.includes(dish)) && foods.some(({food})=>food.name===dryPasta)){
    const note=document.createElement('p');
    note.className='muted';
    note.textContent='乾麺はゆでる前の量を入力します。わからないときは「量がわからない」で記録できます。';
    box.append(note);
  }
}
document.addEventListener('input',e=>{
  const f=$('#mealForm');if(!f)return;
  if(e.target===f.elements.date && e.target.value){
    recordDate=e.target.value;
    $('#measurementForm').elements.date.value=recordDate;
  }
  if(e.target.id==='foodSearch')searchFoods();
  if(e.target===f.elements.dish)renderDishSuggestions();
  if(e.target.id==='quickGrams'){
    const custom=e.target.value==='custom';
    $('#exactGrams').hidden=!custom;
    f.elements.grams.value=custom?'':e.target.value;
    if(custom) f.elements.grams.focus();
  }
  if(e.target===f.elements.food && f.dataset.masterName!==e.target.value){
    delete f.dataset.masterId;delete f.dataset.masterName;delete f.dataset.foodLabel;
    showMasterStatus();
  }
  if(f.contains(e.target)) updatePoints();
});
function selectFood(candidate, explicitLabel){
  const f=$('#mealForm'),name=typeof candidate==='string'?candidate:candidate.name;
  const matches=typeof candidate==='string'?foodMaster.filter(x=>x.name===name):[candidate];
  const x=matches.length===1?matches[0]:null;
  const previousName=f.elements.food.value.trim();
  const previousMaster=f.dataset.masterId;
  const label=foodLabel(name,f.elements.dish.value,explicitLabel);
  const differentFood=previousName!==name || (previousMaster && x && previousMaster!==foodId(x))
    || Boolean(f.dataset.foodLabel && label!==name && f.dataset.foodLabel!==label);
  if(previousName && differentFood){
    if(!f.reportValidity())return false;
    addCurrentIngredient(f);
  } else if(previousMaster && (!x || previousMaster===foodId(x))) {
    if(x && label!==name){
      f.dataset.foodLabel=label;
      $('#selectedFood').textContent=foodDescription(x,label);
    }
    $('#foodSearch').value=f.dataset.foodLabel??previousName;
    $('#foodResults').replaceChildren();
    return true;
  }
  f.elements.food.value=name;
  f.elements.group.value=x?.group||'';
  f.elements.points.value='';
  delete f.dataset.foodLabel;
  if(x){
    f.dataset.masterName=name;
    f.dataset.masterId=foodId(x);
    if(label!==name)f.dataset.foodLabel=label;
    $('#selectedFood').textContent=foodDescription(x,label);
  }
  else {
    delete f.dataset.masterName;delete f.dataset.masterId;
    $('#manualFood').open=true;
    $('#selectedFood').textContent=matches.length>1?'同じ名前の食品が複数あります。検索結果から分類を選んでください。':'自由入力の食品です。';
  }
  $('#foodSearch').value=label;
  $('#foodResults').replaceChildren();
  updatePoints();
  return true;
}
document.addEventListener('change',e=>{
  if(e.target.id!=='dishChoice')return;
  const form=e.target.form, field=form.elements.dish;
  const previous=field.value;
  const custom=e.target.value==='custom';
  const next=custom?'':e.target.value.replace(/^name:/,'');
  const inputBox=$('#customDish');
  if(form.elements.food.value.trim() && (custom || next!==previous)){
    if(!form.reportValidity()){
      e.target.value=inputBox.hidden?(previous?'name:'+previous:''):'custom';
      return;
    }
    addCurrentIngredient(form);
  }
  field.value=next;
  inputBox.hidden=!custom;
  renderDishSuggestions();
  if(custom)field.focus();
});
function renderFoodShortcuts(){
  const seen=new Set(),recent=[];
  for(const entry of [...(state.meals||[])].reverse().flatMap(meal=>meal.ingredients || [meal])){
    if(!entry.food)continue;
    const label=foodLabel(entry.food,entry.dish,entry.foodLabel);
    const key=JSON.stringify([entry.masterId,label]);
    if(seen.has(key))continue;
    seen.add(key);recent.push({name:entry.food,label,master:foodFromId(entry.masterId)});
    if(recent.length===5)break;
  }
  const saved=(state.savedFoods||[]).map(name=>({name,master:null}));
  $('#foodShortcuts').hidden=!(recent.length||saved.length);
  for(const [selector,label,items] of [['#recentFoods','最近使った食品',recent],['#savedFoods','登録済み食品',saved]]){
    const box=$(selector);box.replaceChildren();
    if(!items.length)continue;
    const title=document.createElement('p');title.className='muted';title.textContent=label;box.append(title);
    for(const item of items){
      const b=document.createElement('button');b.type='button';
      b.textContent=item.master?`${item.label}（${item.master.category}）`:item.name;
      b.onclick=()=>selectFood(item.master||item.name,item.label);
      box.append(b);
    }
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
  const hasIngredient=Boolean(f.elements.food.value.trim());
  $('#ingredientEditor').hidden=!hasIngredient;
  f.elements.grams.disabled=!hasIngredient;
  $('#pointPreview').textContent=x
    ? grams>0?`${x.group}：${foodPoints(grams,x.gramsPerPoint).toFixed(2)}点`:`${x.group}：○（量不明）`
    : '';
}

function readIngredient(form){
  const {food, dish, amount, grams, group, points}=form.elements;
  const name=food.value.trim();
  if(!name)return null;
  const master=foodFromId(form.dataset.masterId);
  const weight=grams.value?Number(grams.value):null;
  const manual=points.value===''?null:Number(points.value);
  return {food:name,dish:dish.value.trim(),amount:amount.value.trim(),grams:weight,
    ...(form.dataset.foodLabel?{foodLabel:form.dataset.foodLabel}:{}),
    masterId:master?foodId(master):null,category:master?.category||null,group:group.value||master?.group||null,
    points:manual ?? (master&&weight?foodPoints(weight,master.gramsPerPoint):null),
    pointSource:manual!=null?'user':(master&&weight?'master':null)};
}
function ingredientAmount(item){
  return item.grams!=null?item.grams+'g':item.amount||(item.group&&item.points==null?'量不明':'');
}
function renderIngredients(){
  const count=$('#ingredientCount');
  count.hidden=!ingredients.length;
  count.textContent='追加した食材 '+ingredients.length+'品';
  $('#ingredientList').innerHTML=ingredients.map((item,index)=>
    `<li><span>${[item.dish,foodLabel(item.food,item.dish,item.foodLabel),ingredientAmount(item),item.group,item.points==null?'':formatPoints(item.points)].filter(Boolean).map(esc).join(' / ')}</span>
    <button type="button" class="small-button" data-remove-ingredient="${index}" aria-label="${esc(foodLabel(item.food,item.dish,item.foodLabel))}を削除">削除</button></li>`).join('');
}
function clearIngredient(form){
  for(const name of ['food','amount','grams','group','points'])form.elements[name].value='';
  delete form.dataset.masterId;delete form.dataset.masterName;delete form.dataset.foodLabel;
  $('#exactGrams').hidden=true;
  $('#quickGrams').value='';
  $('#foodSearch').value='';
  $('#foodResults').replaceChildren();
  showMasterStatus();
  updatePoints();
}
function addCurrentIngredient(form){
  const item=readIngredient(form);
  if(!item){
    $('#mealFeedback').textContent='食材を選ぶか、食材名を手入力してください。';
    return false;
  }
  ingredients.push(item);
  renderIngredients();
  clearIngredient(form);
  $('#mealFeedback').textContent=foodLabel(item.food,item.dish,item.foodLabel)+'を追加しました。';
  return true;
}

function formIngredients(form){
  const pending=readIngredient(form);
  return pending?[...ingredients,pending]:[...ingredients];
}
function sumPoints(items){
  const scores=items.map(item=>item.points).filter(Number.isFinite);
  return scores.length?Math.round(scores.reduce((a,b)=>a+b,0)*100)/100:null;
}
function scoreCells(items){
  return groups.map(group=>formatPoints(sumPoints(items.filter(item=>item.group===group))));
}
function sheetRow(label, values, className=''){
  return `<tr class="${className}"><th scope="row">${esc(label)}</th>${values.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`;
}
function mealItems(entry){
  return entry.ingredients ?? (entry.food || entry.points!=null || entry.group?[entry]:[]);
}
function sheetMeal(entries, type, editing){
  const html=entries.map(entry=>{
    let previousDish='';
    const rows=mealItems(entry).map(item=>{
      const heading=item.dish && item.dish!==previousDish?`<tr class="sheet-dish"><td colspan="5">${esc(item.dish)}</td></tr>`:'';
      previousDish=item.dish;
      const classified=groups.includes(item.group);
      const label=[foodLabel(item.food,item.dish,item.foodLabel),ingredientAmount(item),!classified&&item.points!=null?formatPoints(item.points):''].filter(Boolean).join(' ');
      return heading+sheetRow(label,groups.map(group=>group===item.group?(item.points==null?'○':formatPoints(item.points)):''),item.dish?'sheet-ingredient':'');
    }).join('');
    return `${entry.time?`<tr><td colspan="5"><time>${esc(entry.time)}</time></td></tr>`:''}
      ${entry.photoId?`<tr><td colspan="5" data-photo-id="${esc(entry.photoId)}"></td></tr>`:''}
      ${entry.previewPhoto?`<tr><td colspan="5"><img class="photo" src="${esc(entry.previewPhoto)}" alt="${esc(type)}の写真"></td></tr>`:''}
      ${rows}${entry.memo?`<tr class="sheet-note"><td colspan="5">${esc(entry.memo)}</td></tr>`:''}`;
  }).join('');
  const items=entries.flatMap(mealItems);
  return `<tbody><tr class="sheet-band"><th colspan="5" scope="rowgroup">${type}</th></tr>
    ${html || '<tr><td colspan="5">記録なし</td></tr>'}
    ${editing?`<tr><td colspan="5"><button type="button" class="small-button" data-sheet-meal="${type}">${type}に食材を追加</button></td></tr>`:''}
    ${sheetRow('小計 '+formatPoints(sumPoints(items)),scoreCells(items),'sheet-subtotal')}</tbody>`;
}
function makeMealEntry({date,type,time='',memo='',photoId=null,items}){
  const single=items.length===1?items[0]:null;
  return {id:crypto.randomUUID(),date,type,time,memo,photoId,
    food:single?.food || [...new Set(items.map(item=>item.dish||item.food))].join('、').slice(0,120),
    amount:single?.amount||'',grams:single?.grams??null,masterId:single?.masterId??null,
    category:single?.category??null,group:single?.group??null,points:sumPoints(items),
    pointSource:single?.pointSource??null,ingredients:items,createdAt:new Date().toISOString()};
}
function mountSheetEntry(dialog, target, date, opener){
  const previous=dialog.querySelector('#sheetEntryForm');
  if(previous){previous.querySelector('[name=food]').focus();return}
  const type=target.dataset.sheetMeal;
  const form=document.createElement('form');
  form.id='sheetEntryForm';
  const amountOptions=`<option value="">量がわからない</option>
    ${quickGrams.map(g=>`<option value="${g}">${g}g</option>`).join('')}
    <option value="custom">グラムを入力する</option>`;
  form.innerHTML=`
    <label>食材・料理名<input name="food" type="search" maxlength="120" autocomplete="off" placeholder="例：ご飯、味噌汁" required></label>
    <section data-sheet-recipe hidden>
      <p><strong data-sheet-recipe-name></strong></p>
      <p data-sheet-recipe-hint class="muted">食べていない食材は外し、分かる量だけ入れてください。</p>
      <div data-sheet-recipe-items></div>
    </section>
    <div class="food-shortcuts" data-sheet-results aria-live="polite"></div>
    <details data-sheet-dish-list class="meal-options">
      <summary>登録済みの料理から選ぶ</summary>
      <div class="food-shortcuts" data-sheet-dish-buttons></div>
    </details>
    <details data-sheet-catalog class="meal-options"></details>
    <div data-sheet-amount hidden>
      <label>食べた量<select name="quickAmount">${amountOptions}</select></label>
      <div data-sheet-custom-grams hidden><label>食べた量（g）<input name="grams" type="number" min="0.1" max="10000" step="0.1" inputmode="decimal"></label></div>
    </div>
    <p data-sheet-points class="muted" aria-live="polite"></p>
    <details class="meal-options" data-sheet-manual><summary>料理名・食品群を手入力（任意）</summary>
      <label>料理名<input name="dish" maxlength="120"></label>
      <label data-sheet-manual-group>食品群<select name="group"><option value="">未確認</option>${groups.map(group=>`<option>${group}</option>`).join('')}</select></label>
    </details>
    <p data-sheet-error class="muted" role="status"></p>
    <button type="submit" class="small-button">保存して追加</button>
    <button type="button" class="small-button" data-sheet-cancel>取り消す</button>`;
  target.hidden=true;
  target.after(form);
  form.elements.food.focus();
  let selection=null;
  let saveAttempt=null;
  let candidates=[];
  let recipeDish='';
  const recipeItems=new Map();
  const gramsValue=()=>Number(form.elements.quickAmount.value==='custom'?form.elements.grams.value:form.elements.quickAmount.value)||null;
  const results=form.querySelector('[data-sheet-results]');
  const error=form.querySelector('[data-sheet-error]');
  const catalog=form.querySelector('[data-sheet-catalog]');
  const dishList=form.querySelector('[data-sheet-dish-list]');
  dishList.querySelector('[data-sheet-dish-buttons]').replaceChildren(...dishNameButtons(
    [...dishIngredients.keys()],title=>{
      dishList.open=false;
      chooseRecipe(title);
    },false));
  const recipe=form.querySelector('[data-sheet-recipe]');
  const recipeList=form.querySelector('[data-sheet-recipe-items]');
  const submit=form.querySelector('[type=submit]');
  const candidateKey=({food,label})=>food.name===dryPasta?JSON.stringify([foodId(food),label]):foodId(food);
  function sheetItem(name,dish,grams,chosen,manualGroup=null){
    const master=chosen?.food;
    const item={food:master?.name??name,dish,grams,group:master?.group||manualGroup,
      masterId:master?foodId(master):null,category:master?.category??null,amount:'',
      points:master&&grams?foodPoints(grams,master.gramsPerPoint):null,
      pointSource:master&&grams?'master':null};
    if(chosen && chosen.label!==master.name)item.foodLabel=chosen.label;
    return item;
  }
  function setRecipeDish(dish,choices){
    const changed=dishKey(dish)!==dishKey(recipeDish);
    recipeDish=dish;
    recipe.hidden=!dish;
    form.querySelector('[data-sheet-manual]').hidden=Boolean(dish);
    submit.textContent=dish?'この料理を保存する':'保存して追加';
    if(changed){
      recipeItems.clear();
      recipeList.replaceChildren();
      if(dish)for(const candidate of dishDraftFoods(dish,choices))addRecipeItem(candidate);
    }
    if(dish)recipe.querySelector('[data-sheet-recipe-name]').textContent=dish+'の下書き';
    recipe.querySelector('[data-sheet-recipe-hint]').hidden=recipeItems.size===0;
  }
  function addRecipeItem(candidate){
    const key=candidateKey(candidate);
    if(recipeItems.has(key))return;
    const row=document.createElement('fieldset');
    row.setAttribute('data-sheet-recipe-item','');
    row.innerHTML=`<legend></legend>
      <label>食べた量<select data-recipe-quantity>${amountOptions}</select></label>
      <label hidden>食べた量（g）<input type="number" min="0.1" max="10000" step="0.1" inputmode="decimal" data-recipe-grams></label>
      <p data-recipe-points aria-live="polite"></p>
      <button type="button" class="small-button">外す</button>`;
    row.querySelector('legend').textContent=candidate.label;
    const quantity=row.querySelector('select');
    const grams=row.querySelector('input');
    const points=row.querySelector('[data-recipe-points]');
    quantity.setAttribute('aria-label',candidate.label+'の食べた量');
    grams.setAttribute('aria-label',candidate.label+'の食べた量（g）');
    const getGrams=()=>Number(quantity.value==='custom'?grams.value:quantity.value)||null;
    const renderPoints=()=>{
      const item=sheetItem(candidate.label,recipeDish,getGrams(),candidate);
      points.textContent=item.group+'：'+(item.points==null?'○':formatPoints(item.points));
    };
    row.addEventListener('input',event=>{
      if(event.target===quantity){
        const custom=quantity.value==='custom';
        grams.parentElement.hidden=!custom;
        if(custom)grams.focus();
        else grams.value='';
      }
      renderPoints();
    });
    const remove=row.querySelector('button');
    remove.setAttribute('aria-label',candidate.label+'を外す');
    remove.onclick=()=>{
      saveAttempt=null;
      error.textContent='';
      recipeItems.delete(key);
      row.remove();
      renderCandidates();
      (results.querySelector('button:not([disabled])')||form.elements.food).focus();
    };
    recipeItems.set(key,{candidate,getGrams});
    recipeList.append(row);
    renderPoints();
    return quantity;
  }
  const updateScore=()=>{
    const grams=gramsValue();
    const group=selection?.food.group||form.elements.group.value;
    const score=!group?'':selection&&grams>0
      ? group+'：'+formatPoints(foodPoints(grams,selection.food.gramsPerPoint)) : group+'：○';
    form.querySelector('[data-sheet-points]').textContent=selection?`${selection.label}｜${score}`:score;
  };
  function setSheetSelection(candidate,showAmount=true){
    selection=candidate;
    form.querySelector('[data-sheet-manual-group]').hidden=Boolean(candidate);
    if(candidate)form.elements.group.value='';
    form.querySelector('[data-sheet-amount]').hidden=Boolean(recipeDish)||!showAmount||!form.elements.food.value.trim();
    form.querySelector('[data-sheet-points]').hidden=Boolean(recipeDish);
    updateScore();
  }
  function chooseSheetFood(candidate){
    saveAttempt=null;
    error.textContent='';
    if(recipeDish){
      const quantity=addRecipeItem(candidate);
      renderCandidates();
      quantity?.focus();
      return;
    }
    if(selection && (selection.food!==candidate.food||selection.label!==candidate.label))resetSheetAmount();
    form.elements.food.value=candidate.label;
    setSheetSelection(candidate);
    results.replaceChildren();
    form.elements.quickAmount.focus();
  }
  mountFoodCatalog(catalog,candidate=>chooseSheetFood(candidate));
  function resetSheetAmount(){
    form.elements.quickAmount.value='';
    form.elements.grams.value='';
    form.querySelector('[data-sheet-custom-grams]').hidden=true;
  }
  form.addEventListener('input',event=>{
    if(catalog.contains(event.target))return;
    saveAttempt=null;
    error.textContent='';
    if(event.target===form.elements.food&&!event.isComposing){
      form.elements.group.value='';
      resetSheetAmount();
      renderCandidates();
    }
    if(event.target===form.elements.quickAmount){
      const custom=event.target.value==='custom';
      form.querySelector('[data-sheet-custom-grams]').hidden=!custom;
      if(custom)form.elements.grams.focus();
      else form.elements.grams.value='';
    }
    updateScore();
  });
  form.elements.food.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing)event.preventDefault();
  });
  form.addEventListener('foodmasterchange',renderCandidates);
  function renderCandidates(){
    const value=form.elements.food.value.trim();
    const matches=findFoods(value);
    const titles=findDishNames(value);
    const exact=dishKey(value)==='スパゲティ'?null:exactFood(value,matches);
    const fromDish=exact?[]:dishFoodChoices(value);
    setRecipeDish(fromDish.length?value:'',fromDish);
    candidates=fromDish.length?fromDish:matches;
    setSheetSelection(exact,!fromDish.length&&!titles.length);
    const foodButtons=candidates.filter(candidate=>candidate!==exact&&!recipeItems.has(candidateKey(candidate))).map(candidate=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=candidate.label+'｜'+candidate.food.group;
      button.onclick=()=>chooseSheetFood(candidate);
      return button;
    });
    if(foodButtons.length && (fromDish.length||titles.length)){
      const caption=document.createElement('p');
      caption.textContent=fromDish.length?'必要な場合に追加する食材':'食材候補';
      foodButtons.unshift(caption);
    }
    const dishButtons=dishNameButtons(titles,chooseRecipe);
    results.replaceChildren(...dishButtons,...foodButtons);
    if(value&&!candidates.length&&!titles.length){
      results.textContent=masterStatus==='loading'?'食品マスターを読み込み中です。'
        : masterStatus==='failed'?'食品マスターを読み込めませんでした。食材名だけで保存できます。'
        : '一致する料理・食材がありません。名前だけでも保存できます。';
    }
  }
  function chooseRecipe(title){
    form.elements.food.value=title;
    form.elements.food.dispatchEvent(new Event('input',{bubbles:true}));
    (recipeList.querySelector('select')||results.querySelector('button')||form.elements.food).focus();
  }
  form.querySelector('[data-sheet-cancel]').onclick=()=>{
    form.remove();
    target.hidden=false;
    target.focus();
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit.disabled||!form.reportValidity())return;
    if(masterStatus==='loading'){error.textContent='食品マスターの読み込みをお待ちください。';return}
    let items;
    if(recipeDish){
      if(!recipeItems.size){error.textContent='食べた食材を選んでください。';return}
      items=[...recipeItems.values()].map(({candidate,getGrams})=>
        sheetItem(candidate.label,recipeDish,getGrams(),candidate));
    }else{
      const name=form.elements.food.value.trim();
      if(!name){error.textContent='食材名を入力してください。';return}
      if(!selection && candidates.length && !form.elements.group.value){
        error.textContent='食材候補から選んでください。';return;
      }
      items=[sheetItem(name,form.elements.dish.value.trim(),gramsValue(),selection,form.elements.group.value||null)];
    }
    const entry=saveAttempt??={
      ...makeMealEntry({date,type,items}),
      ...(recipeDish?{recipeReviewed:true}:{})
    };
    const next=copy();
    next.meals=[...(next.meals||[]),entry];
    submit.disabled=true;
    form.inert=true;
    try{
      let reopen=false;
      await persist(next,{meals:arrayUnion(entry)},()=>{reopen=dialog.open;});
      if(reopen && opener.isConnected){
        showDayPreview(date,opener,null,type);
      }
    }catch{
      error.textContent='保存できませんでした。入力した内容を確認して、もう一度保存してください。';
      submit.disabled=false;
      form.inert=false;
    }
  });
}
function previewDraft(form, opener){
  if(!form.reportValidity())return;
  const ingredients=formIngredients(form);
  const memo=form.elements.memo.value.trim();
  const file=form.elements.photo.files[0];
  if (file && !validPhoto(file)) {
    $('#mealFeedback').textContent='15MB以下の画像を選んでください。';
    return;
  }
  const previewPhoto=file?URL.createObjectURL(file):null;
  const draft=ingredients.length || memo || previewPhoto
    ? {type:mealType,ingredients,memo,time:form.elements.time.value,previewPhoto}
    : null;
  showDayPreview(form.elements.date.value,opener,draft);
}
function showDayPreview(date, opener, draft = null, editing = false){
  const urls=draft?.previewPhoto?[draft.previewPhoto]:[];
  const entries=(state.meals||[]).filter(entry=>entry.date===date);
  if(draft)entries.push(draft);
  const items=entries.flatMap(mealItems);
  const m=state.measurements?.[date]||{};
  const stats=[['体重',m.weight,'kg'],['腹囲',m.waist,'cm'],['体調',m.condition],['気分',m.mood],['便通',m.bowel],['水分',m.water,'L']].filter(([,value])=>value!=null&&value!=='');
  const dialog=$('#daySheet');
  dialog.innerHTML=`<header><h2 id="daySheetTitle">食事ダイアリー</h2><button type="button" class="small-button" autofocus>閉じる</button></header>
    <div class="sheet-content"><p class="sheet-date">${esc(date)}</p>
    ${stats.length?`<dl>${stats.map(([label,value,unit])=>`<div><dt>${label}</dt><dd>${esc(value)}${unit?' '+unit:''}</dd></div>`).join('')}</dl>`:''}
    <table aria-label="食材と食品群の点数"><colgroup><col class="sheet-item-col"><col span="4"></colgroup>
    <thead><tr><th scope="col">メニュー・食材</th>${groups.map(group=>`<th scope="col">${group}</th>`).join('')}</tr></thead>
    ${meals.filter((type,index)=>index<4||entries.some(entry=>entry.type===type)).map(type=>sheetMeal(entries.filter(entry=>entry.type===type),type,editing)).join('')}
    <tfoot>${sheetRow('1日の合計 '+formatPoints(sumPoints(items)),scoreCells(items))}</tfoot></table>
    <p class="muted">1点＝${PROGRAM.kcalPerPoint}kcal。○は食品群の記録です。点数が確認できた分を集計しています。</p>
    ${m.memo?`<p class="sheet-note"><strong>今日のひと言</strong><br>${esc(m.memo)}</p>`:''}</div>`;
  dialog.querySelector('button').onclick=()=>dialog.close();
  for(const target of dialog.querySelectorAll('[data-sheet-meal]')){
    target.onclick=()=>mountSheetEntry(dialog,target,date,opener);
  }
  dialog.addEventListener('close',()=>{
    for(const url of urls)URL.revokeObjectURL(url);
    dialog.replaceChildren();
    if(opener.isConnected)opener.focus();
  },{once:true});
  dialog.showModal();
  if(typeof editing==='string')dialog.querySelector(`[data-sheet-meal="${editing}"]`)?.focus();
  loadVisiblePhotos(dialog,urls);
}
const validPhoto = file => file.type.startsWith('image/') && file.size<=15*1024*1024;

document.addEventListener('click',e=>{
  const form=$('#mealForm');
  if(e.target.id==='addIngredient'){
    if(!form.reportValidity())return;
    if(addCurrentIngredient(form))$('#foodSearch').focus();
  }
  if(e.target.id==='clearSelectedFood'){
    clearIngredient(form);
    $('#mealFeedback').textContent='食材の選択を取り消しました。';
    $('#foodSearch').focus();
  }
  const remove=e.target.closest('[data-remove-ingredient]');
  if(remove){
    ingredients.splice(Number(remove.dataset.removeIngredient),1);
    renderIngredients();
    $('#mealFeedback').textContent='食材を削除しました。';
    $('#foodSearch').focus();
  }
  if(e.target.id==='dayPreview')previewDraft(form,e.target);
  if(e.target.id==='editDaySheet' && form.elements.date.reportValidity()){
    showDayPreview(form.elements.date.value,e.target,null,true);
  }
  const saved=e.target.closest('[data-saved-diary]');
  if(saved)showDayPreview(saved.dataset.savedDiary,saved);
});
document.addEventListener('submit',async e=>{
  if(!['mealForm','measurementForm','questionForm','weeklyQuestionForm','reflectionForm','goalForm'].includes(e.target.id))return;
  e.preventDefault();const f=e.target,next=copy(),w=week();
  const button=f.querySelector('button[type=submit]');
  if(button.disabled||!f.reportValidity())return;
  button.disabled=true;message('保存中…');
  let photoId=null, writePatch=null;
  try{
    if(f.id==='mealForm'){
      const file=f.elements.photo.files[0], memo=f.elements.memo.value.trim(), items=formIngredients(f);
      const query=$('#foodSearch').value.trim(), selected=f.elements.food.value.trim();
      if(query && (!selected || (f.dataset.masterId && query!==selected && query!==f.dataset.foodLabel)))throw new Error('検索結果から食材を選んでください。');
      if(!file&&!items.length&&!memo)throw new Error('写真、食材、メモのいずれかを入力してください。');
      if(file && !validPhoto(file))throw new Error('15MB以下の画像を選んでください。');
      const account=user;
      photoId=file?crypto.randomUUID():null;
      const entry=makeMealEntry({date:f.elements.date.value,type:mealType,time:f.elements.time.value,memo,photoId,items});
      f.inert=true;
      if(file)await writePhoto(photoId,file);
      if(user!==account)throw new Error('ログインし直してください。');
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
    await persist(next,writePatch,f.id==='mealForm'?()=>{
      photoId=null;
      ingredients=[];
      f.remove();
    }:undefined);
  }catch(err){if(photoId)await writePhoto(photoId,null).catch(()=>{});message(err.message?.includes('ください')||err.message?.includes('同じ')?err.message:'保存できませんでした。通信と権限を確認してください。',true)}
  finally{button.disabled=false;f.inert=false}
});
