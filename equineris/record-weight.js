/* EQUINERIS quick body-weight entry.
   Uses the same date and storage schema as measurements.html.
   Never changes waist or deletes existing records. */
'use strict';
(()=>{
 const KEY='equineris:body-measurements:v1';
 const date=document.getElementById('recordDate');
 const form=document.getElementById('quickWeightForm');
 const input=document.getElementById('quickWeight');
 const saveButton=document.getElementById('quickWeightSave');
 const status=document.getElementById('quickWeightStatus');
 if(!date||!form||!input||!saveButton||!status)return;
 const validDate=s=>{
  if(typeof s!=='string'||!(/^\d{4}-\d{2}-\d{2}$/).test(s))return false;
  const parsed=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===s;
 };
 function readAll(){
  const raw=localStorage.getItem(KEY);
  if(raw===null)return {};
  const data=JSON.parse(raw);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid stored body measurements');
  return data;
 }
 const tell=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
 function refresh(){
  const day=date.value;
  if(!validDate(day)){
   input.value='';input.disabled=true;saveButton.disabled=true;
   tell('体重を保存するには、記録日を選んでください。');
   return;
  }
  input.disabled=false;saveButton.disabled=false;
  try{
   const record=readAll()[day];
   if(record!==undefined&&(!record||typeof record!=='object'||Array.isArray(record)))throw Error('invalid saved day');
   input.value=record&&typeof record.weight==='number'&&Number.isFinite(record.weight)?
    String(record.weight):'';
   tell(input.value?'この日に保存した体重を表示しています。':'この日の体重はまだ登録されていません。');
  }catch(e){
   input.value='';input.disabled=true;saveButton.disabled=true;
   tell('保存済みの体重を読み込めません。既存データは変更せずに確認してください。',true);
  }
 }
 function save(){
  const day=date.value;
  if(!validDate(day)){tell('正しい記録日を選んでください。',true);return false;}
  const raw=input.value.trim();
  if(!raw){tell('体重を入力してください。',true);return false;}
  const number=Number(raw);
  if(!Number.isFinite(number)||number<10||number>500||
   Math.abs(number*10-Math.round(number*10))>1e-7||
   (typeof input.checkValidity==='function'&&!input.checkValidity())){
   tell('体重は10〜500kgの範囲で、小数第1位まで入力してください。',true);
   return false;
  }
  try{
   const all=readAll();
   const existing=all[day];
   if(existing!==undefined&&(!existing||typeof existing!=='object'||Array.isArray(existing)))
    throw Error('invalid saved day');
   // Preserve the same-day waist value and any other existing fields.
   all[day]={...(existing||{}),weight:number};
   localStorage.setItem(KEY,JSON.stringify(all));
   tell(day+'の体重 '+number.toFixed(1)+'kg を保存しました。');
   return true;
  }catch(e){
   tell('保存できませんでした。保存設定・空き容量を確認してください。既存の記録は変更していません。',true);
   return false;
  }
 }
 form.addEventListener('submit',event=>{event.preventDefault();save();});
 date.addEventListener('change',refresh);
 window.addEventListener('pageshow',refresh);
 window.EquinerisQuickWeight=Object.freeze({refresh});
 refresh();
})();