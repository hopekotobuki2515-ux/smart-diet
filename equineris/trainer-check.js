'use strict';
(()=>{
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),api='./api/review.php';
const meals=[['breakfast','朝食'],['lunch','昼食'],['dinner','夕食'],['snack','間食']];
const setStatus=(id,s)=>{$(id).textContent=s};
const now=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const safelyRead=k=>{try{return localStorage.getItem(k)||''}catch(e){return''}};
let csrf='',previewUrls=[],autoPhotos=[];
const day=Number(params.get('day'));const stage=['1','2','3'].includes(params.get('stage'))?params.get('stage'):'1';
$('stage').value=stage;
const dayDate=day>=1&&day<=3?safelyRead('equineris:paper-first3:v1:'+day+':date'):'';
$('recordDate').value=params.get('date')||dayDate||now();
const ref=stage==='2'?'diary-step2.html':stage==='3'?'diary-step3.html':'record.html';
$('backLink').href='./'+ref+(day>=1&&day<=3?'?day='+day:'');
try{const saved=JSON.parse(safelyRead('equineris:registration:v1'));if(saved&&typeof saved.name==='string')$('clientName').value=saved.name}catch(e){}
function clientKey(){let key=safelyRead('equineris:trainer-review-token:v1');if(/^[a-f0-9]{64}$/.test(key))return key;
if(!crypto?.getRandomValues)throw Error('安全な通信環境が必要です');const arr=new Uint8Array(32);crypto.getRandomValues(arr);key=Array.from(arr,v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem('equineris:trainer-review-token:v1',key);return key}
async function server(action,data=null){const opt=data?{method:'POST',headers:{'X-CSRF-Token':csrf},body:data}:{credentials:'same-origin'};const res=await fetch(api+'?action='+encodeURIComponent(action),{credentials:'same-origin',cache:'no-store',...opt});const answer=await res.json().catch(()=>({error:'応答形式が正しくありません'}));if(!res.ok)throw Error(answer.error||'通信エラー '+res.status);return answer}
function fields(stage,slot){const prefix=stage==='1'?(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(slot)?'equineris:diary-step1:v1:entry:'+slot+':':'equineris:paper-first3:v1:'+slot+':'):stage==='2'?'equineris:diary-step2:v1:entry:'+slot+':':'equineris:diary-step3:v1:entry:'+slot+':';
return meals.map(([id,label])=>{const memo=safelyRead(prefix+(stage==='1'?id+'-meal':'memo:'+id));const food=stage==='1'?'':safelyRead(prefix+'foods:'+id);let details='';try{const data=JSON.parse(food);if(Array.isArray(data))details=data.map(x=>(x.name||'')+(x.amount||x.grams||'')+(x.unit||'')).join('、')}catch(e){}return label+'：'+[memo,details].filter(Boolean).join('／')}).filter(x=>!x.endsWith('：')).join('\n')}
async function photo(dbName,key){return new Promise(resolve=>{if(typeof indexedDB==='undefined'){resolve(null);return}const req=indexedDB.open(dbName,1);req.onerror=()=>resolve(null);req.onupgradeneeded=()=>{req.transaction?.abort();resolve(null)};req.onsuccess=()=>{const db=req.result;if(!db.objectStoreNames.contains('photos')){db.close();resolve(null);return}const tx=db.transaction('photos','readonly'),get=tx.objectStore('photos').get(key);get.onsuccess=()=>{db.close();resolve(get.result?.file instanceof Blob?get.result.file:null)};get.onerror=()=>{db.close();resolve(null)}}})}
async function loadSaved(){autoPhotos=[];for(const u of previewUrls)URL.revokeObjectURL(u);previewUrls=[];$('photoGrid').replaceChildren();const stage=$('stage').value;
let key1=day>=1&&day<=3?String(day):null;
for(let n=1;n<=3;n++)if(safelyRead('equineris:paper-first3:v1:'+n+':date')===$('recordDate').value)key1=String(n);
const slot=key1?'slot'+key1:$('recordDate').value;
if(stage==='1'){$('summary').value='';}
$('summary').value=fields(stage,stage==='1'?(key1||$('recordDate').value):slot);
for(const [id,label] of meals){const candidates=stage==='3'?[["equineris-diary-step3-photos-v1",slot+':'+id],["equineris-diary-step2-photos-v1",slot+':'+id],["equineris-paper-first3-photos-v1",(key1||$('recordDate').value)+':'+id]]:stage==='2'?[["equineris-diary-step2-photos-v1",slot+':'+id],["equineris-paper-first3-photos-v1",(key1||$('recordDate').value)+':'+id]]:[["equineris-paper-first3-photos-v1",(key1||$('recordDate').value)+':'+id]];
let f=null;for(const [db,k] of candidates){if(k.startsWith(':'))continue;f=await photo(db,k);if(f)break}if(!f)continue;
const ext=f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg';const file=new File([f],id+'.'+ext,{type:f.type});autoPhotos.push(file);
const figure=document.createElement('div');figure.className='photo';const img=document.createElement('img'),caption=document.createElement('small');img.alt=label+'の保存写真';const url=URL.createObjectURL(f);previewUrls.push(url);img.src=url;caption.textContent=label;figure.append(img,caption);$('photoGrid').append(figure)
}
setStatus('loadStatus',autoPhotos.length+'枚の写真と食事内容を読み込みました。内容を確認してから送信してください。')}
async function replies(){try{const f=new FormData();f.append('client_key',clientKey());const res=await server('mine',f);const root=$('replies');root.replaceChildren();for(const x of res.items){const div=document.createElement('div');div.className='list-entry';const h=document.createElement('strong');h.textContent=x.date+' ／ STEP'+x.stage+' ／ '+(x.status==='reviewed'?'確認済み':'確認待ち');const p=document.createElement('div');p.textContent=x.comment||'トレーナーの確認をお待ちください。';div.append(h,p);root.append(div)}if(!res.items.length)root.textContent='まだ確認依頼はありません。'}catch(e){setStatus('sendStatus','返信を確認できません：'+e.message)}}
$('refresh').addEventListener('click',replies);$('loadRecord').addEventListener('click',()=>loadSaved().catch(e=>setStatus('loadStatus',e.message)));
$('stage').addEventListener('change',()=>loadSaved().catch(()=>{}));
$('requestForm').addEventListener('submit',async e=>{e.preventDefault();if(!$('consent').checked)return;const manual=[...$('manualPhotos').files];const photos=[...autoPhotos,...manual];if(photos.length>4){setStatus('sendStatus','写真は最大4枚です。');return}if(photos.some(f=>f.size>5*1024*1024)){setStatus('sendStatus','写真は1枚5MB以内です。');return}
const data=new FormData();for(const [k,v] of Object.entries({client_key:clientKey(),name:$('clientName').value.trim(),date:$('recordDate').value,stage:$('stage').value,note:$('comment').value,summary:$('summary').value,consent:'yes'}))data.append(k,v);for(const f of photos)data.append('photos[]',f,f.name);
$('send').disabled=true;setStatus('sendStatus','送信中…');try{await server('submit',data);setStatus('sendStatus','食事記録を送信しました。返信はこの画面で確認できます。');$('responseCard').hidden=false;await replies()}catch(e){setStatus('sendStatus','送信できません：'+e.message)}finally{$('send').disabled=false}
});
(async()=>{try{const status=await server('status');csrf=status.csrf;if(!status.configured){setStatus('serviceStatus','さくらサーバー側の設定が未完了です。写真や記録は送信していません。');return}$('requestForm').hidden=false;$('responseCard').hidden=false;setStatus('serviceStatus','サーバーに接続しました。内容を確認してから任意で送信できます。');await loadSaved();await replies()}catch(e){setStatus('serviceStatus','サーバーへの接続がありません。GitHub PagesではPHPが動作しないため、さくらへの設置後に利用できます。写真や記録は送信していません。')}})();
})();
