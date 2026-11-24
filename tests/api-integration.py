import requests, subprocess, os, time, tempfile, sys, pathlib
from PIL import Image
from io import BytesIO
base=pathlib.Path(__file__).resolve().parents[1]/'equineris'
api=base/'api'
password='integration-very-long-password-for-local-test'
hash=subprocess.check_output(['php','-r',f'echo password_hash({password!r},PASSWORD_DEFAULT);'],text=True)
(api/'config.local.php').write_text('<?php return ["trainer_password_hash" => '+repr(hash)+'];')
env=dict(os.environ,EQUINERIS_LOCAL_TEST='1')
port='18896'; proc=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(base)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
url=f'http://127.0.0.1:{port}/api/review.php'
s=requests.Session(); ok=[]
def test(name,cond):
  if not cond: raise AssertionError(name)
  ok.append(name)
try:
  for _ in range(40):
    try: status=s.get(url+'?action=status');break
    except requests.ConnectionError:time.sleep(.15)
  test('status endpoint HTTPS test mode',status.status_code==200)
  j=status.json();csrf=j['csrf'];test('server configured',j['configured'] and not j['trainer'])
  j2=s.post(url+'?action=submit',data={'name':'Test'},timeout=10);test('CSRF rejection',j2.status_code==403)
  denied=s.post(url+'?action=list',headers={'X-CSRF-Token':csrf});test('admin list requires authentication',denied.status_code==403)
  invalid=s.post(url+'?action=login',data={'password':'wrong'},headers={'X-CSRF-Token':csrf});test('bad admin password denied',invalid.status_code==401)
  pic=BytesIO();Image.new('RGB',(40,30),(200,100,30)).save(pic,format='PNG');pic.seek(0)
  key='a'*64
  data={'client_key':key,'consent':'yes','name':'Local test user','date':'2026-11-22','stage':'1','note':'食事内容を確認してください','summary':'朝食: 写真1枚'}
  result=s.post(url+'?action=submit',data=data,files={'photos[]':('meal.png',pic,'image/png')},headers={'X-CSRF-Token':csrf});test('food-photo submission succeeds',result.status_code==200)
  rid=result.json()['id'];test('generated submission identifier',len(rid)==32)
  mine=s.post(url+'?action=mine',data={'client_key':key},headers={'X-CSRF-Token':csrf});test('owner can read status',mine.status_code==200 and mine.json()['items'][0]['status']=='waiting')
  other=s.post(url+'?action=mine',data={'client_key':'b'*64},headers={'X-CSRF-Token':csrf});test('other user cannot read records',other.status_code==200 and other.json()['items']==[])
  img=s.get(url+f'?action=photo&id={rid}&n=0');test('private photo requires admin login',img.status_code==403)
  login=s.post(url+'?action=login',data={'password':password},headers={'X-CSRF-Token':csrf});test('admin login succeeds',login.status_code==200)
  csrf=login.json()['csrf']
  # The dashboard must POST to the API; a GET produces HTTP 405 even after login.
  dashboard=(base/'trainer-dashboard.js').read_text()
  test('trainer dashboard sends list via POST with CSRF', "await req('list',new FormData())" in dashboard and "'X-CSRF-Token':csrf" in dashboard)
  test('trainer list rejects GET',s.get(url+'?action=list').status_code==405)
  listing=s.post(url+'?action=list',headers={'X-CSRF-Token':csrf});test('admin sees submitted food photos',listing.status_code==200 and listing.json()['items'][0]['photos'][0]['mime']=='image/png')
  photo=s.get(url+f'?action=photo&id={rid}&n=0');test('admin can view image',photo.status_code==200 and photo.headers['Content-Type'].startswith('image/png'))
  reply=s.post(url+'?action=comment',data={'id':rid,'comment':'野菜を加える工夫から始めましょう'},headers={'X-CSRF-Token':csrf});test('admin can reply',reply.status_code==200)
  done=s.post(url+'?action=mine',data={'client_key':key},headers={'X-CSRF-Token':csrf});test('client sees coach comment',done.json()['items'][0]['status']=='reviewed' and '野菜' in done.json()['items'][0]['comment'])
  logout=s.post(url+'?action=logout',headers={'X-CSRF-Token':csrf});test('logout works',logout.status_code==200)
  photo_again=s.get(url+f'?action=photo&id={rid}&n=0');test('after logout photo is private',photo_again.status_code==403)
  print('API TEST PASSED:',len(ok),'/',len(ok));print('\n'.join('PASS '+x for x in ok))
finally:
  proc.terminate();proc.wait(timeout=4)
  (api/'config.local.php').unlink(missing_ok=True)
