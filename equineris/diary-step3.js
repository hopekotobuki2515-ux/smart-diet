'use strict';
(() => {
 const OWN='equineris:diary-step3:v1:',STEP2='equineris:diary-step2:v1:',STEP1='equineris:paper-first3:v1:';
 const MEALS=[['breakfast','朝食'],['lunch','昼食'],['dinner','夕食'],['snack','間食']];
 const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
 const dateInput=$('#diary-date'),status=$('#saveStatus'),photoStatus=$('#photoStatus');
 const track=$('#mealTrack'),tabs=$$('[data-meal-tab]'),slides=$$('[data-slide]');
 let recordId='',activeSlide=0,master=null,searchTarget={},pictureDB=null,step2PhotoDB=null,step1PhotoDB=null,photoBusy=false,photoVersion=0;
 const imageUrls=[],dialogUrls=[];
 const groupNumber=f=>{const match=/^第([1-4])群$/.exec(f.group);return match?Number(match[1]):null;};
 const fmt=value=>(Math.round((value+Number.EPSILON)*100)/100).toFixed(2);
 const message=(txt,error=false)=>{status.textContent=txt;status.dataset.error=String(error);};
 const photoMessage=(txt,error=false)=>{photoStatus.textContent=txt;photoStatus.dataset.error=String(error);};
 const read=k=>{try{return localStorage.getItem(k);}catch(e){message('記録の読み込みができません。',true);return null;}};
 const put=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch(e){message('保存できません。ブラウザの保存設定を確認してください。',true);return false;}};
 const key=(name,id=recordId)=>OWN+'entry:'+id+':'+name;
 const step2Key=(name,id=recordId)=>STEP2+'entry:'+id+':'+name;
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T12:00:00');return !Number.isNaN(d.getTime())&&[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')===s;};
 const slotDate=n=>read(OWN+'slot-date:'+n)||read(STEP2+'slot-date:'+n)||read(STEP1+n+':date')||'';
 function slotFor(value){if(/^slot[1-3]$/.test(value))return Number(value.slice(-1));for(let n=1;n<=3;n++)if(slotDate(n)===value)return n;return null;}
 function idFor(date){const n=slotFor(date);return n?'slot'+n:date;}
 function inherited(name,meal){
   const own=read(key(name+':'+meal));if(own!==null)return own;
   const s2=read(step2Key(name+':'+meal));if(s2!==null)return s2;
   const slot=slotFor(recordId);
   return name==='memo'&&slot?read(STEP1+slot+':'+meal+'-meal')||'':'';
 }
 function safeFoods(value){
   if(!value)return [];
   try{const list=JSON.parse(value);if(!Array.isArray(list))return [];
     return list.slice(0,100).filter(x=>x&&typeof x.name==='string'&&x.name.trim()).map(x=>{
       const grams=x.grams===null||x.grams===undefined||x.grams===''?null:Number(x.grams);
       const idx=Number.isInteger(x.masterIndex)&&x.masterIndex>=0?x.masterIndex:null;
       return {name:x.name.slice(0,100),grams:Number.isFinite(grams)&&grams>0&&grams<=100000?grams:null,
         rawAmount:x.rawAmount===null||x.rawAmount===''||x.rawAmount===undefined?null:Number(x.rawAmount),
         rawUnit:typeof x.rawUnit==='string'?x.rawUnit.slice(0,15):'',
         sourceGroup:['1','2','3','4'].includes(String(x.sourceGroup))?String(x.sourceGroup):'',
         masterIndex:idx,masterName:typeof x.masterName==='string'?x.masterName:'',
         masterGroup:typeof x.masterGroup==='string'?x.masterGroup:'',
         masterGramsPerPoint:Number.isFinite(x.masterGramsPerPoint)?x.masterGramsPerPoint:null};
     });}catch(e){return [];}
 }
 function importStep2(meal){
   const raw=read(step2Key('foods:'+meal));
   if(!raw)return [];
   try{
     const items=JSON.parse(raw);
     if(!Array.isArray(items))return [];
     return items.slice(0,100).filter(x=>x&&typeof x.name==='string'&&x.name.trim()).map(x=>{
       const amount=x.amount===null||x.amount===''||x.amount===undefined?null:Number(x.amount);
       const unit=String(x.unit||'g');
       const group=['1','2','3','4'].includes(String(x.group))?String(x.group):'';
       return {name:String(x.name).slice(0,100),grams:unit==='g'&&Number.isFinite(amount)&&amount>0?amount:null,
          rawAmount:Number.isFinite(amount)&&amount>0?amount:null,rawUnit:unit,sourceGroup:group,
          masterIndex:null,masterName:'',masterGroup:'',masterGramsPerPoint:null};
     });
   }catch(e){return [];}
 }
 function foods(meal){const own=read(key('foods:'+meal));return own===null?importStep2(meal):safeFoods(own);}
 function storeFoods(meal,list){return put(key('foods:'+meal),JSON.stringify(list));}
 function resolveMaster(item){
   if(!master||item.masterIndex===null||!Number.isInteger(item.masterIndex))return null;
   const record=master[item.masterIndex];
   if(!record||record.name!==item.masterName||record.group!==item.masterGroup||record.gramsPerPoint!==item.masterGramsPerPoint)return null;
   return record;
 }
 function foodPoints(item){const food=resolveMaster(item);return food&&item.grams!==null?item.grams/food.gramsPerPoint:null;}
 function groupSums(meal){
   const sums=[0,0,0,0],missing=[0,0,0,0];let unknown=0;
   for(const item of foods(meal)){
     const resolved=resolveMaster(item);
     const group=resolved?groupNumber(resolved):Number(item.sourceGroup)||0;
     const points=foodPoints(item);
     if(points!==null&&group>=1&&group<=4)sums[group-1]+=points;
     else if(group>=1&&group<=4)missing[group-1]++;
     else unknown++;
   }
   return {sums,missing,unknown};
 }
 const groupNames=['第1群','第2群','第3群','第4群'];
 function elt(tag,txt,cls){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;}
 function drawGroupTable(meal){
   const r=groupSums(meal),wrap=$('[data-group-subtotal="'+meal+'"]');wrap.replaceChildren();
   for(let i=0;i<4;i++){
     const cell=elt('div',undefined,'subtotal-cell');
     cell.appendChild(elt('small',groupNames[i]));
     cell.appendChild(elt('strong',fmt(r.sums[i])+'点'));
     if(r.missing[i])cell.appendChild(elt('small','未計算 '+r.missing[i]+'件','subtotal-warning'));
     wrap.appendChild(cell);
   }
   const total=$('[data-meal-total="'+meal+'"]');
   const sum=r.sums.reduce((a,b)=>a+b,0);
   total.textContent='1食の小計：'+fmt(sum)+'点'+(r.unknown||r.missing.some(Boolean)?'（未計算の食材あり）':'');
 }
 function drawDaily(){
   const all=MEALS.map(([m])=>groupSums(m)),pattern=$('#targetPattern').value;
   const targets=pattern==='21'?[3,3,3,12]:pattern==='15'?[3,3,3,6]:null;
   const totals=[0,0,0,0],missing=[0,0,0,0];let unknown=0;
   for(const r of all){for(let i=0;i<4;i++){totals[i]+=r.sums[i];missing[i]+=r.missing[i];}unknown+=r.unknown;}
   const holder=$('#dailyGroups');holder.replaceChildren();
   for(let i=0;i<4;i++){
     const el=elt('div',undefined,'daily-group');
     el.appendChild(elt('small',groupNames[i]));
     el.appendChild(elt('strong',fmt(totals[i])+(targets?'/'+targets[i]:'')+'点'));
     if(missing[i])el.appendChild(elt('small','未計算 '+missing[i]+'件','subtotal-warning'));
     holder.appendChild(el);
   }
   const dayTotal=totals.reduce((a,b)=>a+b,0);
   $('#dailyTotal').textContent='合計：'+fmt(dayTotal)+(targets?'/'+pattern:'')+'点';
   $('#unresolvedStatus').textContent=missing.reduce((a,b)=>a+b,0)+unknown>0?'未計算 '+(missing.reduce((a,b)=>a+b,0)+unknown)+'件。すべて照合するまで合計は確定しません。':'表示した食材の点数をすべて計算済みです。';
 }
 function drawAllTotals(){for(const [meal]of MEALS)drawGroupTable(meal);drawDaily();}
 function renderFoods(meal){
   const root=$('[data-food-list="'+meal+'"]');root.replaceChildren();
   const entries=foods(meal);
   if(!entries.length){root.appendChild(elt('p','食材はまだありません。','food-empty'));drawAllTotals();return;}
   entries.forEach((food,index)=>{
     const row=elt('div',undefined,'step3-food-row');
     const h=elt('div',undefined,'step3-food-head');
     h.appendChild(elt('strong',food.name));
     const m=resolveMaster(food),point=foodPoints(food);
     h.appendChild(elt('span',point===null?'未計算':fmt(point)+'点',point===null?'food-unresolved':'food-points'));
     row.appendChild(h);
     const meta=m?m.group+'／1点='+m.gramsPerPoint+'g':'食品マスター未照合'+(food.sourceGroup?'／第'+food.sourceGroup+'群':'');
     row.appendChild(elt('div',meta,'food-meta'));
     if(food.rawUnit!=='g'&&food.rawAmount!==null)row.appendChild(elt('div','元の入力：'+food.rawAmount+food.rawUnit+'（gに換算して入力してください）','food-meta'));
     const tools=elt('div',undefined,'food-tools');
     const gramsLabel=elt('label','重量（g）','food-grams');
     const grams=elt('input');grams.type='number';grams.inputMode='decimal';grams.min='0';grams.step='any';grams.max='100000';
     grams.value=food.grams===null?'':String(food.grams);grams.setAttribute('aria-label',food.name+'の重量（g）');
     grams.addEventListener('change',()=>{
       const raw=grams.value,amount=raw===''?null:Number(raw);
       if(amount!==null&&(!Number.isFinite(amount)||amount<=0||amount>100000)){
         message('重量は正の値（g）で入力してください。',true);grams.value=food.grams===null?'':food.grams;return;
       }
       const fresh=foods(meal);if(!fresh[index])return;
       fresh[index].grams=amount;
       if(storeFoods(meal,fresh)){renderFoods(meal);message('重量と点数を更新しました。');}
     });
     gramsLabel.appendChild(grams);tools.appendChild(gramsLabel);
     const mapButton=elt('button',m?'食品を変更':'食品マスター照合','food-map-btn');mapButton.type='button';
     mapButton.addEventListener('click',()=>{
       searchTarget[meal]=index;
       const query=$('[data-food-query="'+meal+'"]');
       query.value=food.name;
       $('[data-search-mode="'+meal+'"]').textContent=food.name+'を食品マスターと照合';
       drawResults(meal);
       query.focus();
     });
     tools.appendChild(mapButton);
     const remove=elt('button','削除','food-delete-btn');remove.type='button';
     remove.addEventListener('click',()=>{
       const fresh=foods(meal);if(!fresh[index])return;fresh.splice(index,1);
       if(storeFoods(meal,fresh)){renderFoods(meal);message('ステップ3の食材を削除しました。ステップ2の記録は残ります。');}
     });
     tools.appendChild(remove);row.appendChild(tools);root.appendChild(row);
   });
   drawAllTotals();
 }
 function matching(q){
   if(!master)return [];
   const normalized=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s・]/g,'').replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
   const term=normalized(q);
   if(!term)return [];
   // よく使う食品名は正式な食品マスター名に対応させ、マスターの数値は変更しない。
   const alias=({'ちくわ':'焼き竹輪','ごはん':'めし・水稲・精白米','ご飯':'めし・水稲・精白米'})[term]||null;
   return master.map((f,i)=>({f,i})).filter(({f})=>normalized(f.name).includes(term)||(alias!==null&&f.name===alias)).slice(0,18);
 }
 function drawResults(meal){
   const query=$('[data-food-query="'+meal+'"]').value.trim(),results=$('[data-search-results="'+meal+'"]');
   results.replaceChildren();
   if(!master){results.appendChild(elt('p','食品マスターを読み込めません。点数は計算できません。','food-empty'));return;}
   if(!query){results.appendChild(elt('p','食品名を入力してください。','food-empty'));return;}
   const matches=matching(query);
   if(!matches.length){results.appendChild(elt('p','該当なし。名称を変えて検索するか、手入力で追加してください。','food-empty'));return;}
   for(const {f,i} of matches){
     const button=elt('button',undefined,'master-option');button.type='button';
     button.appendChild(elt('span',f.name));
     button.appendChild(elt('small',f.group+' ／ 1点＝'+f.gramsPerPoint+'g'));
     button.addEventListener('click',()=>{
       const selected=searchTarget[meal];
       const list=foods(meal);
       const item={name:f.name,grams:null,rawAmount:null,rawUnit:'g',sourceGroup:String(groupNumber(f)),masterIndex:i,masterName:f.name,masterGroup:f.group,masterGramsPerPoint:f.gramsPerPoint};
       if(Number.isInteger(selected)&&selected>=0&&selected<list.length){
         const prev=list[selected];
         item.grams=prev.grams;item.rawAmount=prev.rawAmount;item.rawUnit=prev.rawUnit;
         list[selected]=item;
       }else{
         if(list.length>=100){message('1食の食材は100件までです。',true);return;}
         list.push(item);
       }
       if(storeFoods(meal,list)){
         searchTarget[meal]=null;
         $('[data-food-query="'+meal+'"]').value='';
         $('[data-search-mode="'+meal+'"]').textContent='食品を追加する';
         results.replaceChildren();
         renderFoods(meal);
         message('食品マスターに照合しました。重量をg単位で確認してください。');
       }
     });
     results.appendChild(button);
   }
 }
 function populate(id){
   recordId=id;
   const slot=slotFor(id),date=slot?slotDate(slot):id;
   dateInput.value=validDate(date)?date:'';
   for(const [meal]of MEALS){
     $('[data-memo="'+meal+'"]').value=inherited('memo',meal);
     $('[data-time="'+meal+'"]').value=inherited('time',meal);
     searchTarget[meal]=null;
     $('[data-food-query="'+meal+'"]').value='';
     $('[data-search-mode="'+meal+'"]').textContent='食品を追加する';
     $('[data-search-results="'+meal+'"]').replaceChildren();
     renderFoods(meal);
   }
   drawAllTotals();
   put(OWN+'last-record',id);
   message('ステップ3の記録は独立して自動保存されます。');
   void refreshPhotos();
 }
 function showSlide(index){
   activeSlide=Math.max(0,Math.min(slides.length-1,index));
   tabs.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===activeSlide)));
   $('#currentMealLabel').textContent=tabs[activeSlide].textContent;
   $('#mealCounter').textContent=(activeSlide+1)+' / '+slides.length;
   $('#mealPrev').disabled=activeSlide===0;
   $('#mealNext').disabled=activeSlide===slides.length-1;
   $('.actions').hidden=activeSlide===0;
 }
 function go(index,animate=true){
   const n=Math.max(0,Math.min(slides.length-1,index));
   track.scrollTo({left:n*track.clientWidth,behavior:animate?'smooth':'auto'});showSlide(n);
 }
 tabs.forEach((b,i)=>b.addEventListener('click',()=>go(i)));
 $('#mealPrev').addEventListener('click',()=>go(activeSlide-1));
 $('#mealNext').addEventListener('click',()=>go(activeSlide+1));
 let scheduled=false;
 track.addEventListener('scroll',()=>{
   if(scheduled)return;scheduled=true;
   requestAnimationFrame(()=>{scheduled=false;showSlide(Math.round(track.scrollLeft/(track.clientWidth||1)));});
 },{passive:true});
 track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowRight'){e.preventDefault();go(activeSlide+1);}if(e.key==='ArrowLeft'){e.preventDefault();go(activeSlide-1);}});
 window.addEventListener('resize',()=>{track.scrollLeft=activeSlide*track.clientWidth;});
 $('#targetPattern').addEventListener('change',()=>{
   put(OWN+'target-pattern',$('#targetPattern').value);drawDaily();
 });
 dateInput.addEventListener('change',()=>{
   if(photoBusy){dateInput.value=slotFor(recordId)?slotDate(slotFor(recordId)):recordId;message('写真の保存後に日付を変更してください。',true);return;}
   const date=dateInput.value;if(!validDate(date)){message('日付が正しくありません。',true);return;}
   const slot=slotFor(recordId);
   if(slot&&!slotDate(slot)){if(!put(OWN+'slot-date:'+slot,date))return;populate(recordId);}
   else populate(idFor(date));
   go(0,false);
 });
 $$('[data-memo]').forEach(input=>input.addEventListener('input',()=>put(key('memo:'+input.dataset.memo),input.value)));
 $$('[data-time]').forEach(input=>input.addEventListener('change',()=>put(key('time:'+input.dataset.time),input.value)));
 $$('[data-food-query]').forEach(input=>input.addEventListener('input',()=>drawResults(input.dataset.foodQuery)));
 $$('[data-add-manual]').forEach(button=>button.addEventListener('click',()=>{
   const meal=button.dataset.addManual,query=$('[data-food-query="'+meal+'"]');
   const name=query.value.trim();if(!name){message('食品名を入力してください。',true);query.focus();return;}
   const list=foods(meal);
   if(list.length>=100){message('1食100件まで登録できます。',true);return;}
   list.push({name:name.slice(0,100),grams:null,rawAmount:null,rawUnit:'g',sourceGroup:'',masterIndex:null,masterName:'',masterGroup:'',masterGramsPerPoint:null});
   if(storeFoods(meal,list)){
     query.value='';searchTarget[meal]=null;
     $('[data-search-mode="'+meal+'"]').textContent='食品を追加する';
     $('[data-search-results="'+meal+'"]').replaceChildren();
     renderFoods(meal);
     message('食品を手入力で追加しました。マスターに照合するまで点数は未計算です。');
   }
 }));
 $$('[data-search-reset]').forEach(button=>button.addEventListener('click',()=>{
   const meal=button.dataset.searchReset;
   searchTarget[meal]=null;
   $('[data-food-query="'+meal+'"]').value='';
   $('[data-search-mode="'+meal+'"]').textContent='食品を追加する';
   $('[data-search-results="'+meal+'"]').replaceChildren();
 }));
 $('#saveButton').addEventListener('click',()=>{
   let ok=true;
   for(const [meal]of MEALS){
     ok=put(key('memo:'+meal),$('[data-memo="'+meal+'"]').value)&&ok;
     ok=put(key('time:'+meal),$('[data-time="'+meal+'"]').value)&&ok;
     ok=storeFoods(meal,foods(meal))&&ok;
   }
   if(ok)message('記録を保存しました。');
 });
 const preview=$('#previewDialog');
 $('#previewButton').addEventListener('click',()=>{
   const area=$('#previewRows');area.replaceChildren();
   for(const [meal,label]of MEALS){
     const section=elt('section',undefined,'preview-meal');section.appendChild(elt('h3',label));
     const memo=$('[data-memo="'+meal+'"]').value;
     section.appendChild(elt('p',memo||'（メモなし）'));
     const list=foods(meal);
     const ul=elt('ul');
     for(const food of list){
       const val=foodPoints(food);ul.appendChild(elt('li',food.name+' '+(food.grams===null?'重量未入力':food.grams+'g')+'／'+(val===null?'未計算':fmt(val)+'点')));
     }
     if(list.length)section.appendChild(ul);
     const sub=groupSums(meal);
     section.appendChild(elt('p',groupNames.map((name,i)=>name+' '+fmt(sub.sums[i])+'点').join('／')));
     area.appendChild(section);
   }
   if(typeof preview.showModal==='function')preview.showModal();
 });
 $('#closePreview').addEventListener('click',()=>preview.close());
 // Photos are stored in a step-3 namespace; earlier photos are read-only fallbacks.
 function openPhotos(name){return new Promise((resolve,reject)=>{
   if(!('indexedDB' in window)){reject(Error('IndexedDB unavailable'));return;}
   const req=indexedDB.open(name,1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos',{keyPath:'id'});};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Open error'));req.onblocked=()=>reject(Error('Blocked'));
 });}
 function tx(db,mode,fn){return new Promise((ok,fail)=>{
   if(!db){ok(null);return;}try{const t=db.transaction('photos',mode),r=fn(t.objectStore('photos'));let result=null;r.onsuccess=()=>{result=r.result;};t.oncomplete=()=>ok(result);t.onerror=()=>fail(t.error||Error('Transaction'));t.onabort=()=>fail(t.error||Error('Abort'));}catch(e){fail(e);}
 });}
 async function getPhoto(meal,id=recordId){
   let photo=await tx(pictureDB,'readonly',s=>s.get(id+':'+meal));
   if(photo?.file instanceof Blob)return {...photo,sourceStep:3};
   photo=await tx(step2PhotoDB,'readonly',s=>s.get(id+':'+meal));
   if(photo?.file instanceof Blob)return {...photo,sourceStep:2};
   const slot=slotFor(id);
   photo=slot?await tx(step1PhotoDB,'readonly',s=>s.get(slot+':'+meal)):null;
   return photo?.file instanceof Blob?{...photo,sourceStep:1}:null;
 }
 const cleanUrls=()=>{imageUrls.forEach(u=>URL.revokeObjectURL(u));imageUrls.length=0;};
 async function refreshPhotos(){
   const id=recordId,version=++photoVersion;cleanUrls();
   for(const [meal]of MEALS){
     $('#photo-view-'+meal).hidden=true;
     $('#photo-img-'+meal).removeAttribute('src');
     $('[data-photo-remove="'+meal+'"]').hidden=true;
   }
   if(!pictureDB&&!step2PhotoDB&&!step1PhotoDB)return;
   try{
     const results=await Promise.all(MEALS.map(async([meal])=>({meal,item:await getPhoto(meal,id)})));
     if(id!==recordId||version!==photoVersion)return;
     for(const {meal,item}of results){
       if(!(item?.file instanceof Blob))continue;
       const url=URL.createObjectURL(item.file);imageUrls.push(url);
       $('#photo-img-'+meal).src=url;$('#photo-view-'+meal).hidden=false;
       $('[data-photo-remove="'+meal+'"]').hidden=item.sourceStep!==3;
     }
   }catch(e){photoMessage('写真を読み込めませんでした。',true);}
 }
 function photoBusyState(value){photoBusy=value;$$('[data-photo]').forEach(x=>x.disabled=value||!pictureDB);}
 $$('[data-photo]').forEach(input=>input.addEventListener('change',async()=>{
   const file=input.files?.[0];if(!file)return;
   if(!file.type.startsWith('image/')){photoMessage('画像を選択してください。',true);input.value='';return;}
   photoBusyState(true);const id=recordId,meal=input.dataset.photo;
   try{await tx(pictureDB,'readwrite',store=>store.put({id:id+':'+meal,file}));if(id===recordId)await refreshPhotos();photoMessage('ステップ3の写真を保存しました。');}
   catch(e){photoMessage('写真を保存できませんでした。',true);}
   finally{input.value='';photoBusyState(false);}
 }));
 $$('[data-photo-remove]').forEach(button=>button.addEventListener('click',async()=>{
   if(!window.confirm('ステップ3で登録した写真を削除しますか？ステップ1・2の写真は残ります。'))return;
   try{
     const key=recordId+':'+button.dataset.photoRemove;
     await tx(pictureDB,'readwrite',s=>s.delete(key));
     await refreshPhotos();photoMessage('ステップ3の写真を削除しました。');
   }catch(e){photoMessage('写真を削除できませんでした。',true);}
 }));
 const params=new URLSearchParams(location.search);
 const day=params.get('day'),date=params.get('date');
 const last=read(OWN+'last-record');
 const initial=/^[123]$/.test(day||'')?'slot'+day:validDate(date)?idFor(date):(last&&/^(slot[1-3]|\d{4}-\d{2}-\d{2})$/.test(last)?last:today());
 const target=read(OWN+'target-pattern');$('#targetPattern').value=['15','21','none'].includes(target)?target:'15';
 populate(initial);showSlide(0);
 fetch('../food-master.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(data=>{
   if(!Array.isArray(data.foods)||data.foods.length<600||data.foods.some(f=>!f.name||!/^第[1-4]群$/.test(f.group)||!Number.isFinite(f.gramsPerPoint)||f.gramsPerPoint<=0))throw Error('Invalid master data');
   master=data.foods;
   $('#masterStatus').textContent='食品マスター '+master.length+'品目を読み込みました。';
   for(const [meal]of MEALS){renderFoods(meal);drawResults(meal);}
 }).catch(()=>{$('#masterStatus').textContent='食品マスターを読み込めませんでした。未計算のまま表示します。';message('食品マスターを読み込めません。通信状況を確認してください。',true);});
 Promise.allSettled([openPhotos('equineris-diary-step3-photos-v1'),openPhotos('equineris-diary-step2-photos-v1'),openPhotos('equineris-paper-first3-photos-v1')]).then(items=>{
   pictureDB=items[0].status==='fulfilled'?items[0].value:null;
   step2PhotoDB=items[1].status==='fulfilled'?items[1].value:null;
   step1PhotoDB=items[2].status==='fulfilled'?items[2].value:null;
   photoBusyState(false);void refreshPhotos();
   if(!pictureDB)photoMessage('新しい写真を保存できません。メモと点数計算は使用できます。',true);
 });
})();
