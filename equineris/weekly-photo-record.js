'use strict';
/* Week 1–3 meal photographs are local to the device, separated from trial diary photos. */
(()=>{
 const meals=['breakfast','lunch','dinner','snack'];
 const week=document.getElementById('weekSelect');
 const day=document.getElementById('daySelect');
 const status=document.getElementById('weeklyPhotoStatus');
 const inputs=[...document.querySelectorAll('[data-weekly-photo]')];
 const removeButtons=[...document.querySelectorAll('[data-weekly-photo-remove]')];
 const prefix='equineris:weeks1-3:photos:v1';
 const store='photos';
 let db=null,epoch=0,busy=false,activeUrls=[],storageReady=false;
 const currentKey=meal=>'w'+week.value+':d'+day.value+':'+meal;
 const validFile=file=>file && typeof file.type==='string' && file.type.startsWith('image/');
 function report(message){status.textContent=message;}
 function urlsReset(){for(const url of activeUrls)URL.revokeObjectURL(url);activeUrls=[];}
 function visibleImagesReset(){
  urlsReset();
  for(const meal of meals){
   const node=document.getElementById('weekly-photo-preview-'+meal);
   const img=document.getElementById('weekly-photo-image-'+meal);
   node.hidden=true;img.removeAttribute('src');
  }
 }
 function manageInputs(){
  for(const input of inputs)input.disabled=!storageReady||busy;
  for(const button of removeButtons)button.disabled=!storageReady||busy;
 }
 function open(){
  return new Promise((resolve,reject)=>{
   if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return;}
   const request=indexedDB.open(prefix,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store,{keyPath:'id'});
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||new Error('Database could not be opened'));
   request.onblocked=()=>reject(new Error('Database blocked'));
  });
 }
 function transaction(mode,action){
  return new Promise((resolve,reject)=>{
   if(!db){reject(new Error('Photo database unavailable'));return;}
   let request;
   try{
    const tx=db.transaction(store,mode);
    request=action(tx.objectStore(store));
    let result;
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error||request.error||new Error('Transaction failed'));
    tx.onabort=()=>reject(tx.error||new Error('Transaction aborted'));
   }catch(error){reject(error);}
  });
 }
 const read=id=>transaction('readonly',s=>s.get(id));
 const put=row=>transaction('readwrite',s=>s.put(row));
 const del=id=>transaction('readwrite',s=>s.delete(id));
 async function refresh(){
  const token=++epoch;
  visibleImagesReset();
  if(!storageReady){return;}
  const current=meals.map(meal=>({meal,id:currentKey(meal)}));
  try{
   const items=await Promise.all(current.map(async row=>({meal:row.meal,data:await read(row.id)})));
   if(token!==epoch)return;
   for(const {meal,data} of items){
    if(!data||!data.file||!validFile(data.file))continue;
    const url=URL.createObjectURL(data.file);
    activeUrls.push(url);
    const img=document.getElementById('weekly-photo-image-'+meal);
    img.src=url;
    document.getElementById('weekly-photo-preview-'+meal).hidden=false;
   }
   report('写真は選択すると、この端末のブラウザ内に保存されます。');
  }catch(error){if(token===epoch)report('写真の読み込みができませんでした。');}
 }
 async function withBusy(action){
  if(!storageReady||busy)return;
  busy=true;manageInputs();
  try{await action();}
  finally{busy=false;manageInputs();}
 }
 for(const input of inputs){
  input.addEventListener('change',async()=>{
   const file=input.files?.[0];
   if(!file)return;
   if(!validFile(file)){report('画像ファイルを選択してください。');input.value='';return;}
   const meal=input.dataset.weeklyPhoto;
   if(!meals.includes(meal)){input.value='';return;}
   const id=currentKey(meal);
   await withBusy(async()=>{
    report('写真を保存しています。');
    try{await put({id,file});await refresh();}
    catch(error){report('写真を保存できませんでした。保存容量・ブラウザ設定をご確認ください。');}
    finally{input.value='';}
   });
  });
 }
 for(const button of removeButtons){
  button.addEventListener('click',async()=>{
   const meal=button.dataset.weeklyPhotoRemove;
   if(!meals.includes(meal))return;
   const id=currentKey(meal);
   await withBusy(async()=>{
    try{await del(id);await refresh();}
    catch(error){report('写真を削除できませんでした。');}
   });
  });
 }
 week.addEventListener('change',refresh);
 day.addEventListener('change',refresh);
 document.getElementById('prevDay').addEventListener('click',refresh);
 document.getElementById('nextDay').addEventListener('click',refresh);
 window.addEventListener('pagehide',urlsReset);
 manageInputs();
 report('写真の保存機能を準備しています。');
 open().then(database=>{
  db=database;storageReady=true;
  db.onversionchange=()=>{
   db.close();db=null;storageReady=false;visibleImagesReset();manageInputs();
   report('写真の保存先が更新されました。ページを再読み込みしてください。');
  };
  manageInputs();refresh();
 }).catch(()=>{
  storageReady=false;manageInputs();
  report('この端末では写真保存を利用できません。ブラウザの設定を確認してください。');
 });
})();