'use strict';
// Read-only, unapproved book-to-food mappings. Existing point calculations use only food-master.json.
const $n = id => document.getElementById(id);
const clean = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja')
  .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60))
  .replace(/[\s・･]/g, '');
const textNode = (tag, cls, value) => {
  const e = document.createElement(tag);
  if(cls) e.className=cls;
  if(value!==undefined) e.textContent=String(value);
  return e;
};
const humanFoodName = food => {
  if(food.category==='肉類・鶏肉（若鶏）・鶏の副生物'){
    if(food.name==='皮・むね')return '鶏皮（むね部分・皮のみ）';
    if(food.name==='皮・もも')return '鶏皮（もも部分・皮のみ）';
    if(food.name==='むね・皮つき')return '鶏むね肉（皮つき）';
  }
  return food.name;
};
const shown = (value,unit='') => value===null||value===undefined||value==='' ? '記載なし' : String(value)+unit;
const calcPoints = (grams, gramsPerPoint) => {
  if(!Number.isFinite(grams)||grams<=0||grams>10000||!Number.isFinite(gramsPerPoint)||gramsPerPoint<=0)return null;
  return {points:grams/gramsPerPoint,kcal:grams/gramsPerPoint*80};
};
let nutrientRows=[], masterFoods=[], linkedByFood=new Map(), matched=[], cursor=0;
let activeFoodIndex=null, ready=false, loadFailed=false, pendingFoodIndex=null;
const chunk=12;
function switchPane(pane){
  const isFood=pane==='food';
  $n('foodModePane').hidden=!isFood;
  $n('nutrientModePane').hidden=isFood;
  $n('foodModeTab').setAttribute('aria-selected',String(isFood));
  $n('nutrientModeTab').setAttribute('aria-selected',String(!isFood));
}

