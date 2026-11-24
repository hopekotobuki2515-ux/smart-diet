<?php
declare(strict_types=1);
/* Private helpers for EQUINERIS ChatGPT MCP and OAuth. Never execute directly. */
if(!defined('EQUINERIS_MCP_ENTRY')){http_response_code(403);exit;}
const EQUINERIS_MCP_URL='https://rakudadou.sakura.ne.jp/smart-diet/equineris/mcp/server.php';
const EQUINERIS_OAUTH_ISSUER='https://rakudadou.sakura.ne.jp';
const EQUINERIS_OAUTH_CALLBACK='https://chatgpt.com/connector_platform_oauth_redirect';
const EQUINERIS_OAUTH_SCOPE='equineris:review';
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
function ejson(array $payload,int $status=200):never{
 http_response_code($status);header('Content-Type: application/json; charset=utf-8');
 echo json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
}
function eerror(int $status,string $text):never{ejson(['error'=>$text],$status);}
function ehttps():void{
 if(getenv('EQUINERIS_LOCAL_TEST')==='1')return;
 $https=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')||($_SERVER['SERVER_PORT']??'')==='443';
 if(!$https)eerror(403,'HTTPS required');
}
function ehome():string{
 $home=realpath(dirname(__DIR__,4));
 if($home===false||!is_dir($home))eerror(503,'Private storage unavailable');
 $path=$home.'/equineris-private';
 $doc=realpath((string)($_SERVER['DOCUMENT_ROOT']??''));
 if($doc!==false&&($path===$doc||str_starts_with($path,$doc.'/')))eerror(503,'Private storage invalid');
 foreach([$path,$path.'/oauth',$path.'/oauth/code',$path.'/oauth/access',$path.'/oauth/refresh',$path.'/oauth/ratelimit'] as $d){
  if(!is_dir($d)&&!@mkdir($d,0700,true))eerror(503,'Private storage unavailable');
  @chmod($d,0700);
 }
 return $path;
}
function erecord(string $id):array{
 if(!preg_match('/^[a-f0-9]{32}$/D',$id))eerror(400,'Invalid record id');
 $path=ehome().'/requests/'.$id.'.json';
 if(!is_file($path))eerror(404,'Record not found');
 $val=json_decode((string)file_get_contents($path),true);
 if(!is_array($val))eerror(500,'Record unavailable');
 return $val;
}
function ewrite(string $path,array $value):void{
 $tmp=$path.'.'.bin2hex(random_bytes(8)).'.tmp';
 $json=json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
 if(file_put_contents($tmp,$json,LOCK_EX)===false)eerror(500,'Cannot save');
 @chmod($tmp,0600);
 if(!rename($tmp,$path)){@unlink($tmp);eerror(500,'Cannot save');}
}
function ehashkey(string $value):string{return hash('sha256',$value);}
function etokenfile(string $type,string $value):string{
 if(!in_array($type,['code','access','refresh'],true))eerror(500,'Invalid token type');
 return ehome().'/oauth/'.$type.'/'.ehashkey($value).'.json';
}
function econfig():string{
 $path=dirname(__DIR__).'/api/config.local.php';
 if(!is_file($path))eerror(503,'Trainer password not configured');
 $cfg=require $path;
 if(!is_array($cfg)||!is_string($cfg['trainer_password_hash']??null))eerror(503,'Trainer authentication not configured');
 $hash=$cfg['trainer_password_hash'];
 if(password_get_info($hash)['algo']===null)eerror(503,'Trainer authentication not configured');
 return $hash;
}
function eclient(string $id,string $redirect):bool{
 return preg_match('#^https://chatgpt\\.com/oauth/(?:client\\.json|[a-zA-Z0-9_-]{8,128}/client\\.json)$#D',$id)===1
  &&hash_equals(EQUINERIS_OAUTH_CALLBACK,$redirect);
}
function eratelimit(string $scope,int $limit=12):void{
 $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
 $path=ehome().'/oauth/ratelimit/'.hash('sha256',$scope.'|'.$ip).'.json';
 $h=@fopen($path,'c+');if(!$h||!flock($h,LOCK_EX))eerror(503,'Rate limiter unavailable');
 $raw=stream_get_contents($h);$v=is_string($raw)?json_decode($raw,true):null;
 $now=time();$start=(int)($v['start']??0);$count=(int)($v['count']??0);
 if($now-$start>=3600||$start>$now){$start=$now;$count=0;}
 if($count>=$limit){flock($h,LOCK_UN);fclose($h);eerror(429,'Too many attempts');}
 ftruncate($h,0);rewind($h);
 fwrite($h,json_encode(['start'=>$start,'count'=>$count+1]));fflush($h);
 flock($h,LOCK_UN);fclose($h);
}
function erequesttoken():?string{
 $auth=(string)($_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
 if($auth===''&&function_exists('getallheaders')){
  foreach(getallheaders() as $k=>$v){if(strtolower($k)==='authorization'&&is_string($v)){$auth=$v;break;}}
 }
 if(preg_match('/^Bearer ([A-Za-z0-9_-]{32,256})$/D',$auth,$m)!==1)return null;
 return $m[1];
}
function evalidate(?string $bearer):bool{
 if($bearer===null)return false;
 $f=etokenfile('access',$bearer);
 if(!is_file($f))return false;
 $t=json_decode((string)file_get_contents($f),true);
 return is_array($t)&&($t['exp']??0)>time()&&($t['aud']??'')===EQUINERIS_MCP_URL
  &&($t['scope']??'')===EQUINERIS_OAUTH_SCOPE
  &&is_string($t['password_hash_id']??null)
  &&hash_equals($t['password_hash_id'],ehashkey(econfig()));
}
function eissue(string $client):array{
 $access=bin2hex(random_bytes(32));$refresh=bin2hex(random_bytes(32));
 $base=['client_id'=>$client,'aud'=>EQUINERIS_MCP_URL,'scope'=>EQUINERIS_OAUTH_SCOPE,'password_hash_id'=>ehashkey(econfig())];
 ewrite(etokenfile('access',$access),$base+['exp'=>time()+3600]);
 ewrite(etokenfile('refresh',$refresh),$base+['exp'=>time()+2592000]);
 return ['access_token'=>$access,'token_type'=>'Bearer','expires_in'=>3600,'refresh_token'=>$refresh,'scope'=>EQUINERIS_OAUTH_SCOPE];
}
