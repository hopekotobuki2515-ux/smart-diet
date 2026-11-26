import collections, hashlib, html, json, os, re, sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import quote, unquote, urlsplit
from xml.etree import ElementTree as ET
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor

BASE='https://rakudadou.sakura.ne.jp/kurashi/'
ROOT=Path(os.environ['RUNNER_TEMP'])/'kurashi-copy-update'
DATA=json.loads(Path('kurashi-copy-50-20261126/payload.json').read_text())
mapping=json.loads(re.search(r"mapping=json.loads\(r'''(.*?)'''\)",Path('.github/workflows/deploy-kurashi-seo.yml').read_text(),re.S).group(1))
assert len(mapping)==27 and len(DATA['articles'])==15 and len(DATA['products'])==212
def fetch(url):
    with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'}),timeout=35) as r:
        assert r.status==200 and unquote(r.url)==unquote(url),(url,r.url,r.status)
        return r.read()
def url(old):
    slug=mapping[old][0]
    return BASE+(quote(slug)+'/' if slug else '')
def path(old):
    slug=mapping[old][0]
    return slug+'/index.html' if slug else 'index.html'
def save(p,b):
    p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def esc(s):return html.escape(s,quote=True)
def text(s):return html.unescape(s)
def visible_count(s):return len(re.sub(r'\s+','',s))
def replace_once(s,pattern,fn):
    result,n=re.subn(pattern,fn,s,flags=re.S)
    assert n==1,(pattern,n)
    return result
class Refs(HTMLParser):
    def __init__(self):super().__init__();self.refs=[];self.scripts=[];self.styles=[];self.mode=None;self.canon=[];self.robots=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style'):self.mode=tag
        for k in ('href','src','srcset','poster','data-src','action','data-amazon-link','data-product-id','data-product-name','data-amazon-link-type'):
            if k in a:self.refs.append((tag,k,a[k]))
        if tag=='link' and a.get('rel')=='canonical':self.canon.append(a.get('href'))
        if tag=='meta' and a.get('name','').lower()=='robots':self.robots.append(a.get('content'))
        if 'id' in a:self.ids.add(a['id'])
    def handle_endtag(self,t):
        if t==self.mode:self.mode=None
    def handle_data(self,d):
        if self.mode=='script':self.scripts.append(d)
        if self.mode=='style':self.styles.append(d)
def parse(s):p=Refs();p.feed(s);return p
CARD=re.compile(r'<article\b[^>]*\bdata-product-id="([^"]+)"[^>]*>.*?</article>',re.S)
DESC=re.compile(r'(<p\s+class="product-description"[^>]*>)(.*?)(</p>)',re.S)
BODY=re.compile(r'(<div\s+data-article-body\s*>)(.*?)(</div>)',re.S)
PART=re.compile(r'<(p|h2)(?:\s+id="section-\d+")?>(.*?)</\1>',re.S)
def body_parts(s):
    assert not PART.sub('',s).strip(),'Unexpected article-body markup'
    return [[m.group(1),text(m.group(2))] for m in PART.finditer(s)]
def sha(b):return hashlib.sha256(b).hexdigest()

