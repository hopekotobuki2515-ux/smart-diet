<?php
declare(strict_types=1);
define('EQUINERIS_MCP_ENTRY',true);
require __DIR__.'/common.php';
ehttps();
$action=(string)($_GET['action']??'');
if($action==='authorize'){
 ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
 session_name('equineris_mcp_oauth');
 session_set_cookie_params(['lifetime'=>0,'path'=>getenv('EQUINERIS_LOCAL_TEST')==='1'?'/mcp/':'/smart-diet/equineris/mcp/','secure'=>getenv('EQUINERIS_LOCAL_TEST')!=='1','httponly'=>true,'samesite'=>'Lax']);
 session_start();
 if($_SERVER['REQUEST_METHOD']==='GET'){
  $client=(string)($_GET['client_id']??'');$redirect=(string)($_GET['redirect_uri']??'');
  $response=(string)($_GET['response_type']??'');$challenge=(string)($_GET['code_challenge']??'');
  $method=(string)($_GET['code_challenge_method']??'');
  $scope=trim((string)($_GET['scope']??''));$resource=(string)($_GET['resource']??EQUINERIS_MCP_URL);
  $state=(string)($_GET['state']??'');
  if(!eclient($client,$redirect)||$response!=='code'||$method!=='S256'
   ||preg_match('/^[A-Za-z0-9_-]{43,128}$/D',$challenge)!==1
   ||$resource!==EQUINERIS_MCP_URL||strlen($state)>1024
   ||($scope!==''&&!in_array($scope,[EQUINERIS_OAUTH_SCOPE,EQUINERIS_OAUTH_SCOPE.' offline_access','offline_access '.EQUINERIS_OAUTH_SCOPE],true))){
   eerror(400,'Invalid OAuth authorization request');
  }
  $_SESSION['auth_request']=['client'=>$client,'redirect'=>$redirect,'challenge'=>$challenge,'state'=>$state,'created'=>time()];
  $_SESSION['oauth_csrf']=bin2hex(random_bytes(32));
 }elseif($_SERVER['REQUEST_METHOD']==='POST'){
  $req=$_SESSION['auth_request']??null;
  if(!is_array($req)||time()-(int)$req['created']>600)eerror(400,'Authorization expired. Retry connecting.');
  $csrf=(string)($_POST['csrf']??'');
  if(!hash_equals((string)($_SESSION['oauth_csrf']??''),$csrf))eerror(403,'Invalid form confirmation');
  eratelimit('oauth-login',10);
  $password=$_POST['password']??null;
  if(!is_string($password)||strlen($password)>500||!password_verify($password,econfig())){
   http_response_code(401);header('Content-Type: text/html; charset=utf-8');
   echo '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>接続できません</title><p>パスワードが正しくありません。画面を戻して再入力してください。</p></html>';
   exit;
  }
  if(($_POST['approve']??'')!=='yes')eerror(403,'Consent required');
  $code=bin2hex(random_bytes(32));
  $payload=['client'=>$req['client'],'redirect'=>$req['redirect'],'challenge'=>$req['challenge'],'created'=>time(),'resource'=>EQUINERIS_MCP_URL];
  ewrite(etokenfile('code',$code),$payload);
  unset($_SESSION['auth_request'],$_SESSION['oauth_csrf']);
  session_regenerate_id(true);
  $uri=$req['redirect'].'?'.http_build_query(['code'=>$code,'state'=>$req['state'],'iss'=>EQUINERIS_OAUTH_ISSUER],'','&',PHP_QUERY_RFC3986);
  header('Location: '.$uri,true,302);exit;
 }else{header('Allow: GET, POST');eerror(405,'Method not allowed');}
 $csrf=htmlspecialchars($_SESSION['oauth_csrf'],ENT_QUOTES,'UTF-8');
 header('Content-Type: text/html; charset=utf-8');
 echo '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EQUINERIS｜ChatGPTへの接続</title><style>body{font-family:system-ui,sans-serif;background:#f8f9f6;max-width:560px;margin:40px auto;padding:20px;line-height:1.7}main{background:#fff;border:1px solid #ddd;border-radius:16px;padding:24px}input{box-sizing:border-box;width:100%;padding:12px;font-size:16px;border:1px solid #999;border-radius:8px}button{display:block;width:100%;background:#386b4d;color:#fff;border:0;border-radius:8px;padding:14px;margin-top:18px;font-size:16px}small{color:#555}</style></head><body><main><h1>EQUINERISをChatGPTに接続</h1><p>トレーナーのパスワードを入力して、ChatGPTによる食事記録と写真の確認を許可します。</p><p><strong>許可される操作：</strong>食事記録の一覧・内容・写真の閲覧と、承認したトレーナーコメントの送信。</p><p><small>外部のOpenAI APIキーや追加契約は不要です。記録と写真はChatGPTが確認するために送信されます。ChatGPTに接続する本人の操作以外でパスワードを共有しないでください。</small></p><form method="post" autocomplete="off"><input type="hidden" name="csrf" value="'.$csrf.'"><label>トレーナーパスワード<input type="password" name="password" required autocomplete="current-password"></label><input type="hidden" name="approve" value="yes"><button type="submit">接続を許可する</button></form></main></body></html>';
 exit;
}
if($action==='token'){
 if($_SERVER['REQUEST_METHOD']!=='POST'){header('Allow: POST');eerror(405,'Method not allowed');}
 $grant=(string)($_POST['grant_type']??'');
 $client=(string)($_POST['client_id']??'');
 $resource=(string)($_POST['resource']??EQUINERIS_MCP_URL);
 if($resource!==EQUINERIS_MCP_URL||strlen($client)>300)eerror(400,'invalid_request');
 header('Pragma: no-cache');
 if($grant==='authorization_code'){
  $code=(string)($_POST['code']??'');$redirect=(string)($_POST['redirect_uri']??'');$verifier=(string)($_POST['code_verifier']??'');
  if(strlen($code)!==64||!ctype_xdigit($code)||!eclient($client,$redirect)
   ||preg_match('/^[A-Za-z0-9_.~-]{43,128}$/D',$verifier)!==1)eerror(400,'invalid_grant');
  $path=etokenfile('code',$code);$used=$path.'.consumed.'.bin2hex(random_bytes(6));
  if(!is_file($path)||!@rename($path,$used))eerror(400,'invalid_grant');
  $payload=json_decode((string)file_get_contents($used),true);@unlink($used);
  if(!is_array($payload)||time()-(int)($payload['created']??0)>300
   ||!hash_equals((string)($payload['client']??''),$client)
   ||!hash_equals((string)($payload['redirect']??''),$redirect)
   ||($payload['resource']??'')!==EQUINERIS_MCP_URL)eerror(400,'invalid_grant');
  $computed=rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=');
  if(!hash_equals((string)($payload['challenge']??''),$computed))eerror(400,'invalid_grant');
  ejson(eissue($client));
 }
 if($grant==='refresh_token'){
  $refresh=(string)($_POST['refresh_token']??'');
  if(strlen($refresh)!==64||!ctype_xdigit($refresh)||!eclientid($client))eerror(400,'invalid_grant');
  $path=etokenfile('refresh',$refresh);$used=$path.'.consumed.'.bin2hex(random_bytes(6));
  if(!is_file($path)||!@rename($path,$used))eerror(400,'invalid_grant');
  $payload=json_decode((string)file_get_contents($used),true);@unlink($used);
  if(!is_array($payload)||($payload['exp']??0)<time()||($payload['client_id']??'')!==$client
   ||($payload['aud']??'')!==EQUINERIS_MCP_URL
   ||!hash_equals((string)($payload['password_hash_id']??''),ehashkey(econfig())))eerror(400,'invalid_grant');
  ejson(eissue($client));
 }
 eerror(400,'unsupported_grant_type');
}
eerror(404,'Unknown OAuth action');
