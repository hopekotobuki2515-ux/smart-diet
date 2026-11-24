'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const equineris=[
 'index.html','program-intro.html','program-choice.html','setup.html','learning.html',
 'record.html','diary-step1.html','diary-step2.html','diary-step3.html','food-groups.html',
 'point-allocation.html','textbook.html','measurements.html','record-history.html',
 'habit-check.html','week-1-goal.html','learning-data.js','diary-step2.js',
 'diary-step3.js','record-unified.js','group4-reference.js'
].map(n=>'equineris/'+n);
const shared=['food-search.html','nutrient-food-search.html','food-master.json','nutrient-master.json','nutrient-panel.js','program.css'];
const files=[...equineris,...shared];
const sites={
 github:'https://hopekotobuki2515-ux.github.io/smart-diet/',
 sakura:'https://rakudadou.sakura.ne.jp/smart-diet/'
};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,20);
const stripTags=s=>String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,110);
const label=s=>{
 const t=s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
 const h=s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'';
 return {title:stripTags(t),heading:stripTags(h)};
};
async function download(site,file){
 const url=new URL(file,sites[site]);
 const start=Date.now();
 try{
  const r=await fetch(url,{redirect:'follow',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
  const body=Buffer.from(await r.arrayBuffer());
  return {site,file,status:r.status,url:r.url,contentType:r.headers.get('content-type'),
   cache:r.headers.get('x-cache'),age:r.headers.get('age'),ms:Date.now()-start,body};
 }catch(e){return{site,file,error:String(e.message),ms:Date.now()-start}};
}
async function main(){
 const entries=[];
 const queue=files.flatMap(file=>Object.keys(sites).map(site=>({file,site})));
 let cursor=0;
 async function worker(){while(cursor<queue.length){const{file,site}=queue[cursor++];entries.push(await download(site,file));}}
 await Promise.all(Array.from({length:8},worker));
 const groups=[];
 for(const file of files){
  const local=fs.readFileSync(path.join(root,file));
  const github=entries.find(x=>x.file===file&&x.site==='github');
  const sakura=entries.find(x=>x.file===file&&x.site==='sakura');
  const localSha=sha(local),ghSha=github?.body?sha(github.body):null,skSha=sakura?.body?sha(sakura.body):null;
  const ghEq=ghSha===localSha&&github.status===200,skEq=skSha===localSha&&sakura.status===200;
  const out={
   file,localSha,github:{status:github.status,sha:ghSha,equal:ghEq,error:github.error||null,url:github.url},
   sakura:{status:sakura.status,sha:skSha,equal:skEq,error:sakura.error||null,url:sakura.url},
   githubAndSakuraMatch:!!ghSha&&ghSha===skSha&&github.status===200&&sakura.status===200
  };
  if(!ghEq||!skEq){
   function clue(remote){
    if(!remote?.body)return 'No response body';
    const t=remote.body.toString('utf8');
    const orig=local.toString('utf8');
    let i=0;while(i<Math.min(t.length,orig.length)&&t[i]===orig[i])i++;
    return {firstDiff:i,actualSnippet:t.slice(Math.max(0,i-35),i+100),expectedSnippet:orig.slice(Math.max(0,i-35),i+100),
     actualLabel:label(t),expectedLabel:label(orig)};
   }
   out.clues={github:ghEq?null:clue(github),sakura:skEq?null:clue(sakura)};
  }
  groups.push(out);
  console.log('FILE_COMPARE',JSON.stringify(out));
 }
 const mismatches=groups.filter(x=>!x.github.equal||!x.sakura.equal);
 const summary={files:files.length,githubMatched:groups.filter(x=>x.github.equal).length,
  sakuraMatched:groups.filter(x=>x.sakura.equal).length,bothHostsIdentical:groups.filter(x=>x.githubAndSakuraMatch).length,
  differences:mismatches.map(x=>x.file)};
 console.log('COMPARE_SUMMARY',JSON.stringify(summary));
 if(mismatches.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