def prepare():
    sitemap=fetch(BASE+'sitemap.xml')
    locs=[e.text for e in ET.fromstring(sitemap).iter() if e.tag.endswith('}loc')]
    assert len(locs)==27 and {unquote(x) for x in locs}=={unquote(url(x)) for x in mapping},'Sitemap routes differ'
    save(ROOT/'sitemap-original.xml',sitemap)
    with ThreadPoolExecutor(max_workers=5) as ex:raw=dict(zip(mapping,ex.map(lambda x:fetch(url(x)),mapping)))
    seen=collections.Counter(); errors=[];changes=[]; manifest={}; occurrence=0
    for old,b in raw.items():
        original=b.decode('utf-8');s=original;p=parse(original)
        try:
            assert p.canon==[url(old)] or [unquote(x) for x in p.canon]==[unquote(url(old))],(old,'canonical',p.canon)
            assert not any('noindex' in x.lower() for x in p.robots),'noindex'
            if old in DATA['articles']:
                a=DATA['articles'][old];prev=a['old'];new=a['fresh']
                ms=list(BODY.finditer(s));assert len(ms)==1,('article body count',len(ms))
                actual=body_parts(ms[0].group(2))
                assert actual==new['parts'],('Existing article body differs, no article change permitted',old)
            elif BODY.search(s):raise AssertionError('Unexpected article on non-genre page')
            def product(m):
                id=m.group(1);card=m.group(0);item=DATA['products'].get(id)
                assert item is not None,('Unknown product',id)
                names=re.findall(r'<h3[^>]*>(.*?)</h3>',card,re.S)
                assert len(names)==1 and text(names[0])==item['name'],('Product name mismatch',id,names)
                links=re.findall(r'\bhref="([^"]+)"',card)
                assert links==item['links'],('Affiliate links differ',id)
                ds=list(DESC.finditer(card));assert len(ds)==1,('Description count',id,len(ds))
                actual=text(ds[0].group(2))
                assert actual in (item['old'],item['fresh']),('Product description differs',id,actual[:180])
                assert visible_count(item['fresh'])==50,('Length',id)
                seen[id]+=1
                return DESC.sub(lambda m:m.group(1)+esc(item['fresh'])+m.group(3),card)
            if old=='self.html':
                assert len(CARD.findall(s))==206 and not DESC.findall(s),'Self catalogue structure changed'
                for m in CARD.finditer(s):
                    id=m.group(1);card=m.group(0);item=DATA['products'].get(id)
                    assert item is not None,('Unknown self catalogue product',id)
                    assert [text(x) for x in re.findall(r'<h3[^>]*>(.*?)</h3>',card,re.S)]==[item['name']],('Self catalogue name mismatch',id)
                    assert re.findall(r'\bhref="([^"]+)"',card)==item['links'],('Self catalogue affiliate links mismatch',id)
                assert s==original,'Self catalogue must remain unchanged'
            else:
                s=CARD.sub(product,s)
                assert len(CARD.findall(s))==len(DESC.findall(s)),('Unmatched product description elements',old,len(CARD.findall(s)),len(DESC.findall(s)))
            if old in DATA['articles']:
                assert BODY.search(s).group(0)==BODY.search(original).group(0),'Article markup changed'
                assert DESC.sub('',s)==DESC.sub('',original),'Non-description HTML changed'
            p2=parse(s)
            assert (p.refs,p.scripts,p.styles,p.canon,p.robots)==(p2.refs,p2.scripts,p2.styles,p2.canon,p2.robots),'Protected references, scripts, styles or SEO settings changed'
            for tag,k,v in p2.refs:
                if k=='href' and isinstance(v,str) and v.startswith('#') and len(v)>1 and v[1:] in p.ids:
                    assert v[1:] in p2.ids,('Broken fragment',v)
            out=s.encode();rel=path(old)
            manifest[old]={'url':url(old),'path':rel,'sha':sha(out)}
            if out!=b:
                assert mapping[old][0], 'Unexpected change to homepage'
                changes.append(rel);save(ROOT/'original'/rel,b);save(ROOT/'public'/rel,out)
            print('PASS',old,'products',len(CARD.findall(s)),'changed',out!=b,flush=True)
        except Exception as e:
            errors.append((old,str(e)));print('FAIL',old,repr(e),flush=True)
    assert not errors,('Preflight aborted, no deployment',errors)
    assert set(seen)==set(DATA['products']),('Missing product IDs',sorted(set(DATA['products'])-set(seen)))
    assert len(manifest)==27
    print('PASS: 15 articles, 212 unique product IDs,',sum(seen.values()),'product descriptions,',len(changes),'changed HTML files',flush=True)
    (ROOT/'changes.txt').write_text(''.join(p+'\n' for p in changes))
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False))
def verify():
    manifest=json.loads((ROOT/'manifest.json').read_text())
    def check(item):
        k,v=item;actual=fetch(v['url']);assert sha(actual)==v['sha'],('Public byte mismatch',k);print('LIVE PASS',k,flush=True)
    with ThreadPoolExecutor(max_workers=5) as ex:list(ex.map(check,manifest.items()))
    assert fetch(BASE+'sitemap.xml')==(ROOT/'sitemap-original.xml').read_bytes()
    for img in ['erugam-54177.jpg','kurashi-body-guide.jpg','kurashi-food-guide.png','kurashi-life-guide.png','kurashi-planning.png','kurashi-site-header.png']:
        assert fetch(BASE+img)
    print('LIVE PASS: all 27 HTML pages, unchanged sitemap, 6 local images',flush=True)
if __name__=='__main__':{'prepare':prepare,'verify':verify}[sys.argv[1]]()