const symptomGuide=[
 {id:'fatigue',label:'疲れやすい・だるい',nutrients:['鉄','ビタミンB12','葉酸'],detail:'鉄・ビタミンB12・葉酸の不足に伴う貧血では、疲労感やだるさが現れることがあります。',caution:'睡眠不足、感染症、甲状腺など、栄養素不足以外の原因も考えられます。',references:[['NIH・鉄欠乏性貧血','https://www.nhlbi.nih.gov/health/anemia/iron-deficiency-anemia'],['NHS・ビタミンB12・葉酸欠乏性貧血','https://www.nhs.uk/conditions/vitamin-b12-or-folate-deficiency-anaemia/symptoms/']]},
 {id:'numbness',label:'手足がしびれる',nutrients:['ビタミンB1','ビタミンB12'],detail:'ビタミンB1やビタミンB12の欠乏は末梢神経の障害に関係することがあります。',caution:'突然の片側のしびれ、麻痺、言葉が出にくいなどの症状があれば、食品検索ではなく救急医療を優先してください。',references:[['NIH・ビタミンB1','https://ods.od.nih.gov/factsheets/Thiamin-HealthProfessional/'],['NIH・ビタミンB12','https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/']]},
 {id:'mouth',label:'口角が切れる・口の中が荒れる',nutrients:['ビタミンB2','ビタミンB6'],detail:'ビタミンB2やビタミンB6が不足すると、口角炎や口内の炎症が現れることがあります。',caution:'感染、乾燥、歯科的な問題などでも同じ症状が起こります。',references:[['NIH・ビタミンB2','https://ods.od.nih.gov/factsheets/Riboflavin-HealthProfessional/']]},
 {id:'taste',label:'味を感じにくい',nutrients:['亜鉛'],detail:'亜鉛不足は味覚・嗅覚の異常に関係することがあります。',caution:'急な味覚変化や長引く症状は、感染症、服薬など他の原因も考えられるため医療機関で確認してください。',references:[['NIH・亜鉛','https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/']]},
 {id:'nightvision',label:'暗いところで物が見えにくい',nutrients:['ビタミンA（レチノール当量）'],detail:'ビタミンA欠乏では、暗い場所で見えにくくなる夜盲が起こることがあります。',caution:'目の病気などでも起こるため、視力の変化があれば眼科で確認してください。',references:[['NIH・ビタミンA','https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/']]},
 {id:'gums',label:'歯ぐきから出血しやすい',nutrients:['ビタミンC'],detail:'ビタミンCが著しく不足した場合、歯ぐきの出血などが起こることがあります。',caution:'歯周病など、栄養素不足以外の原因も一般的です。出血が続くときは歯科・医療機関へ相談してください。',references:[['NIH・ビタミンC','https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/']]},
 {id:'wounds',label:'傷が治りにくい',nutrients:['亜鉛','ビタミンC'],detail:'亜鉛やビタミンCの不足は、創傷の治癒が遅くなることに関係します。',caution:'傷の感染や糖尿病などでも治りにくくなります。赤みや腫れ、発熱、治らない傷は受診してください。',references:[['NIH・亜鉛','https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/'],['NIH・ビタミンC','https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/']]},
 {id:'bones',label:'骨が痛む・筋力が低下している',nutrients:['ビタミンD'],detail:'ビタミンDの重度の不足では骨軟化症による骨の痛みや筋力低下が起こることがあります。',caution:'骨・筋肉の症状には栄養以外の原因もあり、痛みが続く場合は医療機関に相談してください。',references:[['NIH・ビタミンD','https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/']]},
 {id:'breath',label:'少し動くと息切れする',nutrients:['鉄','ビタミンB12','葉酸'],detail:'鉄・ビタミンB12・葉酸の不足による貧血は、動いた際の息切れに関係することがあります。',caution:'息切れには心臓や肺などの病気もあります。急な息苦しさ、胸痛、強い息切れは速やかに救急医療を受けてください。',references:[['NIH・鉄欠乏性貧血','https://www.nhlbi.nih.gov/health/anemia/iron-deficiency-anemia'],['NHS・ビタミンB12・葉酸欠乏性貧血','https://www.nhs.uk/conditions/vitamin-b12-or-folate-deficiency-anaemia/symptoms/']]}
];
function renderSymptomInfo(){
 const data=symptomGuide.find(item=>item.id===$n('symptomSelect').value);
 const box=$n('symptomInfo');
 box.hidden=!data;
 $n('symptomNutrients').replaceChildren();
 $n('symptomSources').replaceChildren();
 if(!data)return;
 $n('symptomExplanation').textContent=data.detail;
 $n('symptomCaution').textContent=data.caution;
 for(const nutrient of data.nutrients){
  const btn=textNode('button','',nutrient);
  btn.type='button';
  btn.setAttribute('aria-pressed',String($n('nutrientSelect').value===nutrient));
  btn.addEventListener('click',()=>{
   if(!ready){$n('nutrientStatus').textContent='栄養素データを読み込んでいます。';return;}
   chooseSymptomNutrient(nutrient);
   $n('nutrientResults').scrollIntoView({block:'start'});
  });
  $n('symptomNutrients').append(btn);
 }
 const label=textNode('span','','参考資料：');
 $n('symptomSources').append(label);
 for(const [name,url] of data.references){
  const a=textNode('a','',name);
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  a.style.marginRight='12px';
  $n('symptomSources').append(a);
 }
}
function chooseSymptomNutrient(nutrient){
 if(!ready)return;
 const active=symptomGuide.find(item=>item.id===$n('symptomSelect').value);
 if(!active||!active.nutrients.includes(nutrient))return;
 activeFoodIndex=null;
 $n('nutrientFocus').hidden=true;
 $n('nutrientKeyword').value='';
 $n('nutrientSelect').value=nutrient;
 $n('nutrientSort').value='source';
 selectRows();
 renderSymptomInfo();
}
function changeSymptom(){
 const active=symptomGuide.find(item=>item.id===$n('symptomSelect').value);
 if(!active){
  $n('nutrientSelect').value='';
  activeFoodIndex=null;$n('nutrientFocus').hidden=true;
  selectRows();renderSymptomInfo();return;
 }
 if(ready)chooseSymptomNutrient(active.nutrients[0]);
 else renderSymptomInfo();
}
function updateSymptomOnManualNutrientChange(){
 const active=symptomGuide.find(item=>item.id===$n('symptomSelect').value);
 if(active&&!active.nutrients.includes($n('nutrientSelect').value))$n('symptomSelect').value='';
 renderSymptomInfo();
}

