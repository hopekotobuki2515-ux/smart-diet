#!/usr/bin/env python3
"""EQUINERIS ChatGPT MCP OAuth integration tests; synthetic data only."""
import base64, hashlib, json, os, pathlib, re, subprocess, time
from io import BytesIO
from urllib.parse import parse_qs, urlparse
import requests
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[1]/'equineris'
config = root/'api/config.local.php'
password = 'mcp-integration-only-trainer-password'
password_hash = subprocess.check_output(['php','-r', 'echo password_hash('+json.dumps(password)+',PASSWORD_DEFAULT);'],text=True)
config.write_text('<?php return ["trainer_password_hash" => '+repr(password_hash)+'];',encoding='utf-8')
port = '18899'
env = dict(os.environ,EQUINERIS_LOCAL_TEST='1')
process = subprocess.Popen(['php','-S','127.0.0.1:'+port,'-t',str(root)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
origin = 'http://127.0.0.1:'+port
mcp = origin+'/mcp/server.php'
oauth = origin+'/mcp/oauth.php'
review = origin+'/api/review.php'
resource = 'https://rakudadou.sakura.ne.jp/smart-diet/equineris/mcp/server.php'
client = 'https://chatgpt.com/oauth/client.json'
callback = 'https://chatgpt.com/connector_platform_oauth_redirect'
checks = []
def check(msg,good):
 if not good: raise AssertionError(msg)
 checks.append(msg)
def invoke(session,token,method,params=None,idx=1):
 return session.post(mcp,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json, text/event-stream'},json={'jsonrpc':'2.0','id':idx,'method':method,'params':params or {}},timeout=12)
try:
 session = requests.Session()
 for _ in range(40):
  try:
   status = session.get(review+'?action=status',timeout=2);break
  except requests.ConnectionError:time.sleep(.2)
 check('review API available for MCP integration',status.status_code==200)
 csrf = status.json()['csrf']
 photo = BytesIO()
 Image.new('RGB',(45,30),(100,130,90)).save(photo,format='PNG')
 photo.seek(0)
 data = {'client_key':'e'*64,'consent':'yes','ai_consent':'yes','name':'Test Coach Client','date':'2026-11-24','stage':'1','note':'食事内容を確認してください','summary':'朝食：ご飯、豆腐'}
 submitted = session.post(review+'?action=submit',data=data,files={'photos[]':('meal.png',photo,'image/png')},headers={'X-CSRF-Token':csrf},timeout=10)
 check('fixture record stored privately',submitted.status_code==200)
 rid = submitted.json()['id']
 private_data = {'client_key':'f'*64,'consent':'yes','name':'Private test','date':'2026-11-24','stage':'1','summary':'同意していない個人の記録'}
 private_record=session.post(review+'?action=submit',data=private_data,headers={'X-CSRF-Token':csrf},timeout=10)
 check('non-consenting record submitted for manual review',private_record.status_code==200)
 private_id=private_record.json()['id']
 denied = session.post(mcp,json={'jsonrpc':'2.0','id':1,'method':'tools/list'})
 check('MCP unauthenticated rejected with OAuth discovery',denied.status_code==401 and 'oauth-protected-resource' in denied.headers.get('WWW-Authenticate',''))
 bogus = session.get(oauth,params={'action':'authorize','client_id':client,'redirect_uri':'https://evil.example/cb','response_type':'code','code_challenge':'A'*43,'code_challenge_method':'S256'})
 check('OAuth refuses unapproved redirect',bogus.status_code==400)
 verifier = 'mcp-test-verifier-with-adequate-entropy-0123456789ab'
 challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
 authorize = session.get(oauth,params={'action':'authorize','client_id':client,'redirect_uri':callback,'response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','state':'test-state-123','scope':'equineris:review','resource':resource})
 check('OAuth password approval screen accessible',authorize.status_code==200 and 'name="password"' in authorize.text)
 csrf_form = re.search(r'name="csrf" value="([a-f0-9]+)"',authorize.text)
 check('OAuth screen has CSRF protection',csrf_form is not None)
 approved = session.post(oauth+'?action=authorize',data={'csrf':csrf_form.group(1),'password':password,'approve':'yes'},allow_redirects=False)
 check('password consent issues ChatGPT callback',approved.status_code==302 and approved.headers['Location'].startswith(callback+'?'))
 params = parse_qs(urlparse(approved.headers['Location']).query)
 code = params['code'][0]
 check('callback preserves state and issuer',params['state']==['test-state-123'] and params['iss']==['https://rakudadou.sakura.ne.jp'])
 token_payload = {'grant_type':'authorization_code','code':code,'client_id':client,'redirect_uri':callback,'code_verifier':verifier,'resource':resource}
 exchanged = session.post(oauth+'?action=token',data=token_payload)
 check('PKCE code exchanged for OAuth bearer',exchanged.status_code==200 and 'access_token' in exchanged.json())
 token = exchanged.json()['access_token']
 check('OAuth code cannot be replayed',session.post(oauth+'?action=token',data=token_payload).status_code==400)
 check('malformed bearer denied',session.post(mcp,headers={'Authorization':'Bearer bad'},json={'jsonrpc':'2.0','id':2,'method':'tools/list'}).status_code==401)
 initialized = invoke(session,token,'initialize',{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'mcp-test','version':'1'}},3)
 check('MCP initialize negotiates protocol',initialized.status_code==200 and initialized.json()['result']['serverInfo']['name']=='equineris-trainer')
 listed = invoke(session,token,'tools/list',{},4)
 names = [t['name'] for t in listed.json()['result']['tools']]
 check('MCP exposes four scoped trainer tools',len(names)==4 and 'get_meal_photo' in names and 'send_trainer_comment' in names)
 waiting = invoke(session,token,'tools/call',{'name':'list_meal_requests','arguments':{'status':'waiting','limit':5}},5)
 pending = json.loads(waiting.json()['result']['content'][0]['text'])
 check('MCP lists pending private record',rid in [x['id'] for x in pending['items']])
 check('MCP hides records lacking separate AI consent',private_id not in [x['id'] for x in pending['items']])
 refused=invoke(session,token,'tools/call',{'name':'get_meal_request','arguments':{'id':private_id}},20)
 check('MCP denies access to non-consenting record','同意していない' in refused.json()['result']['content'][0]['text'])
 refused_write=invoke(session,token,'tools/call',{'name':'send_trainer_comment','arguments':{'id':private_id,'comment':'not allowed','confirmed':True}},21)
 check('MCP rejects comments on non-consenting record','同意していない' in refused_write.json()['result']['content'][0]['text'])
 detail = invoke(session,token,'tools/call',{'name':'get_meal_request','arguments':{'id':rid}},6)
 body = json.loads(detail.json()['result']['content'][0]['text'])
 check('MCP reads meal, question and photo count',body['summary']=='朝食：ご飯、豆腐' and body['photo_count']==1)
 image = invoke(session,token,'tools/call',{'name':'get_meal_photo','arguments':{'id':rid,'index':0}},7)
 content = image.json()['result']['content']
 check('MCP returns private real photo image content',content[1]['type']=='image' and base64.b64decode(content[1]['data']).startswith(b'\x89PNG'))
 rejected = invoke(session,token,'tools/call',{'name':'send_trainer_comment','arguments':{'id':rid,'comment':'野菜を少し加えてみましょう','confirmed':False}},8)
 check('unapproved comment rejected without write', '未送信' in rejected.json()['result']['content'][0]['text'])
 posted = invoke(session,token,'tools/call',{'name':'send_trainer_comment','arguments':{'id':rid,'comment':'野菜を少し加えてみましょう','confirmed':True}},9)
 posted_value = json.loads(posted.json()['result']['content'][0]['text'])
 check('explicitly approved comment saved',posted_value['saved'] is True)
 duplicate = invoke(session,token,'tools/call',{'name':'send_trainer_comment','arguments':{'id':rid,'comment':'overwriting is not allowed','confirmed':True}},10)
 check('reviewed record cannot be silently overwritten','未送信' in duplicate.json()['result']['content'][0]['text'])
 status_client = session.post(review+'?action=mine',data={'client_key':'e'*64},headers={'X-CSRF-Token':csrf}).json()
 check('actual student can see trainer reply',status_client['items'][0]['comment']=='野菜を少し加えてみましょう')
 refreshed = session.post(oauth+'?action=token',data={'grant_type':'refresh_token','client_id':client,'refresh_token':exchanged.json()['refresh_token'],'resource':resource})
 check('OAuth refresh token rotation works',refreshed.status_code==200 and 'access_token' in refreshed.json())
 replay = session.post(oauth+'?action=token',data={'grant_type':'refresh_token','client_id':client,'refresh_token':exchanged.json()['refresh_token'],'resource':resource})
 check('OAuth refresh token cannot be replayed',replay.status_code==400)
 # Native desktop callback is tied to the complete configured MCP resource URL.
 native_id=base64.urlsafe_b64encode(hashlib.sha256(resource.encode()).digest()[:9]).rstrip(b'=').decode()
 check('native callback ID matches observed desktop format',native_id=='UjArzgqnVGcX')
 native_client='https://chatgpt.com/oauth/codex/'+native_id+'/client.json'
 native_callback='http://127.0.0.1:51459/callback/'+native_id
 native_request={'action':'authorize','client_id':native_client,'redirect_uri':native_callback,'response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','state':'native-test-state','scope':'equineris:review','resource':resource}
 for label,overrides in [
  ('external host',{'redirect_uri':'https://evil.example/callback/'+native_id}),
  ('loopback lookalike',{'redirect_uri':'http://127.0.0.1.evil.example:51459/callback/'+native_id}),
  ('userinfo',{'redirect_uri':'http://127.0.0.1:51459@evil.example/callback/'+native_id}),
  ('wrong callback ID',{'redirect_uri':'http://127.0.0.1:51459/callback/AAAAAAAAAAAA'}),
  ('wrong client ID',{'client_id':'https://chatgpt.com/oauth/codex/AAAAAAAAAAAA/client.json'}),
  ('wrong client host',{'client_id':'https://evil.example/oauth/codex/'+native_id+'/client.json'}),
  ('web client on native callback',{'client_id':client}),
  ('native client on web callback',{'redirect_uri':callback}),
  ('missing port',{'redirect_uri':'http://127.0.0.1/callback/'+native_id}),
  ('zero port',{'redirect_uri':'http://127.0.0.1:0/callback/'+native_id}),
  ('out of range port',{'redirect_uri':'http://127.0.0.1:65536/callback/'+native_id}),
  ('query injection',{'redirect_uri':native_callback+'?next=https://evil.example'}),
  ('fragment',{'redirect_uri':native_callback+'#x'}),
  ('path suffix',{'redirect_uri':native_callback+'/extra'}),
  ('weak PKCE',{'code_challenge_method':'plain'}),
  ('wrong resource',{'resource':'https://evil.example/mcp'}),
  ('wrong scope',{'scope':'admin'}),
 ]:
  denied_native=session.get(oauth,params={**native_request,**overrides},timeout=10)
  check('native OAuth rejects '+label,denied_native.status_code==400)
 def native_authorize():
  page=session.get(oauth,params=native_request,timeout=10)
  check('native OAuth password approval screen accessible',page.status_code==200 and 'name="password"' in page.text)
  csrf_match=re.search(r'name="csrf" value="([a-f0-9]+)"',page.text)
  check('native approval retains CSRF',csrf_match is not None)
  result=session.post(oauth+'?action=authorize',data={'csrf':csrf_match.group(1),'password':password,'approve':'yes'},allow_redirects=False,timeout=10)
  check('native callback is exact approved loopback URI',result.status_code==302 and result.headers['Location'].startswith(native_callback+'?'))
  parsed=parse_qs(urlparse(result.headers['Location']).query)
  check('native callback state and issuer preserved',parsed['state']==['native-test-state'] and parsed['iss']==['https://rakudadou.sakura.ne.jp'])
  return parsed['code'][0]
 native_payload={'grant_type':'authorization_code','code':native_authorize(),'client_id':native_client,'redirect_uri':native_callback,'code_verifier':verifier,'resource':resource}
 mismatch=session.post(oauth+'?action=token',data={**native_payload,'redirect_uri':native_callback.replace(':51459',':51460')},timeout=10)
 check('native authorization code bound to exact port',mismatch.status_code==400)
 native_payload['code']=native_authorize()
 bad_pkce=session.post(oauth+'?action=token',data={**native_payload,'code_verifier':'B'*43},timeout=10)
 check('native authorization code bound to PKCE verifier',bad_pkce.status_code==400)
 native_payload['code']=native_authorize()
 native_token=session.post(oauth+'?action=token',data=native_payload,timeout=10)
 check('native OAuth exchanges code for bearer',native_token.status_code==200 and 'access_token' in native_token.json())
 check('native authorization code cannot be replayed',session.post(oauth+'?action=token',data=native_payload,timeout=10).status_code==400)
 native_list=invoke(session,native_token.json()['access_token'],'tools/list',{},30)
 check('native bearer can invoke scoped MCP tools',native_list.status_code==200 and len(native_list.json()['result']['tools'])==4)
 native_refresh={'grant_type':'refresh_token','client_id':native_client,'refresh_token':native_token.json()['refresh_token'],'resource':resource}
 rotated=session.post(oauth+'?action=token',data=native_refresh,timeout=10)
 check('native refresh token rotates',rotated.status_code==200 and 'access_token' in rotated.json())
 check('native refresh token replay denied',session.post(oauth+'?action=token',data=native_refresh,timeout=10).status_code==400)
 wrong_client=session.post(oauth+'?action=token',data={**native_refresh,'client_id':client,'refresh_token':rotated.json()['refresh_token']},timeout=10)
 check('native refresh token cannot be used by web client',wrong_client.status_code==400)
 print('MCP INTEGRATION PASSED: '+str(len(checks))+' checks')
except Exception as exc:
 print('MCP TEST FAILED: '+str(exc))
 raise
finally:
 process.terminate()
 try:process.communicate(timeout=5)
 except subprocess.TimeoutExpired:process.kill()
 config.unlink(missing_ok=True)
