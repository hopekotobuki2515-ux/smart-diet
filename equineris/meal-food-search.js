'use strict';
/* Independent meal food entries, preserved separately from the existing weight/checkbox diary.
   Existing 686-item master and 1point=80kcal remain authoritative. */
(()=>{
 const mealNames={breakfast:'朝食',lunch:'昼食',dinner:'夕食',snack:'間食・飲み物'};
 const mealKeys=Object.keys(mealNames);
 const prefix='equineris:weeks1-3:meal-foods:v1:';
 const week=document.getElementById('weekSelect'),day=document.getElementById('daySelect');
 const query=document.getElementById('foodSearchQuery');
 const group=document.getElementById('foodSearchGroup');
 const searchButton=document.getElementById('foodSearchButton');
 const target=document.getElementById('foodSearchMeal');
 const results=document.getElementById('foodSearchResults');
 const status=document.getElementById('foodSearchCount');
 const more=document.getElementById('foodSearchMore');
 let foods=[],hits=[],limit=12,sequence=0,loaded=false;
 let entries=Object.fromEntries(mealKeys.map(id=>[id,[]]));
 const norm=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ja')
  .replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))
  .replace(/[\s・･（）()\-]/g,'');
 const mealKey=()=>prefix+'w'+week.value+':d'+day.value;
 const aliases=food=>{
  if(food.name==='焼き竹輪')return 'ちくわ 竹輪 チクワ 焼きちくわ';
  if(food.category.includes('鶏肉')){
   if(food.name==='むね・皮つき')return '鶏むね肉 鶏胸肉';
   if(food.name==='皮・むね')return '鶏皮';
   if(food.name==='ささ身')return '鶏ささみ';
  }
  return '';
 };
 const calc=(grams,gramsPerPoint)=>{
  const weight=Number(grams);
  if(grams===''||grams===null||grams===undefined)return null;
  if(!Number.isFinite(weight)||weight<=0||weight>10000||!Number.isFinite(gramsPerPoint)||gramsPerPoint<=0)return null;
  return {points:weight/gramsPerPoint,kcal:weight/gramsPerPoint*80};
 };
 const make=(tag,cls,text)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(text!==undefined)element.textContent=text;
  return element;
 };
 function switchToMeal(meal){
  const indices={breakfast:1,lunch:2,dinner:3,snack:4};
  document.querySelector('[data-tab="'+indices[meal]+'"]').click();
 }
 function report(message){status.textContent=message;}
 function validEntry(value){
  return value&&typeof value.name==='string'&&value.name.trim().length>0&&value.name.length<=120&&
   (value.group===''||['第1群','第2群','第3群','第4群'].includes(value.group))&&
   (value.gramsPerPoint===null||(typeof value.gramsPerPoint==='number'&&Number.isFinite(value.gramsPerPoint)&&value.gramsPerPoint>0));
 }
 function load(){
  entries=Object.fromEntries(mealKeys.map(meal=>[meal,[]]));
  try{
   const stored=localStorage.getItem(mealKey());
   if(stored){
    const data=JSON.parse(stored);
    mealKeys.forEach(meal=>{
     if(Array.isArray(data[meal]))entries[meal]=data[meal].filter(validEntry).slice(0,100).map(item=>({
      id:String(item.id??''),name:item.name,group:item.group,category:String(item.category||''),
      gramsPerPoint:item.gramsPerPoint,grams:typeof item.grams==='string'?item.grams:''
     }));
    });
   }
  }catch(err){report('食品の保存データを読み込めませんでした。');}
  mealKeys.forEach(renderMeal);
 }
 function persist(){
  try{localStorage.setItem(mealKey(),JSON.stringify(entries));return true;}
  catch(err){report('食品を保存できませんでした。ブラウザの容量・設定をご確認ください。');return false;}
 }
 function fmt(entry){
  const value=calc(entry.grams,entry.gramsPerPoint);
  if(value)return value.points.toFixed(2)+'点 ／ '+value.kcal.toFixed(1)+'kcal';
  if(!entry.gramsPerPoint)return '点数計算なし（手入力）';
  if(entry.grams==='')return '重量を入力すると点数を表示';
  return '正しい重量を入力してください';
 }
 function renderMeal(meal){
  const container=document.querySelector('[data-meal-list="'+meal+'"]');
  container.replaceChildren();
  if(!entries[meal].length){
   container.appendChild(make('p','meal-food-empty','まだ食品はありません。検索して追加するか、下の欄から登録できます。'));
   return;
  }
  for(const entry of entries[meal]){
   const card=make('div','meal-food-entry');
   const name=make('strong','meal-food-name',entry.name);
   const meta=make('span','meal-food-meta',entry.group?entry.group+' ／ '+entry.category:'食品群未設定・手入力');
   const controls=make('div','meal-food-entry-controls');
   const label=make('label','meal-food-weight-label','重量');
   const grams=make('input','meal-food-weight');
   grams.type='number';grams.inputMode='decimal';grams.min='0.1';grams.max='10000';grams.step='0.1';
   grams.value=entry.grams;grams.placeholder='任意';
   grams.setAttribute('aria-label',entry.name+'の重量（g）');
   label.appendChild(grams);
   label.appendChild(make('span','', 'g'));
   const calculation=make('output','meal-food-calculation',fmt(entry));
   grams.addEventListener('input',()=>{
    entry.grams=grams.value;
    calculation.textContent=fmt(entry);
    persist();
   });
   const remove=make('button','meal-food-remove','削除');
   remove.type='button';remove.setAttribute('aria-label',entry.name+'を'+mealNames[meal]+'から削除');
   remove.addEventListener('click',()=>{
    entries[meal]=entries[meal].filter(x=>x!==entry);
    if(persist())renderMeal(meal);
   });
   controls.appendChild(label);controls.appendChild(calculation);controls.appendChild(remove);
   card.appendChild(name);card.appendChild(meta);card.appendChild(controls);
   container.appendChild(card);
  }
 }
 function add(meal,food,grams=''){
  if(!mealKeys.includes(meal)||entries[meal].length>=100){report('この食事にはこれ以上追加できません。');return false;}
  const record={id:String(Date.now())+'-'+(++sequence),name:food.name,
   group:food.group||'',category:food.category||'',gramsPerPoint:food.gramsPerPoint??null,grams:String(grams||'')};
  if(!validEntry(record)){report('食品情報に誤りがあるため追加できません。');return false;}
  entries[meal].push(record);
  if(!persist()){entries[meal].pop();return false;}
  renderMeal(meal);
  report(mealNames[meal]+'に「'+food.name+'」を追加しました。');
  switchToMeal(meal);
  return true;
 }
 mealKeys.forEach(meal=>{
  const finder=document.querySelector('[data-find-meal="'+meal+'"]');
  finder.addEventListener('click',()=>{
   target.value=meal;group.value='';query.value='';hits=[];limit=12;
   results.replaceChildren();more.hidden=true;report('食品名を入力し、「検索する」を押してください。');
   document.querySelector('[data-tab="5"]').click();
   query.focus();
  });
  const input=document.querySelector('[data-manual-name="'+meal+'"]');
  document.querySelector('[data-add-manual="'+meal+'"]').addEventListener('click',()=>{
   const name=input.value.trim();
   if(!name){input.focus();return;}
   if(add(meal,{name,group:'',category:'手入力',gramsPerPoint:null}))input.value='';
  });
  input.addEventListener('keydown',event=>{
   if(event.key==='Enter'&&!event.isComposing){
    event.preventDefault();
    document.querySelector('[data-add-manual="'+meal+'"]').click();
   }
  });
 });
 function renderResults(){
  results.replaceChildren();
  for(const food of hits.slice(0,limit)){
   const card=make('article','food-search-item');
   const title=make('h3','',food.name);
   const meta=make('p','',food.group+' ／ '+food.category+' ／ 1点='+food.gramsPerPoint+'g');
   const row=make('div','food-search-calc');
   const label=make('label','','重量');
   const grams=make('input','');
   grams.type='number';grams.inputMode='decimal';grams.min='0.1';grams.max='10000';grams.step='0.1';
   grams.placeholder='例：100';grams.setAttribute('aria-label',food.name+'の重量（g）');
   label.appendChild(grams);label.appendChild(make('span','','g'));
   const output=make('output','','重量を入力できます');
   grams.addEventListener('input',()=>{
    const result=calc(grams.value,food.gramsPerPoint);
    output.textContent=result?result.points.toFixed(2)+'点 ／ '+result.kcal.toFixed(1)+'kcal':
      grams.value?'0より大きい重量を入力':'重量を入力できます';
   });
   row.appendChild(label);row.appendChild(output);
   const button=make('button','food-search-add',mealNames[target.value]+'に追加');
   button.type='button';
   button.addEventListener('click',()=>{
    if(grams.value!==''&&!calc(grams.value,food.gramsPerPoint)){
     report('重量は0より大きい数値（10000g以下）で入力してください。');return;
    }
    add(target.value,food,grams.value);
   });
   card.appendChild(title);card.appendChild(meta);card.appendChild(row);card.appendChild(button);
   results.appendChild(card);
  }
  more.hidden=limit>=hits.length;
  report(hits.length?hits.length+'件見つかりました。'+Math.min(limit,hits.length)+'件を表示しています。':
   '該当する食品がありません。手入力でも登録できます。');
 }
 function search(){
  if(!loaded){report('食品マスターの読み込み中です。');return;}
  const words=query.value.trim().split(/[\s　]+/).map(norm).filter(Boolean),selectedGroup=group.value;
  if(!words.length&&!selectedGroup){hits=[];results.replaceChildren();more.hidden=true;
   report('食品名を入力するか、食品群を選んでください。');return;}
  hits=foods.filter(food=>{
   if(selectedGroup&&food.group!==selectedGroup)return false;
   const hay=norm(food.name+' '+food.category+' '+food.group+' '+aliases(food));
   return words.every(word=>hay.includes(word));
  });
  limit=12;renderResults();
 }
 searchButton.addEventListener('click',search);
 query.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.isComposing){event.preventDefault();search();}
 });
 query.addEventListener('input',event=>{if(!event.isComposing)search();});
 query.addEventListener('compositionend',search);
 group.addEventListener('change',search);
 target.addEventListener('change',()=>{if(hits.length)renderResults();});
 more.addEventListener('click',()=>{limit+=12;renderResults();});
 week.addEventListener('change',load);
 day.addEventListener('change',load);
 document.getElementById('prevDay').addEventListener('click',load);
 document.getElementById('nextDay').addEventListener('click',load);
 load();
 fetch('../food-master.json',{cache:'no-store'})
  .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json();})
  .then(data=>{
   if(!Array.isArray(data.foods)||data.foods.length!==686||
     data.foods.some(food=>!food||typeof food.name!=='string'||typeof food.category!=='string'||
     !mealKeys.length||!['第1群','第2群','第3群','第4群'].includes(food.group)||
     !Number.isFinite(food.gramsPerPoint)||food.gramsPerPoint<=0))throw new Error('無効な食品マスター');
   foods=data.foods;loaded=true;
   report('686品目を読み込みました。食品名を入力して検索できます。');
   if(query.value.trim())search();
  }).catch(()=>report('食品マスターを読み込めませんでした。通信を確認してページを再読み込みしてください。'));
})();