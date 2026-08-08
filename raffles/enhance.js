(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minsUntil=t=>{if(!t||!/^[0-2]?\d:[0-5]\d/.test(t))return Infinity;const [h,m]=t.split(':').map(Number),now=new Date(),target=new Date(now);target.setHours(h,m,0,0);const d=Math.round((target-now)/60000);return d<0?Infinity:d;};
  const nextRaffle=v=>{const rs=todaysRaffles(v);const upcoming=rs.map(x=>({x,m:minsUntil(x.time)})).filter(y=>Number.isFinite(y.m)).sort((a,b)=>a.m-b.m);return upcoming[0]||null;};
  const confidence=v=>v.needs_review?'Needs review':v.last_checked?'Recently checked':'Source pending';
  const confidenceIcon=v=>v.needs_review?'⚠':'✓';
  const directions=v=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name+' '+(v.address||''))}`;
  const PREF='raffles-prefs-v1';
  const loadPrefs=()=>{try{return JSON.parse(localStorage.getItem(PREF)||'{}')}catch(_){return{}}};
  const savePrefs=()=>{try{localStorage.setItem(PREF,JSON.stringify({radius:+$('#radius').value,raffleOnly,timeFilter,foodFilter,map:mapIsOn()}))}catch(_){}};
  const p=loadPrefs();
  if(Number.isFinite(p.radius)&&p.radius>=2&&p.radius<=50)$('#radius').value=p.radius;
  if(typeof p.raffleOnly==='boolean')raffleOnly=p.raffleOnly;
  if(['all','day','night'].includes(p.timeFilter))timeFilter=p.timeFilter;
  if(['all','lunch','dinner'].includes(p.foodFilter))foodFilter=p.foodFilter;

  const oldSync=sync;
  sync=function(){
    oldSync();
    const q=document.querySelector('.bottom [data-quick="day"]');
    if(q)q.classList.toggle('active',timeFilter==='day');
    document.querySelectorAll('[data-quick],#bm').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('active')?'true':'false'));
    $('#raffleToggle')?.setAttribute('aria-pressed',raffleOnly?'true':'false');
  };

  function ensureDayButton(){
    const nav=document.querySelector('.bottom');
    if(!nav||nav.querySelector('[data-quick="day"]'))return;
    const night=nav.querySelector('[data-quick="night"]');
    const b=document.createElement('button');
    b.dataset.quick='day';b.innerHTML='<span>☀</span>Day';b.setAttribute('aria-label','Toggle daytime filter');
    night?.before(b);
    nav.style.gridTemplateColumns='repeat(5,1fr)';
    b.onclick=()=>{const keepMap=mapIsOn();timeFilter=timeFilter==='day'?'all':'day';render();savePrefs();if(keepMap)view('map')};
  }

  function ensureMapSummary(){
    if(document.querySelector('#mapSummary'))return;
    const el=document.createElement('div');el.id='mapSummary';
    el.style.cssText='position:fixed;z-index:1350;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);background:rgba(23,32,29,.9);color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;backdrop-filter:blur(12px);box-shadow:0 6px 20px rgba(0,0,0,.18);display:none;max-width:88vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    document.body.appendChild(el);
  }
  const updateMapSummary=(count,radius)=>{ensureMapSummary();const el=$('#mapSummary');const bits=[`${count} place${count===1?'':'s'}`,`${radius} km`];if(raffleOnly)bits.push('Raffles');if(timeFilter==='day')bits.push('Day');if(timeFilter==='night')bits.push('Tonight');if(foodFilter!=='all')bits.push(foodFilter[0].toUpperCase()+foodFilter.slice(1));el.textContent=bits.join(' · ');el.style.display=mapIsOn()?'block':'none'};

  function addNearMeNow(){
    if(document.querySelector('#nearMeNow'))return;
    const row=document.querySelector('.row');if(!row)return;
    const b=document.createElement('button');b.id='nearMeNow';b.className='loc';b.textContent='Near me now';b.style.marginLeft='auto';
    b.onclick=()=>{if(!navigator.geolocation)return; b.disabled=true;b.textContent='Locating…';navigator.geolocation.getCurrentPosition(pos=>{origin={lat:pos.coords.latitude,lng:pos.coords.longitude};if(me)map.removeLayer(me);me=L.circleMarker([origin.lat,origin.lng],{radius:8,weight:3,fillOpacity:1}).addTo(map).bindPopup('You are here');map.setView([origin.lat,origin.lng],13);timeFilter='all';foodFilter='all';render();savePrefs();b.disabled=false;b.textContent='Near me now';},()=>{b.disabled=false;b.textContent='Near me now';});};
    row.appendChild(b);
  }

  const baseView=view;
  view=function(v){baseView(v);updateMapSummary(Number($('#count')?.textContent.match(/^\d+/)?.[0]||0),+$('#radius').value);savePrefs();};

  render=function(){
    ensureDayButton();addNearMeNow();sync();
    const radius=+$('#radius').value;$('#radiusLabel').textContent=radius;markers.clearLayers();
    let list=venues.map(v=>({...v,distance:km(origin,v)})).filter(v=>v.distance<=radius&&valid(v));
    if(raffleOnly){list.sort((a,b)=>{const na=nextRaffle(a),nb=nextRaffle(b),ma=na?na.m:Infinity,mb=nb?nb.m:Infinity;return ma-mb||a.distance-b.distance});}
    else list.sort((a,b)=>a.distance-b.distance);
    $('#count').textContent=`${list.length} nearby place${list.length===1?'':'s'}${raffleOnly?' · next raffle first':''}`;
    $('#grid').innerHTML=list.length?'':'<div class="empty">Nothing matches that combination yet.</div>';
    updateMapSummary(list.length,radius);

    list.forEach(v=>{
      const raff=todaysRaffles(v),allFood=todaysFood(v),food=foodFilter==='all'?allFood:allFood.filter(x=>x.meal===foodFilter||x.meal==='both');
      const nr=nextRaffle(v),conf=confidence(v);
      const c=document.createElement('article');c.className='card';
      c.innerHTML=`<div class="head"><div><div class="name">${esc(v.name)}</div><div class="addr">${esc(v.address||'')}</div></div><span class="dist">${v.distance.toFixed(1)} km</span></div>${raff.length?`<div class="sec"><div class="sect">Today’s raffles</div>${raff.map(x=>`<div class="item"><div><b>${esc(x.name||'Raffle')}</b><div class="meta">${esc(x.details||'')}</div></div><span class="when">${pretty(x.time)}</span></div>`).join('')}</div>`:''}${food.length?`<div class="sec"><div class="sect">Food specials</div>${food.map(x=>`<div class="item food"><div><b>${esc(x.title)}</b><div class="meta">${esc(x.meal||'')}${x.price?' · '+esc(x.price):''}</div></div></div>`).join('')}</div>`:''}<div class="links"><a class="go" target="_blank" rel="noopener" href="${directions(v)}">Directions</a>${v.website?`<a class="site" target="_blank" rel="noopener" href="${esc(v.website)}">Venue site</a>`:'<span></span>'}</div><div class="fresh"><b>${confidenceIcon(v)} ${conf}</b>${v.last_checked?' · '+esc(v.last_checked):''}${nr?` · Next ${pretty(nr.x.time)}`:''}</div>`;
      $('#grid').appendChild(c);
      const detail=raffleOnly&&raff.length?(nr?.x||raff[0]):null;
      const popup=`<div style="min-width:190px"><b style="font-size:14px">${esc(v.name)}</b>${detail?`<div style="margin-top:7px"><b>${esc(detail.name||'Raffle')}</b> · ${pretty(detail.time)}</div>`:''}<div style="margin-top:6px;color:#66736d">${v.distance.toFixed(1)} km · ${confidenceIcon(v)} ${conf}</div><a href="${directions(v)}" target="_blank" rel="noopener" style="display:block;margin-top:9px;font-weight:800">Directions →</a></div>`;
      markers.addLayer(L.marker([v.lat,v.lng]).bindPopup(popup));
    });
    savePrefs();
  };

  $('#radius').addEventListener('change',savePrefs);
  ['#raffleToggle','[data-food]','[data-time]'].forEach(sel=>document.querySelectorAll(sel).forEach(x=>x.addEventListener('click',()=>setTimeout(savePrefs,0))));
  ensureDayButton();addNearMeNow();ensureMapSummary();
  if(Array.isArray(venues)&&venues.length)render();
  if(p.map)setTimeout(()=>view('map'),120);
})();