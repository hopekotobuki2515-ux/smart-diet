'use strict';
/* 食事ダイアリー（最初の3日間）用。既存の写真・メモ・○記録は一切変更しない。 */
(()=>{
 const mealLabels={breakfast:'朝食',lunch:'昼食',dinner:'夕食',snack:'間食'};
 const meals=Object.keys(mealLabels);
 const PREFIX='equineris:paper-first3:food-list:v1:';
 const state={breakfast:[],lunch:[],dinner:[],snack:[]};
 let foods=[],ready=false,activeDay=1,serial=0;
 const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ja')
  .replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))
  .replace(/[\s・･（）()\-]/g,'');
 const elm=(tag,text,cls)=>{
  const e=document.createElement(tag);
  if(text!==undefined)e.textContent=text;
  if(cls)e.className=cls;
  return e;
 };
 const key=()=>PREFIX+activeDay;
 const calc=(grams,onePoint)=>{
  const n=Number(grams);
  if(!Number.isFinite(n)||n<=0||n>10000||!Number.isFinite(onePoint)||onePoint<=0)return null;
  return {point:n/onePoint,kcal:n/onePoint*80};
 };
 const alias=food=>{
  if(food.name==='焼き竹輪')return 'ちくわ 竹輪 チクワ 焼きちくわ';
  if(food.category.includes('鶏肉')&&food.name==='むね・皮つき')return '鶏むね肉 鶏胸肉';
  return '';
 };
 function say(meal,text){
  document.getElementById('trial-food-status-'+meal).textContent=text;
 }
 function resize(){
  requestAnimationFrame(()=>{
   const track=document.getElementById('mealTrack');
   const tabs=[...document.querySelectorAll('[data-meal-tab]')];
   const i=Math.max(0,tabs.findIndex(x=>x.getAttribute('aria-pressed')==='true'));
   const slide=track.querySelectorAll('.meal-slide')[i];
   if(slide)track.style.height=slide.offsetHeight+'px';
  });
 }
 function save(){
  try{localStorage.setItem(key(),JSON.stringify(state));return true;}
  catch(e){meals.forEach(m=>say(m,'食品の保存に失敗しました。ブラウザの保存設定をご確認ください。'));return false;}
 }
 function renderList(meal){
  const list=document.getElementById('trial-food-list-'+meal);
  list.replaceChildren();
  const rows=state[meal];
  if(!rows.length){list.appendChild(elm('p','まだ食品はありません。検索して追加できます。','trial-food-empty'));resize();return;}
  rows.forEach((row,index)=>{
   const card=elm('div',undefined,'trial-food-saved');
   card.appendChild(elm('strong',row.name));
   card.appendChild(elm('span',row.group||'群未設定'));
   const bottom=elm('div',undefined,'trial-food-saved-bottom');
   const label=elm('label','重量（g）');
   const grams=elm('input');grams.type='number';grams.min='0.1';grams.max='10000';grams.step='0.1';
   grams.inputMode='decimal';grams.value=row.grams||'';grams.placeholder='任意';
   grams.setAttribute('aria-label',row.name+'の重量');
   label.appendChild(grams);
   const result=elm('output',row.grams?rowResult(row):'重量を入れると点数を表示');
   grams.addEventListener('input',()=>{
    const prev=row.grams;row.grams=grams.value;
    if(save())result.textContent=rowResult(row);
    else row.grams=prev;
   });
   const del=elm('button','削除');del.type='button';
   del.setAttribute('aria-label',row.name+'を'+mealLabels[meal]+'から削除');
   del.addEventListener('click',()=>{
    const removed=state[meal].splice(index,1);
    if(save())renderList(meal);
    else state[meal].splice(index,0,removed[0]);
   });
   bottom.appendChild(label);bottom.appendChild(result);bottom.appendChild(del);
   card.appendChild(bottom);list.appendChild(card);
  });
  resize();
 }
 function rowResult(row){
  if(!row.grams)return '重量未入力';
  const x=calc(row.grams,row.gramsPerPoint);
  return x?x.point.toFixed(2)+'点・'+x.kcal.toFixed(1)+'kcal':'重量を確認してください';
 }
 function load(){
  for(const m of meals)state[m]=[];
  try{
   const raw=localStorage.getItem(key());
   if(raw){
    const parsed=JSON.parse(raw);
    for(const m of meals){
     if(!Array.isArray(parsed[m]))continue;
     state[m]=parsed[m].filter(x=>x&&typeof x.name==='string'&&x.name.length<=120&&
       ['第1群','第2群','第3群','第4群'].includes(x.group)&&
       Number.isFinite(x.gramsPerPoint)&&x.gramsPerPoint>0).slice(0,60)
      .map(x=>({name:x.name,group:x.group,category:String(x.category||''),
       gramsPerPoint:x.gramsPerPoint,grams:typeof x.grams==='string'?x.grams:''}));
    }
   }
  }catch(e){for(const m of meals)say(m,'保存された食品リストを読み込めませんでした。');}
  meals.forEach(renderList);
 }
 function runSearch(meal){
  const query=document.getElementById('trial-food-query-'+meal);
  const area=document.getElementById('trial-food-results-'+meal);
  area.replaceChildren();
  if(!ready){say(meal,'食品マスターを読み込み中です。');return;}
  const words=query.value.trim().split(/[\s　]+/).map(norm).filter(Boolean);
  if(!words.length){say(meal,'食品名を入力して「検索する」を押してください。');resize();return;}
  const found=foods.filter(food=>{
   const hay=norm(food.name+' '+food.category+' '+alias(food));
   return words.every(w=>hay.includes(w));
  });
  const limited=found.slice(0,30);
  say(meal,found.length+'件見つかりました。'+(found.length>30?'先頭30件を表示しています。':''));
  if(!found.length){
   area.appendChild(elm('p','一致する食品がありません。別の名前でお試しください。','trial-food-empty'));
  }
  limited.forEach(food=>{
   const card=elm('div',undefined,'trial-food-result');
   card.appendChild(elm('strong',food.name));
   card.appendChild(elm('small',food.group+' ／ '+food.category+' ／ 1点='+food.gramsPerPoint+'g'));
   const button=elm('button','＋ '+mealLabels[meal]+'に追加');
   button.type='button';
   button.addEventListener('click',()=>{
    if(state[meal].length>=60){say(meal,'1食あたり60品まで登録できます。');return;}
    const entry={name:food.name,group:food.group,category:food.category,gramsPerPoint:food.gramsPerPoint,grams:''};
    state[meal].push(entry);
    if(!save()){state[meal].pop();return;}
    renderList(meal);
    say(meal,'「'+food.name+'」を'+mealLabels[meal]+'に追加・保存しました。');
   });
   card.appendChild(button);area.appendChild(card);
  });
  resize();
 }
 meals.forEach(meal=>{
  const input=document.getElementById('trial-food-query-'+meal);
  const button=document.getElementById('trial-food-search-'+meal);
  button.addEventListener('click',()=>runSearch(meal));
  input.addEventListener('keydown',event=>{
   if(event.key==='Enter'&&!event.isComposing){event.preventDefault();runSearch(meal);}
  });
  input.addEventListener('compositionend',()=>{});
  say(meal,'食品名を入力して「検索する」を押してください。');
 });
 document.querySelectorAll('[data-day]').forEach(tab=>tab.addEventListener('click',()=>{
  const current=document.querySelector('[data-day][aria-pressed="true"]');
  const day=Number(current?.dataset.day);
  if([1,2,3].includes(day)&&day!==activeDay){activeDay=day;load();}
 }));
 activeDay=Number(document.querySelector('[data-day][aria-pressed="true"]')?.dataset.day)||1;
 load();
 fetch('../food-master.json',{cache:'no-store'})
  .then(response=>{if(!response.ok)throw Error('HTTP '+response.status);return response.json();})
  .then(data=>{
   if(!Array.isArray(data.foods)||data.foods.length!==686||data.foods.some(x=>!x||
     typeof x.name!=='string'||typeof x.category!=='string'||
     !['第1群','第2群','第3群','第4群'].includes(x.group)||
     !Number.isFinite(x.gramsPerPoint)||x.gramsPerPoint<=0))throw Error('invalid food master');
   foods=data.foods;ready=true;
   meals.forEach(meal=>say(meal,'食品検索を使えます。686品目から検索できます。'));
  })
  .catch(()=>meals.forEach(meal=>say(meal,'食品マスターを取得できません。通信またはページの公開状態をご確認ください。')));
})();