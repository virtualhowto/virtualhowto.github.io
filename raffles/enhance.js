(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minsUntil=t=>{if(!t||!/^[0-2]?\d:[0-5]\d/.test(t))return Infinity;const [h,m]=t.split(':').map(Number),now=new Date(),target=new Date(now);target.setHours(h,m,0,0);return Math.max(0,Math.round((target-now)/60000));};
  const nextRaffle=v=>{const rs=todaysRaffles(v);const upcoming=rs.map(x=>({x,m:minsUntil(x.time)})).filter(y=>Number.isFinite(y.m)&&y.m>=0).sort((a,b)=>a.m-b.m);return upcoming[0]||null;};
  const confidence=v=>v.needs_review?'Needs review':v.last_checked?'Recently checked':'Source pending';
  const confidenceIcon=v=>v.needs_review?'⚠':'✓';
  const directions=v=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name+' '+(v.address||''))}`;

  const oldSync=sync;
  sync=function(){
    oldSync();
    const q=document.querySelector('.bottom [data-quick="day"]');
    if(q)q.classList.toggle('active',timeFilter==='day');
  };

  function ensureDayButton(){
    const nav=document.querySelector('.bottom');
    if(!nav||nav.querySelector('[data-quick="day"]'))return;
    const night=nav.querySelector('[data-quick="night"]');
    const b=document.createElement('button');
    b.dataset.quick='day';b.innerHTML='<span>☀</span>Day';
    night?.before(b);
    nav.style.gridTemplateColumns='repeat(5,1fr)';
    b.onclick=()=>{const keepMap=mapIsOn();timeFilter=timeFilter==='day'?'all':'day';render();if(keepMap)view('map')};
  }

  render=function(){
    ensureDayButton();sync();
    const radius=+$('#radius').value;$('#radiusLabel').textContent=radius;markers.clearLayers();
    let list=venues.map(v=>({...v,distance:km(origin,v)})).filter(v=>v.distance<=radius&&valid(v));
    if(raffleOnly){
      list.sort((a,b)=>{const na=nextRaffle(a),nb=nextRaffle(b),ma=na?na.m:Infinity,mb=nb?nb.m:Infinity;return ma-mb||a.distance-b.distance});
    }else list.sort((a,b)=>a.distance-b.distance);
    $('#count').textContent=`${list.length} nearby place${list.length===1?'':'s'}${raffleOnly?' · next raffle first':''}`;
    $('#grid').innerHTML=list.length?'':'<div class="empty">Nothing matches that combination yet.</div>';

    list.forEach(v=>{
      const raff=todaysRaffles(v),allFood=todaysFood(v),food=foodFilter==='all'?allFood:allFood.filter(x=>x.meal===foodFilter||x.meal==='both');
      const nr=nextRaffle(v),conf=confidence(v);
      const c=document.createElement('article');c.className='card';
      c.innerHTML=`<div class="head"><div><div class="name">${esc(v.name)}</div><div class="addr">${esc(v.address||'')}</div></div><span class="dist">${v.distance.toFixed(1)} km</span></div>${raff.length?`<div class="sec"><div class="sect">Today’s raffles</div>${raff.map(x=>`<div class="item"><div><b>${esc(x.name||'Raffle')}</b><div class="meta">${esc(x.details||'')}</div></div><span class="when">${pretty(x.time)}</span></div>`).join('')}</div>`:''}${food.length?`<div class="sec"><div class="sect">Food specials</div>${food.map(x=>`<div class="item food"><div><b>${esc(x.title)}</b><div class="meta">${esc(x.meal||'')}${x.price?' · '+esc(x.price):''}</div></div></div>`).join('')}</div>`:''}<div class="links"><a class="go" target="_blank" rel="noopener" href="${directions(v)}">Directions</a>${v.website?`<a class="site" target="_blank" rel="noopener" href="${esc(v.website)}">Venue site</a>`:'<span></span>'}</div><div class="fresh"><b>${confidenceIcon(v)} ${conf}</b>${v.last_checked?' · '+esc(v.last_checked):''}${nr?` · Next ${pretty(nr.x.time)}`:''}</div>`;
      $('#grid').appendChild(c);

      const detail=raffleOnly&&raff.length?(nr?.x||raff[0]):null;
      const popup=`<div style="min-width:180px"><b style="font-size:14px">${esc(v.name)}</b>${detail?`<div style="margin-top:7px"><b>${esc(detail.name||'Raffle')}</b> · ${pretty(detail.time)}</div>`:''}<div style="margin-top:6px;color:#66736d">${v.distance.toFixed(1)} km · ${confidenceIcon(v)} ${conf}</div><a href="${directions(v)}" target="_blank" rel="noopener" style="display:block;margin-top:9px;font-weight:800">Directions →</a></div>`;
      markers.addLayer(L.marker([v.lat,v.lng]).bindPopup(popup));
    });
  };

  ensureDayButton();
  if(Array.isArray(venues)&&venues.length)render();
})();