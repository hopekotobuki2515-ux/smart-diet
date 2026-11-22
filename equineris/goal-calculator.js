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
 window.EquinerisGoalCalculator=Object.freeze({mount});
})();