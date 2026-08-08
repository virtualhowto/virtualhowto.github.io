#!/usr/bin/env python3
import os, json, re, html, datetime, urllib.parse
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data.json'
OPENROUTER_KEY=os.getenv('OPENROUTER_API_KEY','').strip()
OPENROUTER_MODEL=os.getenv('OPENROUTER_MODEL','openai/gpt-4o-mini')
UA={'User-Agent':'LocalRafflesBot/1.1 (+https://virtualhowto.github.io/raffles/)'}
KEYWORDS=('raffle','raffles','promotion','promotions','whatson','what-s-on','whats-on','dining','dine','food','special','specials','bistro','events','entertainment','offers')

def text_from_html(raw,limit=18000):
    raw=re.sub(r'(?is)<script.*?>.*?</script>|<style.*?>.*?</style>',' ',raw)
    raw=re.sub(r'(?s)<[^>]+>',' ',raw)
    return re.sub(r'\s+',' ',html.unescape(raw)).strip()[:limit]

def same_host(a,b):
    return urllib.parse.urlparse(a).netloc.lower().removeprefix('www.')==urllib.parse.urlparse(b).netloc.lower().removeprefix('www.')

def relevant_links(base_url,raw,max_links=6):
    found=[]
    for href,label in re.findall(r'(?is)<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',raw):
        label=text_from_html(label,500).lower()
        url=urllib.parse.urljoin(base_url,href)
        p=urllib.parse.urlparse(url)
        hay=(p.path+' '+p.query+' '+label).lower().replace(' ','-')
        if p.scheme not in ('http','https') or not same_host(base_url,url): continue
        if any(k in hay for k in KEYWORDS):
            clean=urllib.parse.urlunparse((p.scheme,p.netloc,p.path,p.params,p.query,''))
            if clean not in found: found.append(clean)
        if len(found)>=max_links: break
    return found

def ai_extract(name,pages):
    if not OPENROUTER_KEY or not pages: return None
    joined='\n\n'.join(f'SOURCE URL: {p["url"]}\nTEXT:\n{p["text"]}' for p in pages if p.get('text'))[:50000]
    if not joined: return None
    prompt=f'''Extract CURRENT recurring raffles and food specials for this Australian pub/club from the supplied website pages.
Venue: {name}\nToday: {datetime.date.today().isoformat()}
Return ONLY valid JSON with keys raffles and specials.
raffles item schema: {{"name":str,"days":[weekday names],"time":"HH:MM","details":str,"source_url":str}}
specials item schema: {{"title":str,"days":[weekday names],"meal":"lunch"|"dinner"|"both","price":str,"source_url":str}}
Use only facts present in the supplied pages. Do not guess. Omit expired/date-specific promotions unless clearly recurring/current. For every item, source_url MUST be one of the supplied SOURCE URLs.
Pages:\n{joined}'''
    r=requests.post('https://openrouter.ai/api/v1/chat/completions',timeout=60,headers={'Authorization':f'Bearer {OPENROUTER_KEY}','Content-Type':'application/json','HTTP-Referer':'https://virtualhowto.github.io/raffles/','X-Title':'Local Raffles Updater'},json={'model':OPENROUTER_MODEL,'messages':[{'role':'user','content':prompt}],'temperature':0.1})
    r.raise_for_status(); out=r.json()['choices'][0]['message']['content'].strip()
    out=re.sub(r'^```(?:json)?\s*|\s*```$','',out)
    return json.loads(out)

def fetch_pages(url):
    pages=[]
    r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
    raw=r.text
    pages.append({'url':r.url,'text':text_from_html(raw)})
    for child in relevant_links(r.url,raw):
        try:
            rr=requests.get(child,headers=UA,timeout=20); rr.raise_for_status()
            ctype=(rr.headers.get('content-type') or '').lower()
            if 'text/html' not in ctype and 'application/xhtml' not in ctype: continue
            txt=text_from_html(rr.text)
            if txt: pages.append({'url':rr.url,'text':txt})
        except Exception as ex:
            print(' child page failed:',child,ex)
    return pages

def overpass_discover(lat=-33.365,lon=151.445,radius=25000):
    q=f'''[out:json][timeout:30];(nwr(around:{radius},{lat},{lon})[amenity~"pub|bar|nightclub|social_centre"];nwr(around:{radius},{lat},{lon})[club];);out center tags;'''
    try:
        r=requests.post('https://overpass-api.de/api/interpreter',data=q,headers=UA,timeout=60); r.raise_for_status()
        found=[]
        for e in r.json().get('elements',[]):
            t=e.get('tags',{}); name=t.get('name')
            if not name: continue
            p=e if 'lat' in e else e.get('center',{})
            if not p.get('lat') or not p.get('lon'): continue
            found.append({'name':name,'lat':p['lat'],'lng':p['lon'],'address':' '.join(filter(None,[t.get('addr:housenumber'),t.get('addr:street'),t.get('addr:suburb'),t.get('addr:state'),t.get('addr:postcode')])),'website':t.get('website') or t.get('contact:website')})
        return found
    except Exception as ex:
        print('Overpass discovery failed:',ex); return []

def main():
    data=json.loads(DATA.read_text())
    venues=data.get('venues',[])
    existing={(v['name'].strip().lower()) for v in venues}
    for d in overpass_discover():
        k=d['name'].strip().lower()
        if k not in existing:
            d.update({'raffles':[],'specials':[],'last_checked':None,'needs_review':True})
            venues.append(d); existing.add(k)
    for v in venues:
        url=v.get('website')
        if not url: continue
        try:
            pages=fetch_pages(url)
            parsed=ai_extract(v['name'],pages)
            if parsed is not None:
                v['raffles']=parsed.get('raffles',[])
                v['specials']=parsed.get('specials',[])
                v['needs_review']=False
                v['source_pages']=[p['url'] for p in pages]
            v['last_checked']=datetime.date.today().isoformat()
        except Exception as ex:
            print(v['name'],':',ex)
            v['needs_review']=True
    data['venues']=venues
    data['updated']=datetime.date.today().isoformat()
    data['automation']={'openrouter_enabled':bool(OPENROUTER_KEY),'model':OPENROUTER_MODEL if OPENROUTER_KEY else None,'discovery':'OpenStreetMap Overpass','crawler':'homepage + relevant same-site pages'}
    DATA.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')

if __name__=='__main__': main()