function note(parent,title,value){
  const e=textNode('div','nutrient-fact');
  e.append(textNode('span','',title),textNode('strong','',value));
  parent.append(e);
}
function makeLinkButton(label,handler){
  const b=textNode('button','nutrient-action',label);
  b.type='button';b.addEventListener('click',handler);return b;
}
function sourcePointCalc(food){
  const details=textNode('details','nutrient-point-details');
  details.append(textNode('summary','','食品マスター基準で点数計算'));
  const p=textNode('p','food-search-help','この計算は現行686品目マスターの1点重量を使用します。書籍の栄養素の対応付けとは独立しています。');
  const lbl=textNode('label','','食べた量（g）');
  const input=textNode('input','nutrient-grams');input.type='number';input.inputMode='decimal';input.min='0.1';input.max='10000';input.step='0.1';input.value=String(food.gramsPerPoint);
  const out=textNode('p','food-result-output');
  const update=()=>{
    if(input.value===''){out.textContent='重量を入力してください。';return;}
    const value=calcPoints(Number(input.value),Number(food.gramsPerPoint));
    out.textContent=value ? value.points.toFixed(2)+'点 ／ 約'+Math.round(value.kcal)+'kcal' : '0より大きく、10000g以下の重量を入力してください。';
  };
  lbl.append(input);input.addEventListener('input',update);
  details.append(p,lbl,out);update();
  return details;
}
function openFoodSearch(query){
  $n('keyword').value=query;
  $n('group').value='';
  $n('keyword').dispatchEvent(new Event('input',{bubbles:true}));
  switchPane('food');
  $n('keyword').scrollIntoView({block:'center'});
}
function cardForRow(row){
  const card=textNode('article','card nutrient-result');
  const top=textNode('div','nutrient-card-heading');
  top.append(textNode('h2','',row.f),textNode('span','nutrient-pill',row.n));
  card.append(top,textNode('p','food-result-meta','書籍 '+row.p+'ページ・掲載順位 '+row.rk+'・'+row.id));
  const facts=textNode('div','nutrient-facts');
  note(facts,'書籍の100gあたり',shown(row.a,row.u));
  if(row.t==='比較'){
    note(facts,'調理法',shown(row.m));
    note(facts,'原料100gの調理後重量',shown(row.cw,'g'));
    note(facts,'調理後の掲載値',shown(row.cv,row.u));
  }else{
    note(facts,'書籍の1点重量',shown(row.w,'g'));
    note(facts,'書籍の1点掲載値',shown(row.b,row.u));
  }
  card.append(facts);
  if(row.num)card.append(textNode('p','nutrient-warning','注意：書籍の1点掲載値と単純換算値に差異があります。原因未確定です。'));
  if(row.trace)card.append(textNode('p','nutrient-warning','注意：「微量」の表記を0として計算しません。'));
  if(row.mi===null){
    card.append(textNode('p','nutrient-warning','食品マスターの対応先は未確定。書籍に載っていない栄養素もゼロとは扱いません。'));
    card.append(makeLinkButton('686品目マスターで名前を探す',()=>openFoodSearch(row.f.replace(/・(?:生|乾|ゆで|水煮)$/,''))));
  }else{
    const food=masterFoods[row.mi];
    card.append(textNode('p','nutrient-unapproved','食品マスター候補（未承認）：'+humanFoodName(food)+' ／ '+food.group+' ／ 1点 '+food.gramsPerPoint+'g'));
    card.append(sourcePointCalc(food));
    card.append(makeLinkButton('食品マスターの登録を検索',()=>openFoodSearch(food.name)));
  }
  return card;
}
function pageRender(){
  const results=$n('nutrientResults');
  const total=matched.length,start=cursor*chunk;
  results.replaceChildren();
  if(!total)results.append(textNode('div','card nutrient-empty','該当する掲載データがありません。条件を変えてください。'));
  else results.append(...matched.slice(start,start+chunk).map(cardForRow));
  $n('nutrientPage').hidden=total<=chunk;
  $n('nutrientPrev').disabled=cursor===0;
  $n('nutrientNext').disabled=start+chunk>=total;
  $n('nutrientPageText').textContent=(cursor+1)+' / '+Math.max(1,Math.ceil(total/chunk))+'ページ';
}
function selectRows(){
  if(!ready){$n('nutrientStatus').textContent=loadFailed?'栄養素データを読み込めませんでした。食品・点数計算は引き続き使用できます。':'栄養素データを読み込んでいます。';return;}
  const nutrient=$n('nutrientSelect').value,query=clean($n('nutrientKeyword').value),sort=$n('nutrientSort').value;
  const hasInput=nutrient!==''||query!==''||activeFoodIndex!==null;
  matched=hasInput?nutrientRows.filter(r=>
    (!nutrient||r.n===nutrient)&&(!query||clean(r.f).includes(query))&&(activeFoodIndex===null||r.mi===activeFoodIndex)
  ):[];
  let sortNote='';
  if((sort==='per100'||sort==='perpoint')&&!nutrient){
    sortNote='含有量順は栄養素を1種類選んだ場合だけ有効です。単位の異なる栄養素を比較しません。';
  }else if(sort==='per100'||sort==='perpoint'){
    const key=sort==='per100'?'a':'b';
    matched.sort((a,b)=>{
      const aa=typeof a[key]==='number'?a[key]:-Infinity;
      const bb=typeof b[key]==='number'?b[key]:-Infinity;
      return bb-aa||a.p-b.p||a.rk-b.rk;
    });
  }else if(sort==='name'){
    matched.sort((a,b)=>a.f.localeCompare(b.f,'ja')||a.p-b.p||a.rk-b.rk);
  }
  cursor=0;
  const focus=activeFoodIndex===null?'':'「'+humanFoodName(masterFoods[activeFoodIndex])+'」の未承認候補：';
  $n('nutrientStatus').textContent=!hasInput?'栄養素を選ぶか食品名を入力してください（27種類・2,265行収録）。':focus+matched.length+'行見つかりました。数値は書籍掲載値、食品マスターとの対応候補は未承認です。'+sortNote;
  pageRender();
}
function clearFocus(){
  activeFoodIndex=null; $n('nutrientFocus').hidden=true;
  selectRows();
}
function showFoodNutrients(index){
  if(!Number.isInteger(index)||index<0||index>=masterFoods.length)return;
  $n('symptomSelect').value='';
  renderSymptomInfo();
  activeFoodIndex=index;
  $n('nutrientSelect').value='';
  $n('nutrientKeyword').value='';
  const food=masterFoods[index];
  $n('nutrientFocusTitle').textContent=humanFoodName(food)+' ／ 1点＝'+food.gramsPerPoint+'g';
  $n('nutrientFocusHint').textContent='この食品に対する書籍の栄養素はすべて対応未承認です。掲載のない栄養素は「0」ではありません。';
  $n('nutrientFocus').hidden=false;
  switchPane('nutrient');
  selectRows();
  $n('nutrientFocus').scrollIntoView({block:'start'});
}
function start(){
  Promise.all([
    fetch('./food-master.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('food master HTTP '+r.status);return r.json();}),
    fetch('./nutrient-master.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('nutrient master HTTP '+r.status);return r.json();})
  ]).then(([foodData,nutrientData])=>{
    if(!Array.isArray(foodData.foods)||foodData.foods.length!==686)throw Error('invalid food master');
    if(nutrientData.schemaVersion!==1||!Array.isArray(nutrientData.records)||nutrientData.records.length!==2265)throw Error('invalid nutrient master');
    const names=[...new Set(nutrientData.records.map(r=>r.n))];
    if(names.length!==27||!nutrientData.records.every(r=>r.mi===null||Number.isInteger(r.mi)&&r.mi>=0&&r.mi<686))throw Error('invalid nutrient IDs');
    nutrientRows=nutrientData.records;masterFoods=foodData.foods;linkedByFood=new Map();
    nutrientRows.forEach(r=>{if(r.mi!==null){if(!linkedByFood.has(r.mi))linkedByFood.set(r.mi,[]);linkedByFood.get(r.mi).push(r);}});
    const picker=$n('nutrientSelect');
    names.forEach(n=>{const opt=textNode('option','',n);opt.value=n;picker.append(opt);});
    ready=true;
    const requested=symptomGuide.find(item=>item.id===$n('symptomSelect').value);
    if(requested)chooseSymptomNutrient(requested.nutrients[0]);
    else selectRows();
    if(pendingFoodIndex!==null){showFoodNutrients(pendingFoodIndex);pendingFoodIndex=null;}
  }).catch(error=>{
    loadFailed=true;
    console.error('栄養素検索の読み込みに失敗:',error);
    $n('nutrientStatus').textContent='栄養素データの読み込みに失敗しました。食品・点数計算機能は通常どおり利用できます。ページを再読み込みしてください。';
  });
}
for(const item of symptomGuide){
 const option=textNode('option','',item.label);option.value=item.id;$n('symptomSelect').append(option);
}
$n('symptomSelect').addEventListener('change',changeSymptom);
$n('foodModeTab').addEventListener('click',()=>switchPane('food'));
$n('nutrientModeTab').addEventListener('click',()=>{switchPane('nutrient');if(ready)selectRows();});
$n('nutrientSelect').addEventListener('change',()=>{clearFocus();updateSymptomOnManualNutrientChange();});
$n('nutrientSort').addEventListener('change',selectRows);
$n('nutrientKeyword').addEventListener('input',e=>{if(!e.isComposing)clearFocus();});
$n('nutrientKeyword').addEventListener('compositionend',clearFocus);
$n('nutrientClearFocus').addEventListener('click',clearFocus);
$n('nutrientPrev').addEventListener('click',()=>{if(cursor>0){cursor--;pageRender();}});
$n('nutrientNext').addEventListener('click',()=>{if((cursor+1)*chunk<matched.length){cursor++;pageRender();}});
document.addEventListener('smartdiet:showFoodNutrients',event=>{
  const index=event.detail?.masterIndex;
  if(!Number.isInteger(index)||index<0||index>=686)return;
  if(!ready){pendingFoodIndex=index;switchPane('nutrient');return;}
  showFoodNutrients(index);
});
if(new URLSearchParams(window.location.search).get('mode')==='nutrient')switchPane('nutrient');
start();
