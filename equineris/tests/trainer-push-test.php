<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('EQUINERIS_PUSH_CONTEXT',true);
require __DIR__.'/../api/trainer-push.php';
push_load();
function check(bool $ok,string $message): void { if(!$ok)throw new RuntimeException($message); }
$keys=\Minishlink\WebPush\VAPID::createVapidKeys();
$clientKeys=\Minishlink\WebPush\VAPID::createVapidKeys();
$secret=rtrim(strtr(base64_encode(random_bytes(16)),'+/','-_'),'=');
$sub=['endpoint'=>'https://web.push.apple.com/test-only','keys'=>['p256dh'=>$clientKeys['publicKey'],'auth'=>$secret],'contentEncoding'=>'aes128gcm'];
check(push_subscription_valid($sub),'Valid Apple subscription rejected');
foreach(['https://localhost/test','https://web.push.apple.com.evil.example/test','http://web.push.apple.com/test','https://web.push.apple.com:444/test','https://user@web.push.apple.com/test'] as $url){$invalid=$sub;$invalid['endpoint']=$url;check(!push_subscription_valid($invalid),'Unsafe endpoint accepted');}
$mock=new \GuzzleHttp\Handler\MockHandler([new \GuzzleHttp\Psr7\Response(201)]);
$history=[];
$stack=\GuzzleHttp\HandlerStack::create($mock);
$stack->push(\GuzzleHttp\Middleware::history($history));
$client=new \GuzzleHttp\Client(['handler'=>$stack]);
$sender=push_sender($keys,$client);
$report=$sender->sendOneNotification(\Minishlink\WebPush\Subscription::create($sub),'{"test":true}');
check($report->isSuccess(),'Mock push failed');
check(count($history)===1,'Expected exactly one outbound request');
$request=$history[0]['request'];
check($request->getUri()->getHost()==='web.push.apple.com','Wrong push host');
check($request->getHeaderLine('Content-Encoding')==='aes128gcm','Wrong encryption encoding');
check(str_starts_with(strtolower($request->getHeaderLine('Authorization')),'vapid '),'Missing VAPID authorization');
check(!str_contains((string)$request->getBody(),'{"test":true}'),'Payload was not encrypted');
echo "Offline Web Push checks passed\n";
