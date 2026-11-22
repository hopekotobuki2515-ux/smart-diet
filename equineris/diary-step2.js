'use strict';
(() => {
  const PREFIX = 'equineris:diary-step2:v1:';
  const OLD = 'equineris:paper-first3:v1:';
  const meals = [['breakfast','朝食'],['lunch','昼食'],['dinner','夕食'],['snack','間食']];
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const track = $('#mealTrack'), dateInput = $('#diary-date');
  const status = $('#saveStatus'), photoStatus = $('#photoStatus');
  const slides = $$('[data-slide]'), tabs = $$('[data-meal-tab]');
  let recordId = '', activeSlide = 0, photoDB = null, oldDB = null;
  let savingPhoto = false, photoVersion = 0;
  const currentUrls = [];
  function message(value, error=false) { status.textContent=value; status.dataset.error=String(error); }
  function photoMessage(value, error=false) { photoStatus.textContent=value; photoStatus.dataset.error=String(error); }
  function read(key) { try { return localStorage.getItem(key); } catch(e) { message('記録を読み込めません。',true); return null; } }
  function write(key,value) { try { localStorage.setItem(key,value); return true; } catch(e) { message('保存に失敗しました。ブラウザの設定を確認してください。',true); return false; } }
  function currentKey(name) { return PREFIX+'entry:'+recordId+':'+name; }
  function oldDayDate(number) { return read(PREFIX+'slot-date:'+number)||read(OLD+number+':date')||''; }
  function oldSlot(value) {
    if(/^slot[1-3]$/.test(value)) return Number(value.slice(-1));
    for(let n=1;n<=3;n++) if(oldDayDate(n)===value) return n;
    return null;
  }
  function oldValue(name) { const n=oldSlot(recordId); return n?read(OLD+n+':'+name):null; }
  function inherited(name,oldName) { const own=read(currentKey(name)); return own===null?(oldName?oldValue(oldName)||'':''):own; }
  function dateToday() {
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function dateValid(s) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d=new Date(s+'T12:00:00');
    return Number.isFinite(d.getTime()) &&
      [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')===s;
  }
  function readFoods(meal) {
    try {
      const list=JSON.parse(read(currentKey('foods:'+meal))||'[]');
      if(!Array.isArray(list))return [];
      return list.slice(0,100).filter(x=>x&&typeof x.name==='string')
        .map(x=>({name:x.name.slice(0,100), amount:x.amount===null||x.amount===''?null:Number(x.amount),
          unit:String(x.unit||'g').slice(0,10),group:['1','2','3','4'].includes(String(x.group))?String(x.group):'',
          markIndex:Number.isInteger(x.markIndex)&&x.markIndex>=0&&x.markIndex<5?x.markIndex:null}))
        .filter(x=>x.amount===null||(Number.isFinite(x.amount)&&x.amount>0));
    }catch(e){return [];}
  }
  function element(type,text,className) {
    const e=document.createElement(type);
    if(text!==undefined)e.textContent=text;
    if(className)e.className=className;
    return e;
  }
  function renderFoods(meal){
    const root=$('[data-list="'+meal+'"]');
    root.replaceChildren();
    const list=readFoods(meal);
    if(!list.length) { root.appendChild(element('p','まだ食材を記録していません。','food-empty')); return; }
    list.forEach((food,index)=>{
      const row=element('div',undefined,'food-line');
      row.appendChild(element('span',food.name,'food-name'));
      const amount=food.amount===null?'量は未入力':food.amount+food.unit;
      const group=food.group?'／第'+food.group+'群':'';
      row.appendChild(element('span',amount+group,'food-amount'));
      const edit=element('label','群を修正','food-group-edit');
      const groupSelect=element('select');
      groupSelect.setAttribute('aria-label',food.name+'の食品群を修正');
      const groupOptions=[['','未選択'],['1','第1群'],['2','第2群'],['3','第3群'],['4','第4群']];
      for(const [value,label] of groupOptions){
        const option=element('option',label);
        option.value=value;
        groupSelect.appendChild(option);
      }
      groupSelect.value=food.group;
      groupSelect.addEventListener('change',()=>{
        const changedGroup=groupSelect.value;
        const updated=readFoods(meal);
        const selected=updated[index];
        if(!selected){renderFoods(meal);return;}
        if(changedGroup===selected.group&&selected.markIndex!==null)return;
        let nextMark=null;
        if(changedGroup){
          for(let n=0;n<5;n++){
            if(!markState(meal,changedGroup,n)){nextMark=n;break;}
          }
        }
        updated[index]={...selected,group:changedGroup,markIndex:nextMark};
        if(write(currentKey('foods:'+meal),JSON.stringify(updated))){
          renderFoods(meal);
          refreshMarks(meal);
          if(changedGroup&&nextMark===null)message('食品群を変更しました。第'+changedGroup+'群の○が5つ埋まっているため、自動チェックは付きません。');
          else message('食品群と○を修正しました。');
        }else{
          renderFoods(meal);
        }
      });
      edit.appendChild(groupSelect);
      const remove=element('button','削除');
      remove.type='button';remove.setAttribute('aria-label',food.name+'を削除');
      remove.addEventListener('click',()=>{
        const next=readFoods(meal);next.splice(index,1);
        if(write(currentKey('foods:'+meal),JSON.stringify(next))){
          renderFoods(meal);
          refreshMarks(meal);
        }
      });
      row.appendChild(remove);
      row.appendChild(edit);
      root.appendChild(row);
    });
  }
  function oldMarkName(meal,group,index) {
    if(index===0)return meal+'-group-'+group;
    if(index===1)return meal+'-extra-group-'+group;
    return meal+'-mark-'+(index+1)+'-group-'+group;
  }
  function linkedFood(meal,group,index){
    return readFoods(meal).some(x=>x.group===group&&x.markIndex===index);
  }
  function markState(meal,group,index) {
    const own=read(currentKey('mark:'+meal+':'+group+':'+index));
    const manuallyChecked=own===null?oldValue(oldMarkName(meal,group,index))==='checked':own==='1';
    return manuallyChecked||linkedFood(meal,group,index);
  }
  function refreshMarks(meal=null){
    $$('[data-mark]').forEach(box=>{
      const [m,group,indexValue]=box.dataset.mark.split(':');
      if(meal!==null&&meal!==m)return;
      const index=Number(indexValue);
      const automatic=linkedFood(m,group,index);
      box.checked=markState(m,group,index);
      // Auto-added circles must also be tappable for immediate correction.
      box.disabled=false;
      if(automatic)box.setAttribute('title','タップで○を解除できます。食品名と群の選択は残ります。');
      else box.removeAttribute('title');
    });
  }
  function populate(id) {
    recordId=id;
    const old=oldSlot(id);
    const date=old?oldDayDate(old):id;
    dateInput.value=dateValid(date)?date:'';
    for(const [meal] of meals){
      $('[data-memo="'+meal+'"]').value=inherited('memo:'+meal,meal+'-meal');
      $('[data-time="'+meal+'"]').value=inherited('time:'+meal);
      renderFoods(meal);
    }
    refreshMarks();
    write(PREFIX+'last-record',id);
    message('記録はこのブラウザに保存されます。');
    void refreshPhotos();
  }
  let slideHeightFrame=0;
  function fitActiveSlideHeight(){
    if(slideHeightFrame)return;
    slideHeightFrame=requestAnimationFrame(()=>{
      slideHeightFrame=0;
      const active=slides[activeSlide];if(!active)return;
      const h=Math.ceil(active.scrollHeight);
      if(h>0&&track.style.height!==h+'px')track.style.height=h+'px';
    });
  }
  if(typeof ResizeObserver==='function'){
    const slideObserver=new ResizeObserver(()=>fitActiveSlideHeight());
    slides.forEach(slide=>slideObserver.observe(slide));
  }
  function displaySlide(index) {
    activeSlide=Math.max(0,Math.min(slides.length-1,index));
    tabs.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===activeSlide)));
    $('#currentMealLabel').textContent=tabs[activeSlide]?.textContent||'四群早見表';
    $('#mealCounter').textContent=(activeSlide+1)+' / '+slides.length;
    $('#mealPrev').disabled=activeSlide===0;
    $('#mealNext').disabled=activeSlide===slides.length-1;
    $('.actions').hidden=activeSlide===0||activeSlide===slides.length-1;
    fitActiveSlideHeight();
  }
  function goToSlide(index,animate=true) {
    const next=Math.max(0,Math.min(slides.length-1,index));
    track.scrollTo({left:next*track.clientWidth,behavior:animate?'smooth':'auto'});
    displaySlide(next);
  }
  tabs.forEach((button,index)=>button.addEventListener('click',()=>goToSlide(index)));
  $('#mealPrev').addEventListener('click',()=>goToSlide(activeSlide-1));
  $('#mealNext').addEventListener('click',()=>goToSlide(activeSlide+1));
  let pending=false;
  track.addEventListener('scroll',()=>{
    if(pending)return;pending=true;
    requestAnimationFrame(()=>{pending=false;displaySlide(Math.round(track.scrollLeft/(track.clientWidth||1)));});
  },{passive:true});
  window.addEventListener('resize',()=>{track.scrollLeft=activeSlide*track.clientWidth;fitActiveSlideHeight();});
  dateInput.addEventListener('change',()=>{
    const date=dateInput.value;
    if(savingPhoto){dateInput.value=oldSlot(recordId)?oldDayDate(oldSlot(recordId)):recordId;photoMessage('写真の保存が終わってから日付を変更してください。');return;}
    if(!dateValid(date)){message('日付が正しくありません。',true);return;}
    const slot=oldSlot(recordId);
    if(slot&&!oldDayDate(slot)){
      if(write(PREFIX+'slot-date:'+slot,date))populate(recordId);
    }else {
      const found=oldSlot(date);
      populate(found?'slot'+found:date);
    }
    goToSlide(0,false);
  });
  $$('[data-memo]').forEach(input=>input.addEventListener('input',()=>write(currentKey('memo:'+input.dataset.memo),input.value)));
  $$('[data-time]').forEach(input=>input.addEventListener('change',()=>write(currentKey('time:'+input.dataset.time),input.value)));
  $$('[data-mark]').forEach(input=>input.addEventListener('change',()=>{
    const [meal,group,indexValue]=input.dataset.mark.split(':');
    const index=Number(indexValue);
    const key=currentKey('mark:'+meal+':'+group+':'+indexValue);
    if(!input.checked&&linkedFood(meal,group,index)){
      // Unlink exactly this circle; do not delete the food or alter its group.
      const foods=readFoods(meal);
      const target=foods.findIndex(food=>food.group===group&&food.markIndex===index);
      if(target<0){refreshMarks(meal);return;}
      const updated=foods.map((food,i)=>i===target?{...food,markIndex:null}:food);
      if(!write(currentKey('foods:'+meal),JSON.stringify(updated))){refreshMarks(meal);return;}
      // Explicit 0 also overrides an inherited/previous manual circle.
      if(!write(key,'0')){refreshMarks(meal);return;}
      renderFoods(meal);
      refreshMarks(meal);
      message('○を解除しました。食材と食品群は残っています。');
      return;
    }
    // Preserve the old behavior for manual toggles.
    if(linkedFood(meal,group,index)){refreshMarks(meal);return;}
    if(write(key,input.checked?'1':'0')){
      refreshMarks(meal);
      message(input.checked?'○を付けました。':'○を解除しました。');
    }else refreshMarks(meal);
  }));
  $$('[data-add-food]').forEach(button=>button.addEventListener('click',()=>{
    const meal=button.dataset.addFood;
    const nameInput=$('[data-food-name="'+meal+'"]'),amountInput=$('[data-food-amount="'+meal+'"]');
    const name=nameInput.value.trim(),raw=amountInput.value;
    const amount=raw===''?null:Number(raw);
    if(!name){message('食材名を入力してください。',true);nameInput.focus();return;}
    if(amount!==null&&(!Number.isFinite(amount)||amount<=0||amount>100000)){message('分量は正の数で入力してください。分からないときは空欄でも大丈夫です。',true);return;}
    const all=readFoods(meal);
    if(all.length>=100){message('1食につき100件まで記録できます。',true);return;}
    const unit=$('[data-food-unit="'+meal+'"]').value,group=$('[data-food-group="'+meal+'"]').value;
    let markIndex=null;
    if(group){
      // Keep existing manual marks and other food-linked marks untouched.
      for(let index=0;index<5;index++){
        if(!markState(meal,group,index)){markIndex=index;break;}
      }
    }
    all.push({name,amount,unit,group,markIndex});
    if(write(currentKey('foods:'+meal),JSON.stringify(all))){
      nameInput.value='';amountInput.value='';$('[data-food-group="'+meal+'"]').value='';
      renderFoods(meal);
      refreshMarks(meal);
      if(group&&markIndex===null)message('食材を保存しました。第'+group+'群の○が5つ埋まっているため、自動チェックは付きません。');
      else if(group)message('食材と第'+group+'群の○を連動して保存しました。');
      else message('食材を記録しました。');
    }
  }));
  $('#saveButton').addEventListener('click',()=>{
    let allSaved=true;
    for(const [meal] of meals){
      allSaved=write(currentKey('memo:'+meal),$('[data-memo="'+meal+'"]').value)&&allSaved;
      allSaved=write(currentKey('time:'+meal),$('[data-time="'+meal+'"]').value)&&allSaved;
    }
    for(const box of document.querySelectorAll('[data-mark]')){
      const [meal,group,index]=box.dataset.mark.split(':');
      if(!linkedFood(meal,group,Number(index)))
        allSaved=write(currentKey('mark:'+meal+':'+group+':'+index),box.checked?'1':'0')&&allSaved;
    }
    if(allSaved)message('記録を保存しました。');
  });
  function openPhotos(databaseName){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(Error('IndexedDB unavailable'));return;}
      const r=indexedDB.open(databaseName,1);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('photos'))r.result.createObjectStore('photos',{keyPath:'id'});};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Database open error'));r.onblocked=()=>reject(Error('Database blocked'));
    });
  }
  function photoTransaction(database,mode,callback){
    return new Promise((resolve,reject)=>{
      if(!database){resolve(null);return;}
      let request,value=null,tx;
      try{tx=database.transaction('photos',mode);request=callback(tx.objectStore('photos'));}
      catch(e){reject(e);return;}
      request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error||request.error||Error('Photo save error'));
      tx.onabort=()=>reject(tx.error||Error('Photo transaction aborted'));
    });
  }
  async function fetchPhoto(meal,key=recordId){
    const own=await photoTransaction(photoDB,'readonly',s=>s.get(key+':'+meal));
    if(own&&own.file instanceof Blob)return own;
    const n=oldSlot(key);
    return n?photoTransaction(oldDB,'readonly',s=>s.get(n+':'+meal)):null;
  }
  function revokeUrls(list){for(const url of list)URL.revokeObjectURL(url);list.length=0;}
  async function refreshPhotos(){
    const current=recordId,version=++photoVersion;
    revokeUrls(currentUrls);
    for(const [meal] of meals){
      $('#photo-view-'+meal).hidden=true;$('#photo-img-'+meal).removeAttribute('src');
    }
    if(!photoDB&&!oldDB)return;
    try{
      const result=await Promise.all(meals.map(async([meal])=>({meal,item:await fetchPhoto(meal,current)})));
      if(current!==recordId||version!==photoVersion)return;
      for(const {meal,item} of result){
        if(!item||!(item.file instanceof Blob))continue;
        const url=URL.createObjectURL(item.file);currentUrls.push(url);
        $('#photo-img-'+meal).src=url;$('#photo-view-'+meal).hidden=false;
      }
    }catch(e){photoMessage('写真の表示に失敗しました。',true);}
  }
  function setPhotoBusy(value){savingPhoto=value;$$('[data-photo]').forEach(x=>x.disabled=value||!photoDB);}
  $$('[data-photo]').forEach(input=>input.addEventListener('change',async()=>{
    const file=input.files&&input.files[0];
    if(!file)return;
    if(!file.type.startsWith('image/')){photoMessage('画像ファイルを選択してください。',true);input.value='';return;}
    setPhotoBusy(true);
    const record=recordId,meal=input.dataset.photo;
    try{
      await photoTransaction(photoDB,'readwrite',store=>store.put({id:record+':'+meal,file}));
      if(record===recordId)await refreshPhotos();
      photoMessage('写真を保存しました。');
    }catch(e){photoMessage('写真を保存できません。端末の空き容量をご確認ください。',true);}
    finally{input.value='';setPhotoBusy(false);}
  }));
  $$('[data-photo-remove]').forEach(button=>button.addEventListener('click',async()=>{
    if(!window.confirm('ステップ2の写真を削除しますか？ステップ1の写真は残ります。'))return;
    const record=recordId,meal=button.dataset.photoRemove;
    try{
      await photoTransaction(photoDB,'readwrite',store=>store.delete(record+':'+meal));
      if(record===recordId)await refreshPhotos();
      photoMessage('ステップ2の写真を削除しました。');
    }catch(e){photoMessage('写真を削除できませんでした。',true);}
  }));
  const preview=$('#previewDialog');
  $('#previewButton').addEventListener('click',()=>{
    const rows=$('#previewRows');rows.replaceChildren();
    for(const [meal,label] of meals){
      const section=element('section',undefined,'preview-meal');
      section.appendChild(element('h3',label));
      section.appendChild(element('p',$('[data-memo="'+meal+'"]').value||'（メモなし）'));
      const food=readFoods(meal);
      if(food.length){
        const ul=element('ul');
        for(const f of food)ul.appendChild(element('li',f.name+'　'+(f.amount===null?'分量未入力':f.amount+f.unit)+(f.group?'　第'+f.group+'群':'')));
        section.appendChild(ul);
      }
      const count=[1,2,3,4].map(group=>{
        const selected=$$('[data-mark]').filter(x=>x.dataset.mark.startsWith(meal+':'+group+':')&&x.checked).length;
        return '第'+group+'群 '+selected+'個';
      }).join('／');
      section.appendChild(element('p',count));
      rows.appendChild(section);
    }
    if(typeof preview.showModal==='function')preview.showModal();
  });
  $('#closePreview').addEventListener('click',()=>preview.close());
  const params=new URLSearchParams(location.search);
  const day=params.get('day'),date=params.get('date');
  const saved=read(PREFIX+'last-record');
  const initial=/^[123]$/.test(day||'')?'slot'+day:(dateValid(date)?(oldSlot(date)?'slot'+oldSlot(date):date):((saved&&/^(slot[1-3]|\d{4}-\d{2}-\d{2})$/.test(saved))?saved:dateToday()));
  populate(initial);displaySlide(0);
  Promise.allSettled([openPhotos('equineris-diary-step2-photos-v1'),openPhotos('equineris-paper-first3-photos-v1')]).then(results=>{
    photoDB=results[0].status==='fulfilled'?results[0].value:null;
    oldDB=results[1].status==='fulfilled'?results[1].value:null;
    setPhotoBusy(false);
    if(!photoDB)photoMessage('写真の追加は利用できません。メモと食品群チェックは使えます。',true);
    void refreshPhotos();
  });
})();
