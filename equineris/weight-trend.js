/* EQUINERIS: saved daily body-weight trend. Data is read-only here. */
'use strict';
(()=>{
 const NS='http://www.w3.org/2000/svg';
 const KEY='equineris:body-measurements:v1';
 const round1=n=>(Math.round(n*10+1e-9)/10).toFixed(1);
 const dateIsValid=s=>{
  if(typeof s!=='string'||!(/^\d{4}-\d{2}-\d{2}$/).test(s))return false;
  const n=Date.parse(s+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;
 };
 const make=(tag,attrs={},text)=>{
  const node=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
  if(text!==undefined)node.textContent=text;
  return node;
 };
 function points(rows){
  if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('Invalid weight records');
  return Object.entries(rows)
   .filter(([date,row])=>dateIsValid(date)&&row&&typeof row==='object'&&!Array.isArray(row)&&
    typeof row.weight==='number'&&Number.isFinite(row.weight)&&row.weight>=10&&row.weight<=500)
   .sort((a,b)=>a[0].localeCompare(b[0]))
   .map(([date,row])=>({date,weight:row.weight}));
 }
 function render(svg,status,rows){
  const records=points(rows);
  svg.replaceChildren();
  status.dataset.error='false';
  if(!records.length){
   status.textContent='体重を記録すると、ここに折れ線グラフが表示されます。';
   svg.setAttribute('aria-label','体重の記録はまだありません');
   return {count:0};
  }
  const width=360,height=220,left=43,right=12,top=16,bottom=34;
  const pw=width-left-right,ph=height-top-bottom;
  const weights=records.map(r=>r.weight);
  const smallest=weights.reduce((a,b)=>Math.min(a,b),Infinity);
  const largest=weights.reduce((a,b)=>Math.max(a,b),-Infinity);
  const pad=Math.max(1,(largest-smallest)*0.16);
  const lower=Math.max(0,Math.floor((smallest-pad)*2)/2);
  const upper=Math.ceil((largest+pad)*2)/2;
  const range=Math.max(1,upper-lower);
  const first=Date.parse(records[0].date+'T00:00:00Z');
  const last=Date.parse(records[records.length-1].date+'T00:00:00Z');
  const x=d=>records.length===1?left+pw/2:left+(Date.parse(d+'T00:00:00Z')-first)/(last-first)*pw;
  const y=w=>top+(upper-w)/range*ph;
  const short=d=>String(Number(d.slice(5,7)))+'/'+String(Number(d.slice(8,10)));
  svg.append(make('title',{},'体重の推移'));
  svg.append(make('desc',{},'保存済みの体重を日付順に示したグラフ。記録は'+records.length+'件です。'));
  for(let i=0;i<=4;i++){
   const value=lower+range*i/4,py=y(value);
   svg.append(make('line',{x1:left,y1:py,x2:width-right,y2:py,stroke:'#e1eae2','stroke-width':1}));
   svg.append(make('text',{x:left-7,y:py+4,'text-anchor':'end','font-size':11,fill:'#526b5c'},round1(value)));
  }
  svg.append(make('line',{x1:left,y1:top,x2:left,y2:height-bottom,stroke:'#9bb4a1','stroke-width':1.5}));
  svg.append(make('line',{x1:left,y1:height-bottom,x2:width-right,y2:height-bottom,stroke:'#9bb4a1','stroke-width':1.5}));
  if(records.length===1){
   svg.append(make('text',{x:left+pw/2,y:height-10,'text-anchor':'middle','font-size':12,fill:'#526b5c'},short(records[0].date)));
  }else{
   svg.append(make('text',{x:left,y:height-10,'text-anchor':'start','font-size':12,fill:'#526b5c'},short(records[0].date)));
   svg.append(make('text',{x:width-right,y:height-10,'text-anchor':'end','font-size':12,fill:'#526b5c'},short(records[records.length-1].date)));
  }
  const positions=records.map(r=>({x:x(r.date),y:y(r.weight),...r}));
  if(positions.length>=2){
   const d=positions.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
   svg.append(make('path',{d,fill:'none',stroke:'#285d4a','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
  }
  for(const p of positions){
   const dot=make('circle',{cx:p.x.toFixed(2),cy:p.y.toFixed(2),r:3.6,fill:'#fff','stroke':'#285d4a','stroke-width':2});
   dot.append(make('title',{},p.date+'：'+round1(p.weight)+' kg'));
   svg.append(dot);
  }
  const firstWeight=weights[0],lastWeight=weights[weights.length-1],diff=lastWeight-firstWeight;
  const diffText=diff>0?'＋'+round1(diff):diff<0?'－'+round1(Math.abs(diff)):'0.0';
  status.textContent=records.length===1?
   records[0].date+'：'+round1(firstWeight)+' kgを記録しています。2件目から折れ線で表示します。':
   records[0].date+' '+round1(firstWeight)+' kg → '+records[records.length-1].date+' '+round1(lastWeight)+' kg（変化 '+diffText+' kg）';
  svg.setAttribute('aria-label','体重の推移：'+records.length+'件、最初'+round1(firstWeight)+'kg、最新'+round1(lastWeight)+'kg');
  return {count:records.length,first:firstWeight,last:lastWeight};
 }
 window.EquinerisWeightTrend=Object.freeze({KEY,points,render});
})();