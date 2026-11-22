/* EQUINERIS textbook: the original 17 eating-behavior checklist items.
   Item text and h01-h17 IDs are sourced from habit-check.html.
   Both screens share equineris:program:habit-check:v1. */
'use strict';
(()=>{
 const KEY='equineris:program:habit-check:v1';
 const ITEMS=[
 {
  "id": "h01",
  "text": "家族や周りの人が残したものは、もったいないので食べることが多い"
 },
 {
  "id": "h02",
  "text": "おやつ（お菓子）がいつも家においてある"
 },
 {
  "id": "h03",
  "text": "人よりも食べるのが早いと思う"
 },
 {
  "id": "h04",
  "text": "よく噛まずに食べることが多い"
 },
 {
  "id": "h05",
  "text": "お腹が空いたら、あまりがまんせず、何かつまむことが多い"
 },
 {
  "id": "h06",
  "text": "果物をよく食べる"
 },
 {
  "id": "h07",
  "text": "野菜の揚げ物や炒めものが好き（よく食べる）"
 },
 {
  "id": "h08",
  "text": "味の濃いものが好き（よく食べる）"
 },
 {
  "id": "h09",
  "text": "野菜の代わりに市販の野菜ジュースをとることが多い"
 },
 {
  "id": "h10",
  "text": "朝食をとらないことが多い"
 },
 {
  "id": "h11",
  "text": "外食が多い"
 },
 {
  "id": "h12",
  "text": "丼物、ファストフード、ラーメンなどを食べることが多い"
 },
 {
  "id": "h13",
  "text": "間食をする習慣がある、あるいは間食は洋菓子や和菓子が多い"
 },
 {
  "id": "h14",
  "text": "夜9時以降（就寝2時間以内）に夕食（飲食）をとることが多い"
 },
 {
  "id": "h15",
  "text": "ほぼ毎日アルコール飲料を飲む"
 },
 {
  "id": "h16",
  "text": "水やお茶よりも、缶コーヒーや紅茶、ジュース、炭酸飲料などを飲むことが多い"
 },
 {
  "id": "h17",
  "text": "菓子パンが好き（よく食べる）"
 }
];
 const element=(tag,className,text)=>{
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 function mount(container){
  const root=element('section','habit-mini');
  root.id='textbookHabitCheck';
  root.setAttribute('aria-label','17項目の食行動チェック表');
  const guidance=element('p','habit-mini-guide','当てはまる項目に○を付けてください。表の中を縦にスクロールすると17項目すべてを確認できます。');
  const list=element('div','habit-mini-list');
  list.setAttribute('role','group');
  list.setAttribute('aria-label','食行動チェック 17項目');
  list.tabIndex=0;
  const boxes=[];
  for(const item of ITEMS){
   const label=element('label','habit-mini-row');
   const input=element('input','habit-mini-checkbox');
   input.type='checkbox';
   input.dataset.habit=item.id;
   input.setAttribute('aria-label',item.text);
   const mark=element('span','habit-mini-mark');
   mark.setAttribute('aria-hidden','true');
   const text=element('span','habit-mini-text',item.text);
   label.append(input,mark,text);
   list.append(label);
   boxes.push(input);
  }
  const summary=element('p','habit-mini-count','○を付けた項目：0 / 17');
  const saveButton=element('button','habit-mini-save','チェックした内容を保存する');
  saveButton.type='button';
  const status=element('p','habit-mini-status','');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  let blocked=false;
  const report=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
  const selected=()=>boxes.filter(box=>box.checked).map(box=>box.dataset.habit);
  const update=()=>{summary.textContent='○を付けた項目：'+selected().length+' / '+ITEMS.length;};
  const save=()=>{
   update();
   if(blocked){report('保存済みデータを確認できません。既存の記録を上書きしません。',true);return false;}
   try{
    localStorage.setItem(KEY,JSON.stringify(selected()));
    report('チェックした内容を保存しました。');
    return true;
   }catch(e){
    report('チェックを保存できませんでした。ブラウザの保存設定を確認してください。',true);
    return false;
   }
  };
  try{
   const raw=localStorage.getItem(KEY);
   if(raw!==null){
    const saved=JSON.parse(raw);
    if(!Array.isArray(saved))throw Error('Invalid checklist data');
    const existing=new Set(saved.filter(id=>typeof id==='string'&&ITEMS.some(x=>x.id===id)));
    for(const box of boxes)box.checked=existing.has(box.dataset.habit);
    report('保存済みのチェックを読み込みました。');
   }
  }catch(e){
   blocked=true;
   report('保存済みチェックを読み込めません。元の記録は変更していません。',true);
   saveButton.disabled=true;
  }
  update();
  for(const box of boxes)box.addEventListener('change',save);
  saveButton.addEventListener('click',save);
  root.append(guidance,list,summary,saveButton,status);
  container.append(root);
 }
 window.EquinerisHabitCheckCard=Object.freeze({mount,items:ITEMS});
})();