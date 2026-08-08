#!/usr/bin/env python3
import os, json, re, html, datetime, urllib.parse
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data.json'
OPENROUTER_KEY=os.getenv('OPENROUTER_API_KEY','').strip()
OPENROUTER_MODEL=os.getenv('OPENROUTER_MODEL','openai/gpt-4o-mini')
UA={'User-Agent':'LocalRafflesBot/1.0 (+https://virtualhowto.github.io/raffles/)'}

def text_from_html(raw):
    raw=re.sub(r'(?is)<script.*?>.*?</script>|<style.*?>.*?</style>',' ',raw)
    raw=re.sub(r'(?s)<[^>]+>',' ',raw)
    return re.sub(r'\s+',' ',html.unescape(raw)).strip()[:18000]

def ai_extract(name,url,text):
    if not OPENROUTER_KEY or not text: return None
    prompt=f'''Extract CURRENT recurring raffles and food specials for this Australian pub/club from the supplied webpage text.
Venue: {name}\nURL: {url}\nToday: {datetime.date.today().isoformat()}
Return ONLY valid JSON with keys raffles and specials.
raffles item schema: {{"name":str,"days":[weekday names],"time":"HH:MM","details":str}}
specials item schema: {{"title":str,"days":[weekday names],"meal":"lunch"|"dinner"|"both","price":str}}
Do not guess. Omit expired/date-specific promotions unless clearly recurring/current. Text:\n{text}'''
    r=requests.post('https://openrouter.ai/api/v1/chat/completions',timeout=45,headers={'Authorization':f'Bearer {OPENROUTER_KEY}','Content-Type':'application/json','HTTP-Referer':'https://virtualhowto.github.io/raffles/','X-Title':'Local Raffles Updater'},json={'model':OPENROUTER_MODEL,'messages':[{'role':'user','content':prompt}],'temperature':0.1})
    r.raise_for_status(); out=r.json()['choices'][0]['message']['content'].strip()
    out=re.sub(r'^```(?:json)?\s*|\s*```$','',out)
    return json.loads(out)

def overpass_discover(lat=-33.365,lon=151.445,radius=25000):
    q=f'''[out:json][timeout:30];(nwr(around:{radius},{lat},{lon})[amenity~"pub|bar|nightclub|social_centre"];nwr(around:{radius},{lat},{lon})[club];);out center tags;'''
    try:
        r=requests.post('https://overpass-api.de/api/interpreter',data=q,headers=UA,timeout=60); r.raise_for_status()
        found=[]
        for e in r.json().get('elements',[]):
            t=e.get('tags',{}); name=t.get('name');
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
    # Enrich the pool with OSM-discovered pubs/clubs while preserving curated entries.
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
            raw=requests.get(url,headers=UA,timeout=20).text
            parsed=ai_extract(v['name'],url,text_from_html(raw))
            if parsed is not None:
                v['raffles']=parsed.get('raffles',[])
                v['specials']=parsed.get('specials',[])
                v['needs_review']=False
            v['last_checked']=datetime.date.today().isoformat()
        except Exception as ex:
            print(v['name'],':',ex)
            v['needs_review']=True
    data['venues']=venues
    data['updated']=datetime.date.today().isoformat()
    data['automation']={'openrouter_enabled':bool(OPENROUTER_KEY),'model':OPENROUTER_MODEL if OPENROUTER_KEY else None,'discovery':'OpenStreetMap Overpass'}
    DATA.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')

if __name__=='__main__': main()
