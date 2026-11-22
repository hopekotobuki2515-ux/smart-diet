/* EQUINERIS STEP2 weight goal calculator.
   Uses the existing week-1 goal storage key; never modifies registration or daily measurements. */
'use strict';
(() => {
 const REG_KEY='equineris:registration:v1';
 const GOAL_KEY='equineris:week1:goal:v1';
 const RATES=[5,8,10,15];
 const round=n=>Math.round(n*10+1e-9)/10;
 const fixed=n=>round(n).toFixed(1);
 const element=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 function registration(){
  try{
   const row=JSON.parse(localStorage.getItem(REG_KEY)||'null');
   if(!row||typeof row.weightKg!=='string')return null;
   const weight=Number(row.weightKg);
   if(!Number.isFinite(weight)||weight<10||weight>500)return null;
   return weight;
  }catch(e){return null;}
 }
 function mount(container){
  const start=registration();
  const root=element('section','goal-calculator');
  root.id='textbookGoalCalculator';
  root.setAttribute('aria-label','登録時の体重から3か月後の減量目標を計算');
  root.append(element('h4','','3か月後の目標体重を計算しましょう'));
  root.append(element('p','goal-calc-description','登録時の体重をもとに減量率を選ぶと、目標体重が自動入力されます。手動でも変更できます。'));
  root.append(element('p','goal-calc-start',start===null?'スタート時の体重：未登録':'スタート時の体重：'+fixed(start)+' kg'));
  const rates=element('div','goal-calc-rates');
  rates.setAttribute('role','group');
  rates.setAttribute('aria-label','3か月後の目標減量率');
  const rateButtons=[];
  const label=element('label','goal-calc-label','3か月後に目指す体重（kg）');
  const input=element('input','goal-calc-input');
  input.id='textbookTargetWeight';input.type='number';input.inputMode='decimal';input.step='0.1';input.min='0.1';
  input.placeholder='減量率を選ぶか、目標体重を入力';
  input.disabled=start===null;
  label.append(input);
  const outcome=element('p','goal-calc-result','減量目標：—');
  outcome.setAttribute('aria-live','polite');
  const save=element('button','goal-calc-save','目標体重を記録する');
  save.id='textbookSaveGoal';save.type='button';save.disabled=true;
  const notice=element('p','goal-calc-status','');
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  let selectedRate=null,existingDataCorrupt=false;
  const message=(text,error=false)=>{notice.textContent=text;notice.dataset.error=String(error);};
  const highlight=rate=>{
   selectedRate=rate;
   for(const btn of rateButtons)btn.setAttribute('aria-pressed',String(rate===Number(btn.dataset.rate)));
  };
  const valid=()=>{
   if(start===null||input.value.trim()===''||!input.checkValidity())return false;
   const number=Number(input.value);
   return Number.isFinite(number)&&number>0&&number<start;
  };
  const draw=()=>{
   save.disabled=!valid()||existingDataCorrupt;
   if(!valid()){outcome.textContent='減量目標：—';return;}
   const target=Number(input.value),loss=start-target;
   const shownRate=selectedRate===null?fixed(loss/start*100):String(selectedRate);
   outcome.textContent='減量幅：'+fixed(loss)+' kg ／ 減量率：約'+shownRate+'%';
  };
  for(const rate of RATES){
   const btn=element('button','',rate+'%');
   btn.type='button';btn.dataset.rate=String(rate);btn.disabled=start===null;
   btn.setAttribute('aria-pressed','false');
   btn.addEventListener('click',()=>{
    if(start===null)return;
    highlight(rate);
    input.value=fixed(start*(1-rate/100));
    message('');draw();
   });
   rateButtons.push(btn);rates.append(btn);
  }
  input.addEventListener('input',()=>{highlight(null);message('');draw();});
  if(start!==null){
   try{
    const raw=localStorage.getItem(GOAL_KEY);
    const previous=raw===null?null:JSON.parse(raw);
    if(previous!==null&&(!previous||typeof previous!=='object'||Array.isArray(previous)))throw Error('Bad saved goal');
    if(previous&&Number(previous.startWeightKg)===start){
     const target=Number(previous.goalWeightKg);
     if(Number.isFinite(target)&&target>0&&target<start){
      input.value=String(target);
      const rate=previous.selectedRatePercent;
      if(RATES.includes(rate)&&fixed(start*(1-rate/100))===fixed(target))highlight(rate);
      message('保存済みの目標体重を表示しています。');
     }
    }else if(previous&&Number(previous.startWeightKg)!==start){
     message('登録時の体重が変わっています。目標体重を設定し直してください。');
    }
   }catch(e){
    existingDataCorrupt=true;
    message('以前の目標記録を読み込めません。既存データは上書きしていません。',true);
   }
  }else{
   message('初回登録の体重が必要です。先に登録してください。');
  }
  draw();
  save.addEventListener('click',()=>{
   if(!valid()||existingDataCorrupt){message('現在の体重より小さい目標体重を確認してください。',true);return;}
   if(registration()!==start){
    message('登録体重が変わっています。教材を開き直してください。',true);return;
   }
   const target=round(Number(input.value));
   if(target<=0||target>=start){message('目標体重を確認してください。',true);return;}
   try{
    const raw=localStorage.getItem(GOAL_KEY);
    const previous=raw===null?null:JSON.parse(raw);
    if(previous!==null&&(!previous||typeof previous!=='object'||Array.isArray(previous)))throw Error('Bad goal record');
    const existing=previous&&Number(previous.startWeightKg)===start?previous:{};
    const loss=start-target;
    const row={...existing,startWeightKg:start,goalWeightKg:target,lossKg:round(loss),
     selectedRatePercent:selectedRate,actualRatePercent:round(loss/start*100),
     recordedAt:new Date().toISOString()};
    localStorage.setItem(GOAL_KEY,JSON.stringify(row));
    message('目標体重を記録しました。体重・腹囲の記録ページにも反映されます。');
   }catch(e){
    message('目標体重を保存できませんでした。ブラウザの保存設定を確認してください。',true);
   }
  });
  root.append(rates,label,outcome,save,notice);
  container.append(root);
 }
 // STEP2の7ページ目の隣に置く、過去の体重記録専用カード。
 // 既存の目標キー内の weightAt20Kg / longestWeightKg を再利用する。
 function mountHistory(container){
  const root=element('div','goal-calculator');
  root.id='textbookWeightHistory';
  root.setAttribute('aria-label','過去の体重を記録する');
  const prompt=element('p','goal-calc-description','覚えている体重をkgで入力してください。わからない項目は空欄で大丈夫です。');
  const makeField=(id,title)=>{
   const label=element('label','goal-calc-label',title+'（kg）');
   const input=element('input','goal-calc-input');
   input.id=id;input.type='number';input.inputMode='decimal';
   input.min='0.1';input.step='0.1';
   input.placeholder='覚えていなければ空欄でOK';
   label.append(input);
   return {label,input};
  };
  const at20=makeField('textbookWeightAt20','20歳の時の体重');
  const longest=makeField('textbookLongestWeight','最も長く維持していた体重');
  const save=element('button','goal-calc-save','以前の体重を記録する');
  save.id='textbookSaveWeightHistory';save.type='button';save.disabled=true;
  const notice=element('p','goal-calc-status','');
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const message=(text,error=false)=>{notice.textContent=text;notice.dataset.error=String(error);};
  function readGoal(){
   const raw=localStorage.getItem(GOAL_KEY);
   if(raw===null)return null;
   const row=JSON.parse(raw);
   if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid goal storage');
   return row;
  }
  let blocked=false;
  try{
   const saved=readGoal();
   if(saved){
    for(const [input,key] of [[at20.input,'weightAt20Kg'],[longest.input,'longestWeightKg']]){
     const n=Number(saved[key]);
     if(saved[key]!==null&&saved[key]!==undefined&&Number.isFinite(n)&&n>0)input.value=String(saved[key]);
    }
    if(at20.input.value!==''||longest.input.value!=='')message('以前記録した体重を表示しています。');
   }
  }catch(e){
   blocked=true;
   message('保存済みデータを読み込めません。既存データは上書きしません。',true);
  }
  const numberOrNull=input=>input.value.trim()===''?null:Number(input.value);
  function canSave(){
   if(blocked)return false;
   const a=numberOrNull(at20.input),b=numberOrNull(longest.input);
   if(a===null&&b===null)return false;
   for(const [value,input] of [[a,at20.input],[b,longest.input]]){
    if(value!==null&&(!Number.isFinite(value)||value<=0||!input.checkValidity()))return false;
   }
   return true;
  }
  const update=()=>{save.disabled=!canSave();};
  at20.input.addEventListener('input',()=>{message('');update();});
  longest.input.addEventListener('input',()=>{message('');update();});
  update();
  save.addEventListener('click',()=>{
   if(!canSave()){message('体重は0より大きい数値をkgで入力してください。',true);return;}
   try{
    const stored=readGoal();
    const currentWeight=registration();
    if(!stored&&currentWeight===null){
     message('初回登録の体重を確認できません。先に登録してください。',true);return;
    }
    const row={
     ...(stored||{startWeightKg:currentWeight}),
     weightAt20Kg:numberOrNull(at20.input)===null?null:round(numberOrNull(at20.input)),
     longestWeightKg:numberOrNull(longest.input)===null?null:round(numberOrNull(longest.input))
    };
    localStorage.setItem(GOAL_KEY,JSON.stringify(row));
    message('以前の体重を記録しました。');
   }catch(e){message('保存できませんでした。既存データは変更していません。',true);}
  });
  root.append(prompt,at20.label,longest.label,save,notice);
  container.append(root);
 }
 window.EquinerisGoalCalculator=Object.freeze({mount,mountHistory});
})();