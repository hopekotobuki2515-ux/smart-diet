<?php
declare(strict_types=1);
if (!defined('EQUINERIS_PUSH_CONTEXT')) { http_response_code(404); exit; }
function push_load(): void {
 $autoload=__DIR__.'/push-lib/vendor/autoload.php';
 if(PHP_VERSION_ID<80200 || !is_file($autoload) || !extension_loaded('curl') || !extension_loaded('mbstring') || !extension_loaded('openssl')) throw new RuntimeException('通知ライブラリを利用できません');
 require_once $autoload;
}
function push_read(string $path): ?array {
 if(!is_file($path))return null;
 $raw=file_get_contents($path);
 $data=is_string($raw)?json_decode($raw,true):null;
 if(!is_array($data))throw new RuntimeException('通知設定を読み込めません');
 return $data;
}
function push_keys(string $base): array {
 push_load();
 $path=$base.'/trainer-vapid.json';
 $lock=fopen($base.'/trainer-vapid.lock','c');
 if(!$lock)throw new RuntimeException('通知設定を保存できません');
 try {
  if(!flock($lock,LOCK_EX))throw new RuntimeException('通知設定を保存できません');
  $keys=push_read($path);
  if($keys===null){
   $keys=\Minishlink\WebPush\VAPID::createVapidKeys();
   persist($path,$keys);
  }
  if(!is_string($keys['publicKey']??null)||!is_string($keys['privateKey']??null))throw new RuntimeException('通知鍵が不正です');
  return $keys;
 } finally {flock($lock,LOCK_UN);fclose($lock);}
}
function push_subscription_valid(array $s): bool {
 $endpoint=$s['endpoint']??null;
 if(!is_string($endpoint)||strlen($endpoint)>2048||preg_match('/[\x00-\x20\x7f]/',$endpoint))return false;
 $parts=parse_url($endpoint);
 if(!is_array($parts)||($parts['scheme']??'')!=='https'||isset($parts['user'],$parts['pass'])||isset($parts['user'])||isset($parts['pass'])||isset($parts['fragment'])||isset($parts['port']))return false;
 $host=strtolower($parts['host']??'');
 // This feature is specifically for Apple devices. Never send requests to arbitrary hosts.
 if(!preg_match('/^(?:[a-z0-9-]+\.)+push\.apple\.com$/D',$host)||empty($parts['path']))return false;
 $keys=$s['keys']??null;
 if(!is_array($keys))return false;
 return is_string($keys['p256dh']??null)&&preg_match('/^[A-Za-z0-9_-]{87}$/D',$keys['p256dh'])===1
 &&is_string($keys['auth']??null)&&preg_match('/^[A-Za-z0-9_-]{22}$/D',$keys['auth'])===1;
}
function push_sender(array $keys, ?\Psr\Http\Client\ClientInterface $client=null): \Minishlink\WebPush\WebPush {
 $auth=['VAPID'=>['subject'=>'https://rakudadou.sakura.ne.jp/smart-diet/equineris/','publicKey'=>$keys['publicKey'],'privateKey'=>$keys['privateKey']]];
 $client=$client??new \GuzzleHttp\Client(['timeout'=>5,'connect_timeout'=>3,'allow_redirects'=>false]);
 $factory=new \GuzzleHttp\Psr7\HttpFactory();
 return new \Minishlink\WebPush\WebPush($auth,['TTL'=>3600,'urgency'=>'high'],$client,$factory,$factory);
}
function push_send(string $base,bool $test=false): bool {
 try{
  $sub=push_read($base.'/trainer-push-subscription.json');
  if($sub===null||!push_subscription_valid($sub))return false;
  push_load();
  $keys=push_read($base.'/trainer-vapid.json');
  if($keys===null)return false;
  $sender=push_sender($keys);
  $sub['contentEncoding']='aes128gcm';
  $report=$sender->sendOneNotification(\Minishlink\WebPush\Subscription::create($sub),json_encode(['test'=>$test],JSON_THROW_ON_ERROR));
  return $report->isSuccess();
 }catch(Throwable $e){error_log('EQUINERIS push delivery failed');return false;}
}
function push_action(string $action,string $base,string $hash): never {
 require_admin();
 try{
  if($action==='push_key'){output(['publicKey'=>push_keys($base)['publicKey']]);}
  if($action==='push_subscribe'){
   rate_limit($base,'push-subscribe',$hash,20);
   $sub=json_decode(field('subscription',3000),true);
   if(!is_array($sub)||!push_subscription_valid($sub))fail(400,'iPhoneの通知登録情報が正しくありません');
   push_keys($base);
   persist($base.'/trainer-push-subscription.json',['endpoint'=>$sub['endpoint'],'keys'=>['p256dh'=>$sub['keys']['p256dh'],'auth'=>$sub['keys']['auth']]]);
   output(['ok'=>true]);
  }
  if($action==='push_stop'){
   $sub=push_read($base.'/trainer-push-subscription.json');
   $endpoint=field('endpoint',2048);
   if($sub!==null && hash_equals($sub['endpoint'],$endpoint)) {
    if(!unlink($base.'/trainer-push-subscription.json'))fail(500,'通知設定を解除できません');
   }
   output(['ok'=>true]);
  }
  if($action==='push_test'){
   rate_limit($base,'push-test',$hash,10);
   if(!push_send($base,true))fail(503,'通知サービスに送信できませんでした。通知を再登録してください');
   output(['ok'=>true]);
  }
 } catch(Throwable $e){error_log('EQUINERIS push configuration failed');fail(503,'通知機能を利用できません');}
 fail(404,'操作が見つかりません');
}
