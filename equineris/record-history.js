/* EQUINERIS read-only unified diary review. No migration or writes to stored records. */
'use strict';
(()=>{
 const S1='equineris:paper-first3:v1:';
 const S1_DATE='equineris:diary-step1:v1:entry:';
 const S2='equineris:diary-step2:v1:';
 const S3='equineris:diary-step3:v1:';
 const BODY='equineris:body-measurements:v1';
 const MEALS=[['breakfast','朝食'],['lunch','昼食'],['dinner','夕食'],['snack','間食']];
 const MEAL_IDS=new Set(MEALS.map(x=>x[0]));
 const dateValid=s=>{
  if(typeof s!=='string'||!(/^\d{4}-\d{2}-\d{2}$/).test(s))return false;
  const n=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;
 };
 const parseList=raw=>{
  if(typeof raw!=='string')return [];
  try{const list=JSON.parse(raw);return Array.isArray(list)?list.filter(x=>x&&typeof x==='object'&&typeof x.name==='string'&&x.name.trim()):[];}
  catch(e){return [];}
 };
 const nonEmpty=(stage,name,value)=>{
  if(value===null||value===undefined)return false;
  if(stage===1)return MEALS.some(([m])=>name===m+'-meal'&&value.trim()!=='')||
   (MEALS.some(([m])=>name.startsWith(m+'-'))&&name.includes('group-')&&value==='checked');
  if(/^memo:(breakfast|lunch|dinner|snack)$/.test(name)||/^time:(breakfast|lunch|dinner|snack)$/.test(name))return String(value).trim()!=='';
  if(/^foods:(breakfast|lunch|dinner|snack)$/.test(name))return parseList(value).length>0;
  return stage===2&&/^mark:(breakfast|lunch|dinner|snack):[1-4]:[0-4]$/.test(name)&&value==='1';
 };
 const photoKey=(source,key)=>{
  if(typeof key!=='string')return null;
  const match=source===1?/^([1-3]|\d{4}-\d{2}-\d{2}):(breakfast|lunch|dinner|snack)$/.exec(key):
   /^(slot[1-3]|\d{4}-\d{2}-\d{2}):(breakfast|lunch|dinner|snack)$/.exec(key);
  if(!match)return null;
  const id=source===1&&/^[1-3]$/.test(match[1])?'slot'+match[1]:match[1];
  return (/^slot[1-3]$/.test(id)||dateValid(id))?{id,meal:match[2]}:null;
 };
 function collect(storage,photos={},archives=[]){
  // Scan only saved user content; last-opened pointers and empty forms do not create history rows.
  const keys=[];
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(typeof k==='string')keys.push(k);}
  const read=k=>storage.getItem(k);
  const slotDates={};
  for(let n=1;n<=3;n++){
   const candidates=[read(S3+'slot-date:'+n),read(S2+'slot-date:'+n),read(S1+n+':date')];
   slotDates[n]=candidates.find(dateValid)||null;
  }
  const rows=new Map();
  const normalized=id=>{
   const slot=/^slot([1-3])$/.exec(id);
   return slot?slotDates[Number(slot[1])]||id:(dateValid(id)?id:null);
  };
  const ensure=(id,stage)=>{
   const key=normalized(id);if(!key)return null;
   let row=rows.get(key);
   if(!row){
    row={key,date:dateValid(key)?key:null,slot:null,
     sources:new Set(),ids:{2:new Set(),3:new Set()},photos:{1:[],2:[],3:[]},
     archives:[],measurement:null};
    rows.set(key,row);
   }
   const slot=/^slot([1-3])$/.exec(id);
   if(slot)row.slot=Number(slot[1]);
   if(stage===2||stage===3)row.ids[stage].add(id);
   if(stage===1||stage===2||stage===3||stage==='archived')row.sources.add(stage);
   return row;
  };
  for(const k of keys){
   if(k.startsWith(S1)){
    const match=/^([1-3]):(.+)$/.exec(k.slice(S1.length));
    if(match&&nonEmpty(1,match[2],read(k)))ensure('slot'+match[1],1);
   }else if(k.startsWith(S1_DATE)){
    const match=/^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(k.slice(S1_DATE.length));
    if(match&&dateValid(match[1])&&nonEmpty(1,match[2],read(k)))ensure(match[1],1);
   }else{
    for(const [prefix,stage] of [[S2,2],[S3,3]]){
     if(!k.startsWith(prefix+'entry:'))continue;
     const match=/^(slot[1-3]|\d{4}-\d{2}-\d{2}):(.+)$/.exec(k.slice((prefix+'entry:').length));
     if(match&&nonEmpty(stage,match[2],read(k)))ensure(match[1],stage);
    }
   }
  }
  for(const stage of [1,2,3]){
   for(const key of photos[stage]||[]){
    const item=photoKey(stage,key);if(!item)continue;
    const row=ensure(item.id,stage);
    if(row)row.photos[stage].push({id:key,meal:item.meal});
   }
  }
  for(const entry of archives||[]){
   if(!entry||typeof entry!=='object')continue;
   const date=dateValid(entry.date)?entry.date:null;
   const n=Number(entry.day);
   const id=date||([1,2,3].includes(n)?'slot'+n:null);
   if(!id)continue;
   if(!(typeof entry.memo==='string'&&entry.memo.trim())&&!(typeof Blob!=='undefined'&&entry.photo instanceof Blob))continue;
   const row=ensure(id,'archived');
   if(row)row.archives.push(entry);
  }
  const rawBody=read(BODY);
  if(rawBody!==null){
   let all;
   try{all=JSON.parse(rawBody);}catch(e){all=null;}
   if(all&&typeof all==='object'&&!Array.isArray(all)){
    for(const [date,measurement] of Object.entries(all)){
     if(!dateValid(date)||!measurement||typeof measurement!=='object')continue;
     const weight=typeof measurement.weight==='number'&&Number.isFinite(measurement.weight)&&measurement.weight>=10&&measurement.weight<=500?measurement.weight:null;
     const waist=typeof measurement.waist==='number'&&Number.isFinite(measurement.waist)&&measurement.waist>=20&&measurement.waist<=300?measurement.waist:null;
     if(weight===null&&waist===null)continue;
     const row=ensure(date,'measurement');
     if(row)row.measurement={weight,waist};
    }
   }
  }
  return [...rows.values()].sort((a,b)=>{
   if(a.date&&b.date)return b.date.localeCompare(a.date);
   if(a.date)return -1;if(b.date)return 1;
   return a.key.localeCompare(b.key);
  });
 }
 function summary(storage,row){
  const get=(stage,name)=>{
   if(stage===1){
     if(row.date){
      const dateVal=storage.getItem(S1_DATE+row.date+':'+name);
      if(dateVal!==null)return dateVal;
     }
     return row.slot?storage.getItem(S1+row.slot+':'+name):null;
    }
   const prefix=stage===2?S2:S3;
   const ids=[row.date,...row.ids[stage],row.slot?'slot'+row.slot:null].filter(Boolean);
   for(const id of [...new Set(ids)]){
    const value=storage.getItem(prefix+'entry:'+id+':'+name);
    if(value!==null)return value;
   }
   return null;
  };
  const mealData=MEALS.map(([id,label])=>{
   const s1Note=get(1,id+'-meal');
   const s2Note=get(2,'memo:'+id),s3Note=get(3,'memo:'+id);
   const memo=s3Note??s2Note??s1Note??'';
   const time=get(3,'time:'+id)??get(2,'time:'+id)??'';
   const raw3=get(3,'foods:'+id),raw2=get(2,'foods:'+id);
   const foods=(raw3!==null?parseList(raw3).map(item=>({...item,stage:3})):
    parseList(raw2).map(item=>({...item,stage:2})));
   const linked=parseList(raw2);
   const counts=[0,0,0,0];
   for(let g=1;g<=4;g++)for(let i=0;i<5;i++){
    const manual=get(2,'mark:'+id+':'+g+':'+i);
    const oldName=i===0?id+'-group-'+g:i===1?id+'-extra-group-'+g:id+'-mark-'+(i+1)+'-group-'+g;
    const marked=manual===null?get(1,oldName)==='checked':manual==='1';
    const automatic=linked.some(item=>String(item.group)===String(g)&&item.markIndex===i);
    if(marked||automatic)counts[g-1]++;
   }
   return {id,label,memo,time,foods,counts,archived:row.archives.filter(a=>
    a.meal===label||a.meal===id)};
  });
  // 旧写真・メモ記録の「飲み物」「飲酒」も振り返りから落とさない。
  for(const label of ['飲み物','飲酒']){
   const archived=row.archives.filter(a=>a.meal===label);
   if(archived.length)mealData.push({id:'archive-'+label,label,memo:'',time:'',foods:[],counts:[0,0,0,0],archived});
  }
  return {meals:mealData,measurement:row.measurement};
 }
 function editUrl(step,row){
  if(![1,2,3].includes(step))return null;
  if(row.date)return './record.html?stage='+step+'&date='+encodeURIComponent(row.date);
  return row.slot?'./record.html?stage='+step+'&day='+row.slot:null;
 }
 // Expose pure read-only model functions for regression tests.
 window.EquinerisRecordHistory=Object.freeze({collect,summary,editUrl,dateValid});
 const select=document.getElementById('reviewDate');
 if(!select)return;
 const $=id=>document.getElementById(id);
 const listStatus=$('listStatus'),detail=$('reviewDetail'),older=$('olderRecord'),newer=$('newerRecord');
 const dates=new Map(),dbs={},urls=[];
 let rows=[],index=0,version=0;
 const message=(txt,error=false)=>{listStatus.textContent=txt;listStatus.dataset.error=String(error);};
 const clean=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.length=0;};
 const node=(tag,cls,text)=>{
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 };
 function openDb(name,store){
  return new Promise(resolve=>{
   if(!('indexedDB' in window)){resolve(null);return;}
   let request;
   try{request=indexedDB.open(name);}catch(e){resolve(null);return;}
   // Aborting creation avoids making new, empty legacy databases during review.
   request.onupgradeneeded=()=>{try{request.transaction.abort();}catch(e){}};
   request.onerror=()=>resolve(null);
   request.onblocked=()=>resolve(null);
   request.onsuccess=()=>{
    const db=request.result;
    if(!db.objectStoreNames.contains(store)){db.close();resolve(null);return;}
    resolve(db);
   };
  });
 }
 function readDB(db,store,method,arg){
  return new Promise(resolve=>{
   if(!db){resolve(method==='getAllKeys'||method==='getAll'?[]:null);return;}
   try{
    const tx=db.transaction(store,'readonly');
    const object=tx.objectStore(store);
    const req=arg===undefined?object[method]():object[method](arg);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(method==='getAllKeys'||method==='getAll'?[]:null);
    tx.onabort=()=>resolve(method==='getAllKeys'||method==='getAll'?[]:null);
   }catch(e){resolve(method==='getAllKeys'||method==='getAll'?[]:null);}
  });
 }
 async function photoFor(row,meal){
  for(const step of [3,2,1]){
   const matching=row.photos[step].filter(p=>p.meal===meal);
   for(const candidate of matching){
    const item=await readDB(dbs[step],'photos','get',candidate.id);
    if(item&&typeof Blob!=='undefined'&&item.file instanceof Blob)return item.file;
   }
  }
  return null;
 }
 function photoNode(blob,alt){
  const image=node('img','review-photo');
  const objectUrl=URL.createObjectURL(blob);
  urls.push(objectUrl);image.src=objectUrl;image.alt=alt;image.loading='lazy';
  return image;
 }
 function draw(){
  if(!rows.length){detail.replaceChildren(node('p','empty','まだ記録がありません。食事や体重を保存すると、こちらに表示されます。'));return;}
  const row=rows[index],id=++version;clean();detail.replaceChildren();
  select.value=row.key;older.disabled=index===rows.length-1;newer.disabled=index===0;
  let result;
  try{result=summary(localStorage,row);}
  catch(e){detail.append(node('p','error','記録を読み込めませんでした。保存済みデータは変更していません。'));return;}
  const header=node('section','review-card');
  header.append(node('h2','',row.date||'日付未設定の旧記録'));
  const steps=['STEP1','STEP2','STEP3'].filter((_,i)=>row.sources.has(i+1));
  if(row.sources.has('archived'))steps.push('旧形式の写真・メモ');
  if(row.measurement)steps.push('体重・腹囲');
  header.append(node('p','meta',steps.length?steps.join(' ／ '):'記録'));
  const edit=node('div','edit-links');
  for(const stage of [1,2,3]){
   const url=editUrl(stage,row);if(!url)continue;
   const link=node('a','edit-link','食事記録 STEP'+stage+'を開く');
   link.href=url;edit.append(link);
  }
  header.append(edit);detail.append(header);
  if(result.measurement){
   const card=node('section','review-card');
   card.append(node('h3','','体重・腹囲'));
   const vals=[];
   if(result.measurement.weight!==null)vals.push('体重 '+result.measurement.weight.toFixed(1)+' kg');
   if(result.measurement.waist!==null)vals.push('腹囲 '+result.measurement.waist.toFixed(1)+' cm');
   card.append(node('p','metric',vals.join(' ／ ')));
   const link=node('a','text-link','体重の推移グラフを見る');
   link.href='./measurements.html';card.append(link);detail.append(card);
  }
  const hasFood=row.sources.has(1)||row.sources.has(2)||row.sources.has(3)||row.sources.has('archived');
  if(!hasFood)return;
  const group=node('section','review-card');
  group.append(node('h3','','食事の記録'));
  for(const meal of result.meals){
   const part=node('article','meal-result');
   part.append(node('h4','',meal.label+(meal.time?'　'+meal.time:'')));
   const notes=[meal.memo.trim(),...meal.archived.map(a=>String(a.memo||'').trim())].filter(Boolean);
   if(notes.length)for(const memo of notes)part.append(node('p','meal-note',memo));
   if(meal.foods.length){
    const ul=node('ul','food-items');
    for(const item of meal.foods){
     let amount='';
     if(item.stage===3){
      const g=Number(item.grams);
      if(item.grams!==null&&Number.isFinite(g)&&g>0)amount=g+'g';
      else if(item.rawAmount!==null&&item.rawAmount!==undefined&&Number.isFinite(Number(item.rawAmount))&&Number(item.rawAmount)>0)
       amount=item.rawAmount+String(item.rawUnit||'');
     }else if(item.amount!==null&&item.amount!==undefined&&Number.isFinite(Number(item.amount))&&Number(item.amount)>0){
      amount=item.amount+String(item.unit||'g');
     }
     const groupLabel=item.stage===2&&['1','2','3','4'].includes(String(item.group))?' ／ 第'+item.group+'群':'';
     ul.append(node('li','',item.name+(amount?'　'+amount:'')+groupLabel));
    }
    part.append(ul);
   }
   if(meal.counts.some(Boolean))part.append(node('p','marks',
    meal.counts.map((n,g)=>'第'+(g+1)+'群 '+n+'個').join(' ／ ')));
   const photoWrap=node('div','review-photos');part.append(photoWrap);
   group.append(part);
   // Photos are fetched from existing IndexedDB stores, never copied or changed.
   void (async()=>{
    const blob=await photoFor(row,meal.id);
    if(id!==version)return;
    if(blob)photoWrap.append(photoNode(blob,meal.label+'の保存写真'));
    for(const a of meal.archived){
     if(typeof Blob!=='undefined'&&a.photo instanceof Blob)
      photoWrap.append(photoNode(a.photo,meal.label+'の旧形式の保存写真'));
    }
   })();
  }
  detail.append(group);
 }
 async function boot(){
  message('記録の保存先を確認しています。');
  const [s1,s2,s3,legacy]=await Promise.all([
   openDb('equineris-paper-first3-photos-v1','photos'),
   openDb('equineris-diary-step2-photos-v1','photos'),
   openDb('equineris-diary-step3-photos-v1','photos'),
   openDb('equineris-food-first3-v1','entries')
  ]);
  dbs[1]=s1;dbs[2]=s2;dbs[3]=s3;dbs.legacy=legacy;
  const [i1,i2,i3,archive]=await Promise.all([
   readDB(s1,'photos','getAllKeys'),readDB(s2,'photos','getAllKeys'),
   readDB(s3,'photos','getAllKeys'),readDB(legacy,'entries','getAll')
  ]);
  try{rows=collect(localStorage,{1:i1,2:i2,3:i3},archive);}
  catch(e){message('保存データを読み取れませんでした。ブラウザの保存設定を確認してください。',true);return;}
  select.replaceChildren();
  for(const row of rows){
   const option=node('option','',row.date||('日付未設定の保存記録'+(row.slot?'（記録枠'+row.slot+'）':'')));
   option.value=row.key;select.append(option);
   dates.set(row.key,row);
  }
  select.disabled=!rows.length;
  older.disabled=!rows.length;newer.disabled=true;
  message(rows.length+'日分の保存記録を確認できます。データはこの端末のブラウザから読み取り、変更しません。');
  index=0;draw();
 }
 select.addEventListener('change',()=>{
  const n=rows.findIndex(x=>x.key===select.value);if(n>=0){index=n;draw();}
 });
 older.addEventListener('click',()=>{if(index+1<rows.length){index++;draw();}});
 newer.addEventListener('click',()=>{if(index>0){index--;draw();}});
 window.addEventListener('pagehide',()=>{version++;clean();for(const db of Object.values(dbs))if(db&&typeof db.close==='function')db.close();});
 void boot();
})();