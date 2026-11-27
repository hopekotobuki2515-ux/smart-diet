'use strict';
(()=>{
const $=id=>document.getElementById(id);
const panel=$('reviewPanel'),status=$('pushStatus'),enable=$('pushEnable'),test=$('pushTest'),stop=$('pushStop');
let registration=null,publicKey=null,csrf='',ready=false,busy=false,loading=false,registered=false;
const message=text=>{status.textContent=text};
function buttons(){const available=ready&&!busy&&!panel.hidden;enable.disabled=!available;test.disabled=!available||!registered;stop.disabled=!available||!registered}
async function call(action,fields={}){
 const body=new FormData();for(const [key,value] of Object.entries(fields))body.append(key,value);
 const response=await fetch('./api/review.php?action='+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'X-CSRF-Token':csrf},body});
 const data=await response.json();if(!response.ok)throw Error(data.error||'通信エラー');return data;
}
function keyBytes(key){const base=key.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(base+'='.repeat((4-base.length%4)%4)),c=>c.charCodeAt(0))}
async function prepare(){
 if(loading||panel.hidden)return;loading=true;ready=false;registered=false;buttons();
 try{
  if(!(navigator.standalone===true||matchMedia('(display-mode: standalone)').matches)){message('Safariの共有メニューからホーム画面に追加し、追加したアイコンから起動してください。');return}
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){message('この端末ではWebプッシュ通知を利用できません。');return}
  const stateResponse=await fetch('./api/review.php?action=status',{credentials:'same-origin',cache:'no-store'});
  const state=await stateResponse.json();if(!stateResponse.ok||!state.trainer)throw Error('ログインしてください');
  csrf=state.csrf;
  const key=await call('push_key');publicKey=keyBytes(key.publicKey);
  await navigator.serviceWorker.register('./trainer-push-sw.js',{scope:'./'});
  registration=await navigator.serviceWorker.ready;
  if(!registration.active?.scriptURL.endsWith('/trainer-push-sw.js'))throw Error('通知アプリを再起動してください');
  const existing=await registration.pushManager.getSubscription();
  ready=true;
  // Always ask the server to register this device again after login; registration is single-device.
  registered=false;
  message(existing?'通知を受け取る端末を確認するため「通知を有効にする」を押してください。':'「通知を有効にする」を押して、iPhoneの通知を許可してください。');
 }catch(e){message('通知設定を準備できません：'+e.message)}finally{loading=false;buttons()}
}
async function run(work){if(busy||!ready||panel.hidden)return;busy=true;buttons();try{await work()}catch(e){message(e.message||'通知設定に失敗しました。')}finally{busy=false;buttons()}}
enable.addEventListener('click',()=>run(async()=>{
 // Request permission in the direct click, before other asynchronous work.
 const permission=await Notification.requestPermission();
 if(permission!=='granted'){message('通知が許可されていません。iPhoneの設定で通知を許可してください。');return}
 let sub=await registration.pushManager.getSubscription();
 if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
 await call('push_subscribe',{subscription:JSON.stringify(sub.toJSON())});
 registered=true;message('このiPhoneを登録しました。「テスト通知」で受信を確認してください。');
}));
test.addEventListener('click',()=>run(async()=>{
 await call('push_test');message('通知サービスにテスト通知を送信しました。iPhoneに表示されるか確認してください。');
}));
stop.addEventListener('click',()=>run(async()=>{
 const sub=await registration.pushManager.getSubscription();
 if(sub){await call('push_stop',{endpoint:sub.endpoint});await sub.unsubscribe()}
 registered=false;message('この端末への通知を停止しました。');
}));
new MutationObserver(()=>{if(panel.hidden){ready=false;registered=false;buttons()}else prepare()}).observe(panel,{attributes:true,attributeFilter:['hidden']});
if(!panel.hidden)prepare();
})();
