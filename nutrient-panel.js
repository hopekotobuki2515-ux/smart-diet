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
    selectRows();
    if(pendingFoodIndex!==null){showFoodNutrients(pendingFoodIndex);pendingFoodIndex=null;}
  }).catch(error=>{
    loadFailed=true;
    console.error('栄養素検索の読み込みに失敗:',error);
    $n('nutrientStatus').textContent='栄養素データの読み込みに失敗しました。食品・点数計算機能は通常どおり利用できます。ページを再読み込みしてください。';
  });
}
$n('foodModeTab').addEventListener('click',()=>switchPane('food'));
$n('nutrientModeTab').addEventListener('click',()=>{switchPane('nutrient');if(ready)selectRows();});
$n('nutrientSelect').addEventListener('change',()=>{clearFocus();});
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
start();
