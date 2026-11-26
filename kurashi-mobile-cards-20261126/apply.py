import sys,json,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from xml.etree import ElementTree as ET
from urllib.parse import unquote
sys.path.insert(0,'kurashi-copy-50-20261126')
import apply as a
OLD='  .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }'
NEW='''  .product-section > .product-grid {
    display: grid;
    grid-template-columns: none;
    grid-template-rows: auto;
    grid-auto-flow: column;
    grid-auto-columns: 100%;
    gap: 12px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 8px;
  }
  .product-section > .product-grid > .product-card {
    min-width: 0;
    width: 100%;
    scroll-snap-align: start;
    overflow-wrap: anywhere;
  }
  .product-section > h2::after {
    content: "左右にスワイプして商品を見る";
    display: block;
    margin-top: 6px;
    color: var(--red-dark);
    font-weight: 700;
    font-size: 13px;
    line-height: 1.5;
  }'''
TARGETS=set(a.DATA['articles'])|{'self.html'}
def prepare():
    sitemap=a.fetch(a.BASE+'sitemap.xml')
    locs=[e.text for e in ET.fromstring(sitemap).iter() if e.tag.endswith('}loc')]
    assert len(locs)==27 and {unquote(x) for x in locs}=={unquote(a.url(x)) for x in a.mapping}
    a.save(a.ROOT/'sitemap-original.xml',sitemap)
    with ThreadPoolExecutor(max_workers=5) as ex: raw=dict(zip(a.mapping,ex.map(lambda k:a.fetch(a.url(k)),a.mapping)))
    manifest={};changes=[];total=0
    for key,b in raw.items():
        s=b.decode('utf-8');out=s
        if key in TARGETS:
            assert s.count(OLD)==1,(key,'mobile rule missing or ambiguous')
            assert re.search(r'@media \(max-width: 720px\) \{\s*'+re.escape(OLD.strip()),s),(key,'not inside mobile media query')
            sections=len(re.findall(r'<section class="section-card product-section"(?:\s[^>]*)?>',s))
            grids=len(re.findall(r'<div class="product-grid">',s))
            assert sections==grids and (sections>1 if key=='self.html' else sections==1),(key,sections,grids)
            cards=a.CARD.findall(s)
            assert len(cards)==(206 if key=='self.html' else sum(v['page']==key for v in a.DATA['products'].values()))
            total+=len(cards)
            out=s.replace(OLD,NEW)
            assert out.replace(NEW,OLD)==s,'unexpected non-CSS changes'
            p=a.parse(s);p2=a.parse(out)
            assert (p.refs,p.scripts,p.canon,p.robots,p.ids)==(p2.refs,p2.scripts,p2.canon,p2.robots,p2.ids)
            assert a.CARD.findall(out)==cards
            rel=a.path(key);changes.append(rel)
            a.save(a.ROOT/'original'/rel,b);a.save(a.ROOT/'public'/rel,out.encode())
            print('PASS',key,len(cards),'cards: mobile CSS only',flush=True)
        manifest[key]={'url':a.url(key),'path':a.path(key),'sha':a.sha(out.encode())}
    assert len(changes)==16 and total==418
    (a.ROOT/'changes.txt').write_text(''.join(p+'\n' for p in changes))
    (a.ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False))
    print('PASS: 16 pages, 418 displayed cards; all existing HTML except mobile CSS preserved',flush=True)
if __name__=='__main__':{'prepare':prepare,'verify':a.verify}[sys.argv[1]]()
