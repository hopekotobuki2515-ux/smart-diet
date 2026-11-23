/* EQUINERIS unified food diary. Existing stage engines keep their original storage. */
'use strict';
(()=>{
 const STAGE_KEY='equineris:diary:input-stage:v1';
 const DATE_KEY='equineris:diary:selected-date:v1';
 const LABELS={'1':'STEP1：写真とメモ','2':'STEP2：食品名・分量・食品群','3':'STEP3：食品検索・重量・点数計算',history:'これまでの記録'};
 const CHILD={'1':'diary-step1.html','2':'diary-step2.html','3':'diary-step3.html',history:'record-history.html'};
 const buttons=[...document.querySelectorAll('[data-view]')];
 const dateField=document.getElementById('recordDate');
 const dateBox=document.getElementById('dateBox');
 const status=document.getElementById('recordStatus');
 const frame=document.getElementById('recordFrame');
 const read=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
 const write=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){status.textContent='記録の保存設定を確認してください。';status.dataset.error='true';}};
 const validDate=s=>{
  if(typeof s!=='string'||!(/^\d{4}-\d{2}-\d{2}$/).test(s))return false;
  const t=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;
 };
 const today=()=>{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 };
 const hasLegacy=day=>{
  try{
   const prefix='equineris:paper-first3:v1:'+day+':';
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&key.startsWith(prefix)&&key!==prefix+'date')return true;
   }
  }catch(e){}
  return false;
 };
 const params=new URLSearchParams(location.search);
 const requestedStage=params.get('stage');
 const persistedStage=read(STAGE_KEY);
 let active=LABELS[requestedStage]?requestedStage:LABELS[persistedStage]?persistedStage:'1';
 let selectedDate=validDate(params.get('date'))?params.get('date'):(validDate(read(DATE_KEY))?read(DATE_KEY):today());
 let legacyDay=null;
 const rawDay=params.get('day');
 if(!validDate(params.get('date'))&&/^[123]$/.test(rawDay||'')){
  const oldDate=read('equineris:paper-first3:v1:'+rawDay+':date')||
   read('equineris:diary-step2:v1:slot-date:'+rawDay)||
   read('equineris:diary-step3:v1:slot-date:'+rawDay);
  if(validDate(oldDate))selectedDate=oldDate;
  else if(hasLegacy(rawDay)||(['1','2','3'].includes(requestedStage))){selectedDate='';legacyDay=rawDay;}
 }
 let photoBusy=false,observer=null;
 const describe=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
 const enable=()=>{buttons.forEach(b=>b.disabled=photoBusy);dateField.disabled=photoBusy;};
 const busy=value=>{
  photoBusy=value;enable();
  describe(value?'写真の保存中です。入力方法と日付の変更は保存後にできます。':LABELS[active]);
 };
 const frameUrl=(view,date,day)=>'./'+CHILD[view]+(view==='history'?'':'?'+(day?'day='+day:'date='+encodeURIComponent(date)));
 function updateUrl(){
  const q=new URLSearchParams();q.set('stage',active);
  if(legacyDay)q.set('day',legacyDay);
  else if(validDate(selectedDate))q.set('date',selectedDate);
  history.replaceState(null,'',location.pathname+'?'+q.toString());
 }
 function select(view,options={}){
  if(!LABELS[view]||photoBusy)return false;
  if(/^[123]$/.test(String(options.legacyDay||''))){legacyDay=String(options.legacyDay);selectedDate='';}
  else if(validDate(options.date)){legacyDay=null;selectedDate=options.date;write(DATE_KEY,selectedDate);}
  active=view;
  if(view!=='history')write(STAGE_KEY,view);
  dateBox.hidden=view==='history';dateField.value=selectedDate;
  buttons.forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===view)));
  frame.title=LABELS[view];describe(LABELS[view]);updateUrl();
  const next=frameUrl(view,selectedDate,legacyDay);
  if(frame.getAttribute('src')!==next){
   if(observer){observer.disconnect();observer=null;}
   frame.setAttribute('src',next);
  }
  return true;
 }
 function linkClick(event){
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  const anchor=event.target.closest('a[href]');
  if(!anchor||anchor.hasAttribute('download')||anchor.target==='_blank')return;
  let url;
  try{url=new URL(anchor.href,frame.contentWindow.location.href);}catch(e){return;}
  if(url.origin!==location.origin)return;
  const p=url.pathname;
  let view=null;
  if(p.endsWith('/record-history.html'))view='history';
  else if(p.endsWith('/diary-step1.html'))view='1';
  else if(p.endsWith('/diary-step2.html'))view='2';
  else if(p.endsWith('/diary-step3.html'))view='3';
  else if(p.endsWith('/record.html'))view=url.searchParams.get('stage')||'1';
  if(view&&LABELS[view]){
   event.preventDefault();
   const date=url.searchParams.get('date'),day=url.searchParams.get('day');
   const option=validDate(date)?{date}:(/^[123]$/.test(day||'')?{legacyDay:day}:{});
   select(view,option);
  }else if(p.endsWith('/measurements.html')||p.endsWith('/textbook.html')||p.endsWith('/food-search.html')){
   event.preventDefault();location.assign(url.href);
  }
 }
 function onFrameLoad(){
  let child,doc;
  try{child=frame.contentWindow;doc=frame.contentDocument;}catch(e){
   describe('記録画面を開けませんでした。',true);return;
  }
  if(!doc||!doc.body)return;
  let target;
  try{target=new URL(child.location.href);}catch(e){return;}
  if(!target.pathname.endsWith('/'+CHILD[active]))return;
  const style=doc.createElement('style');
  style.setAttribute('data-unified-record','true');
  style.textContent=[
   'html{overflow-x:hidden!important}',
   'body{min-width:0!important;margin:0!important;background:#fff!important}',
   '.page{margin:0 auto!important;min-height:0!important;max-width:100%!important;',
   'border:0!important;border-radius:0!important;box-shadow:none!important;',
   'padding:8px 8px 25px!important}',
   '.toolbar,.topbar,.step3-footer,.stage-route,.related,.back,',
   'a[href*="record-history.html"],a[href*="measurements.html"]{display:none!important}',
   '@media(max-width:350px){.page{padding-inline:5px!important}}'
  ].join('');
  doc.head.append(style);
  doc.addEventListener('click',linkClick,true);
  if(observer){observer.disconnect();observer=null;}
  const photoStatus=doc.getElementById('photoStatus');
  if(photoStatus&&typeof MutationObserver==='function'){
   observer=new MutationObserver(()=>{
    const saving=photoStatus.textContent.includes('保存しています')||photoStatus.textContent.includes('削除しています');
    if(photoBusy&&!saving)busy(false);
   });
   observer.observe(photoStatus,{childList:true,characterData:true,subtree:true});
   doc.addEventListener('change',event=>{
    if(event.target.matches('input[type="file"][data-photo]')&&event.target.files?.length)busy(true);
   },true);
  }
  describe(LABELS[active]);
 }
 frame.addEventListener('load',onFrameLoad);
 buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.view)));
 dateField.addEventListener('change',()=>{
  if(photoBusy){dateField.value=selectedDate;return;}
  if(!validDate(dateField.value)){dateField.value=selectedDate;describe('正しい日付を入力してください。',true);return;}
  select(active,{date:dateField.value});
 });
 window.addEventListener('pagehide',()=>{if(observer)observer.disconnect();});
 select(active);
})();
