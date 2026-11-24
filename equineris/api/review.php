<?php
declare(strict_types=1);
/* EQUINERIS trainer photo review API. Deploy only to Sakura over HTTPS. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
function fail(int $code, string $message): never { http_response_code($code); echo json_encode(['error'=>$message],JSON_UNESCAPED_UNICODE); exit; }
function output(array $data): never { echo json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); exit; }
function field(string $key, int $max=2000): string { $s=$_POST[$key]??''; if(!is_string($s))fail(400,'入力形式が不正です'); if(strlen($s)>$max*4)fail(413,'入力が長すぎます'); return trim($s); }
function valid_day(string $date): bool { if(!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$date,$m))return false;return checkdate((int)$m[2],(int)$m[3],(int)$m[1]); }
function valid_client(string $token): string { if(!preg_match('/^[a-f0-9]{64}$/D',$token))fail(401,'利用者キーが正しくありません');return hash('sha256',$token); }
function require_admin(): void { if(empty($_SESSION['equineris_trainer_authenticated']))fail(403,'トレーナー認証が必要です'); }
function json_file(string $path): array { if(!is_file($path))fail(404,'指定された記録がありません');$raw=file_get_contents($path);$value=$raw===false?null:json_decode($raw,true);if(!is_array($value))fail(500,'保存済みデータが不正です');return $value; }
function persist(string $path, array $data): void {
 $encoded=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
 $tmp=$path.'.'.bin2hex(random_bytes(8)).'.tmp';
 if(file_put_contents($tmp,$encoded,LOCK_EX)===false)fail(500,'保存できませんでした');
 @chmod($tmp,0600);if(!rename($tmp,$path)){@unlink($tmp);fail(500,'保存できませんでした');}
}
function file_id(string $id): string {if(!preg_match('/^[a-f0-9]{32}$/D',$id))fail(400,'記録IDが不正です');return $id;}
function secret(): string {
 $file=__DIR__.'/config.local.php';if(!is_file($file))fail(503,'トレーナーチェックはサーバー設定前です');
 $cfg=require $file;
 if(!is_array($cfg)||empty($cfg['trainer_password_hash'])||!is_string($cfg['trainer_password_hash'])||password_get_info($cfg['trainer_password_hash'])['algo']===null)fail(503,'管理者認証が未設定です');
 return $cfg['trainer_password_hash'];
}
function rate_limit(string $base, string $scope, string $passwordHash, int $limit): void {
 $host=(string)($_SERVER['REMOTE_ADDR']??'unknown');$key=hash('sha256',$scope.'|'.$host.'|'.$passwordHash);
 $path=$base.'/rate/'.$key.'.txt';$h=@fopen($path,'c+');if(!$h)fail(503,'送信回数を確認できません');
 if(!flock($h,LOCK_EX)){fclose($h);fail(503,'送信回数を確認できません');}
 $data=stream_get_contents($h);$entry=is_string($data)?json_decode($data,true):null;
 $now=time();$start=is_array($entry)?(int)($entry['start']??0):0;$count=is_array($entry)?(int)($entry['count']??0):0;
 if($now-$start>=3600||$start>$now){$start=$now;$count=0;}
 if($count>=$limit){flock($h,LOCK_UN);fclose($h);fail(429,'送信回数が上限です。時間を置いてください');}
 ftruncate($h,0);rewind($h);fwrite($h,json_encode(['start'=>$start,'count'=>$count+1]));fflush($h);flock($h,LOCK_UN);fclose($h);
}
function data_dir(): string {
 // Deployed at ~/www/smart-diet/equineris/api: private data at ~/equineris-private, outside ~/www.
 $base=dirname(__DIR__,4).'/equineris-private';
 $root=realpath(dirname(__DIR__,4));
 if(!$root || !is_dir($root))fail(503,'データ領域の設定が不正です');
 $documentRoot=realpath((string)($_SERVER['DOCUMENT_ROOT']??''));
 if($documentRoot && (str_starts_with($base,$documentRoot.'/')||$base===$documentRoot))fail(503,'保存先が公開領域内です');
 foreach ([$base,$base.'/requests',$base.'/photos',$base.'/rate'] as $dir){if(!is_dir($dir)&&!@mkdir($dir,0700,true))fail(503,'保存領域を作成できません');@chmod($dir,0700);}
 return $base;
}
$secure=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')||($_SERVER['SERVER_PORT']??'')==='443';
if(!$secure && getenv('EQUINERIS_LOCAL_TEST')!=='1') fail(403,'HTTPSが必要です');
ini_set('session.use_strict_mode','1');
ini_set('session.use_only_cookies','1');
session_name('equineris_trainer');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Strict']);
session_start();
if(!isset($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));
$action=(string)($_GET['action']??'status');
if($action==='status'&&$_SERVER['REQUEST_METHOD']==='GET'){
 $configured=false;
 if(is_file(__DIR__.'/config.local.php')){
  $cfg=require __DIR__.'/config.local.php';
  $configured=is_array($cfg)&&isset($cfg['trainer_password_hash'])&&is_string($cfg['trainer_password_hash'])&&password_get_info($cfg['trainer_password_hash'])['algo']!==null;
 }
 output(['configured'=>$configured,'trainer'=>!empty($_SESSION['equineris_trainer_authenticated']),'csrf'=>$_SESSION['csrf']]);
}
// All non-status actions require a configured backend.
$passwordHash=secret();
$base=data_dir();
if($action==='photo'&&$_SERVER['REQUEST_METHOD']==='GET'){
 require_admin();$id=file_id((string)($_GET['id']??''));$idx=(int)($_GET['n']??-1);
 $rec=json_file($base.'/requests/'.$id.'.json');$photos=$rec['photos']??[];
 if($idx<0||$idx>=count($photos))fail(404,'写真が見つかりません');
 $name=$photos[$idx]['name']??'';
 if(!preg_match('/^[a-f0-9]{32}-[0-3]\.(jpg|png|webp)$/D',$name))fail(500,'保存済み画像名が不正です');
 $file=$base.'/photos/'.$name;if(!is_file($file))fail(404,'写真が見つかりません');
 header('Content-Type: '.$photos[$idx]['mime']);header('Content-Disposition: inline; filename="photo"');
 header('Content-Length: '.filesize($file));readfile($file);exit;
}
if($_SERVER['REQUEST_METHOD']!=='POST')fail(405,'操作が許可されていません');
$csrf=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
if(!hash_equals($_SESSION['csrf'],$csrf))fail(403,'送信の確認に失敗しました。再読み込みしてください');
$origin=(string)($_SERVER['HTTP_ORIGIN']??'');
if($origin!==''){$requestHost=($_SERVER['HTTP_HOST']??'');$own=($secure?'https':'http').'://'.$requestHost;if(!hash_equals($own,$origin))fail(403,'別サイトからの送信は禁止されています');}
if($action==='login'){
 rate_limit($base,'login',$passwordHash,30);
 $password=field('password',500);
 if(!isset($_SESSION['login_failures']))$_SESSION['login_failures']=0;
 if($_SESSION['login_failures']>=8)fail(429,'試行回数が上限です。ブラウザを閉じて時間を置いてください');
 if(!password_verify($password,$passwordHash)){$_SESSION['login_failures']++;fail(401,'パスワードが正しくありません');}
 session_regenerate_id(true);$_SESSION['equineris_trainer_authenticated']=true;$_SESSION['login_failures']=0;$_SESSION['csrf']=bin2hex(random_bytes(32));output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
if($action==='logout'){unset($_SESSION['equineris_trainer_authenticated']);output(['ok'=>true]);}
if($action==='submit'){
 rate_limit($base,'submit',$passwordHash,30);
 if(field('consent',10)!=='yes')fail(400,'共有への同意が必要です');
 $client=valid_client(field('client_key',64));
 $name=field('name',80);$day=field('date',10);$stage=field('stage',1);$note=field('note',1500);$summary=field('summary',4000);
 if($name===''||!valid_day($day)||!in_array($stage,['1','2','3'],true))fail(400,'入力内容を確認してください');
 if($note===''&&$summary===''&&empty($_FILES['photos']))fail(400,'写真または食事内容を入力してください');
 $files=$_FILES['photos']??null;$stored=[];
 if($files!==null){
  if(!is_array($files['name']??null)||count($files['name'])>4)fail(400,'写真は最大4枚です');
  foreach($files['name'] as $i=>$filename){
   $err=$files['error'][$i]??UPLOAD_ERR_NO_FILE;
   if($err===UPLOAD_ERR_NO_FILE)continue;
   if($err!==UPLOAD_ERR_OK)fail(413,'画像のアップロードに失敗しました');
   if(($files['size'][$i]??0)>5*1024*1024)fail(413,'写真は1枚5MB以内です');
   $tmp=$files['tmp_name'][$i]??'';if(!is_uploaded_file($tmp))fail(400,'写真を確認できません');
   $info=@getimagesize($tmp);$mime=$info['mime']??'';
   if(!in_array($mime,['image/jpeg','image/png','image/webp'],true)||($info[0]??0)>6000||($info[1]??0)>6000)fail(415,'画像形式またはサイズが未対応です');
   $stored[]=['tmp'=>$tmp,'mime'=>$mime,'ext'=>['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'][$mime]];
  }
 }
 // Fixed limits are essential for shared-server capacity.
 $id=bin2hex(random_bytes(16));$photos=[];$moved=[];
 foreach($stored as $i=>$p){$file=$id.'-'.$i.'.'.$p['ext'];$dest=$base.'/photos/'.$file;
  if(!move_uploaded_file($p['tmp'],$dest)){foreach($moved as $old)@unlink($old);fail(500,'写真を保存できません');}
  @chmod($dest,0600);$moved[]=$dest;$photos[]=['name'=>$file,'mime'=>$p['mime']];
 }
 $record=['id'=>$id,'client'=>$client,'name'=>$name,'date'=>$day,'stage'=>(int)$stage,'note'=>$note,'summary'=>$summary,'photos'=>$photos,'created'=>gmdate('c'),'status'=>'waiting','comment'=>'','reviewed'=>null,'ai_consent'=>field('ai_consent',5)==='yes','ai_draft'=>null,'ai_generated_at'=>null];
 persist($base.'/requests/'.$id.'.json',$record);output(['ok'=>true,'id'=>$id,'status'=>'waiting']);
}
if($action==='mine'){
 $client=valid_client(field('client_key',64));$items=[];
 foreach(glob($base.'/requests/*.json')?:[] as $path){$r=json_file($path);if(hash_equals($r['client']??'',$client))$items[]=['id'=>$r['id'],'date'=>$r['date'],'stage'=>$r['stage'],'status'=>$r['status'],'comment'=>$r['comment'],'created'=>$r['created'],'reviewed'=>$r['reviewed']];}
 usort($items,fn($a,$b)=>strcmp($b['created'],$a['created']));output(['items'=>array_slice($items,0,100)]);
}
if($action==='list'){
 require_admin();$items=[];
 foreach(glob($base.'/requests/*.json')?:[] as $path){$r=json_file($path);unset($r['client']);$items[]=$r;}
 usort($items,fn($a,$b)=>strcmp($b['created'],$a['created']));
 $aiPath=__DIR__.'/ai-config.local.php';$aiReady=false;
 if(is_file($aiPath)){$aiCfg=require $aiPath;$aiReady=is_array($aiCfg)&&is_string($aiCfg['api_key']??null)&&trim($aiCfg['api_key'])!=='';}
 output(['items'=>array_slice($items,0,100),'ai_configured'=>$aiReady]);
}
if($action==='ai_generate'){
 require_admin();require __DIR__.'/ai-review.php';
}
if($action==='comment'){
 require_admin();$id=file_id(field('id',32));$comment=field('comment',2000);
 if($comment==='')fail(400,'コメントを入力してください');
 $path=$base.'/requests/'.$id.'.json';$r=json_file($path);$r['status']='reviewed';$r['comment']=$comment;$r['reviewed']=gmdate('c');persist($path,$r);output(['ok'=>true,'id'=>$id]);
}
fail(404,'操作が見つかりません');
