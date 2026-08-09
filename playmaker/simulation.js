// Playmaker tactical AI simulation: browser-only defensive reaction engine.
(() => {
  const board = document.getElementById('courtBoard');
  if (!board) return;
  const DEF_POS = ['GK','GD','WD','C','WA','GA','GS'];
  let defenders = [], simRunning = false, frame = null, startAt = 0, lastAt = 0, mode = 'man', ballOwner = null, metrics = {pressure:0,space:0,entries:0,frames:0};
  const attackTokens = () => [...board.querySelectorAll('.token:not(.defender-token)')].slice(0,7);
  const pct = el => ({x:parseFloat(el.style.left)||50,y:parseFloat(el.style.top)||50});
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function portrait(){return matchMedia('(orientation:portrait)').matches && matchMedia('(max-width:520px)').matches}
  function legalise(pos, dpos){
    // Approximate netball positional restrictions by thirds.
    if(portrait()){
      if(dpos==='GK') pos.y=clamp(pos.y,67,96);
      if(dpos==='GD') pos.y=clamp(pos.y,34,96);
      if(dpos==='WD') pos.y=clamp(pos.y,34,66);
      if(dpos==='C') pos.y=clamp(pos.y,5,95);
      if(dpos==='WA') pos.y=clamp(pos.y,34,66);
      if(dpos==='GA') pos.y=clamp(pos.y,5,66);
      if(dpos==='GS') pos.y=clamp(pos.y,5,33);
    } else {
      if(dpos==='GK') pos.x=clamp(pos.x,67,96);
      if(dpos==='GD') pos.x=clamp(pos.x,34,96);
      if(dpos==='WD') pos.x=clamp(pos.x,34,66);
      if(dpos==='C') pos.x=clamp(pos.x,5,95);
      if(dpos==='WA') pos.x=clamp(pos.x,34,66);
      if(dpos==='GA') pos.x=clamp(pos.x,5,66);
      if(dpos==='GS') pos.x=clamp(pos.x,5,33);
    }
    pos.x=clamp(pos.x,4,96);pos.y=clamp(pos.y,4,96);return pos;
  }
  function createDefenders(){
    clearDefenders();
    const attackers=attackTokens();
    attackers.forEach((a,i)=>{
      const ap=pct(a), el=document.createElement('div');
      el.className='token defender-token';el.textContent=DEF_POS[i];el.dataset.name=`AI ${DEF_POS[i]}`;
      const offset=portrait()?{x:(i%2?5:-5),y:4}:{x:4,y:(i%2?5:-5)};
      const p=legalise({x:ap.x+offset.x,y:ap.y+offset.y},DEF_POS[i]);
      el.style.left=`${p.x}%`;el.style.top=`${p.y}%`;board.appendChild(el);
      defenders.push({el,pos:DEF_POS[i],target:i,velocity:{x:0,y:0}});
    });
  }
  function clearDefenders(){defenders.forEach(d=>d.el.remove());defenders=[]}
  function targetFor(d, attackers){
    if(!attackers.length)return {x:50,y:50};
    if(mode==='man') return pct(attackers[d.target%attackers.length]);
    if(mode==='zone'){
      const zones=portrait()?[[50,84],[34,69],[66,69],[50,50],[34,31],[66,31],[50,16]]:[[84,50],[69,34],[69,66],[50,50],[31,34],[31,66],[16,50]];
      const z=zones[DEF_POS.indexOf(d.pos)]||{x:50,y:50};
      let nearest=pct(attackers[0]),best=999;attackers.forEach(a=>{const ap=pct(a),dd=dist(ap,{x:z[0],y:z[1]});if(dd<best){best=dd;nearest=ap}});
      return {x:z[0]*.55+nearest.x*.45,y:z[1]*.55+nearest.y*.45};
    }
    // circle pressure: GK/GD collapse to likely shooting circle, others pressure ball/nearest attacker.
    if(d.pos==='GK'||d.pos==='GD') return portrait()?{x:50,y:84}:{x:84,y:50};
    if(ballOwner) return pct(ballOwner);
    return pct(attackers[d.target%attackers.length]);
  }
  function step(ts){
    if(!simRunning)return;
    const dt=Math.min(40,ts-lastAt||16)/16.67;lastAt=ts;
    const attackers=attackTokens();
    defenders.forEach(d=>{
      let t=targetFor(d,attackers),p=pct(d.el);
      // defender stays slightly goal-side rather than exactly overlapping attacker
      if(mode==='man'){
        const goal=portrait()?{x:50,y:96}:{x:96,y:50};
        const vx=goal.x-t.x,vy=goal.y-t.y,len=Math.hypot(vx,vy)||1;t={x:t.x+vx/len*3.3,y:t.y+vy/len*3.3};
      }
      const reaction=mode==='zone'?.075:mode==='circle'?.105:.09;
      const n=legalise({x:p.x+(t.x-p.x)*reaction*dt,y:p.y+(t.y-p.y)*reaction*dt},d.pos);
      d.el.style.left=`${n.x}%`;d.el.style.top=`${n.y}%`;
    });
    evaluate();
    frame=requestAnimationFrame(step);
  }
  function evaluate(){
    const attackers=attackTokens(); if(!attackers.length||!defenders.length)return;
    let pressure=0,space=0;
    attackers.forEach(a=>{const ap=pct(a);let nearest=999;defenders.forEach(d=>nearest=Math.min(nearest,dist(ap,pct(d.el))));pressure+=Math.max(0,12-nearest)/12;space+=Math.min(1,nearest/12)});
    metrics.pressure+=pressure/attackers.length;metrics.space+=space/attackers.length;metrics.frames++;
  }
  function resetMetrics(){metrics={pressure:0,space:0,entries:0,frames:0}}
  function showResult(){
    const panel=document.getElementById('simResult');if(!panel)return;
    const pressure=metrics.frames?metrics.pressure/metrics.frames:0,space=metrics.frames?metrics.space/metrics.frames:0;
    const score=Math.round(clamp((space*68+(1-pressure)*32)*100,0,100));
    let verdict=score>=72?'Strong attacking shape':score>=50?'Playable, but vulnerable':'Defence is winning this pattern';
    let tip=mode==='man'?'Create separation with a double lead or screen before the second pass.':mode==='zone'?'Use width, hold one player deep and make the zone turn before entering the circle.':'Pull GD away from the circle before committing GA/GS to the final lead.';
    panel.hidden=false;panel.innerHTML=`<div><span>PLAY SCORE</span><strong>${score}</strong><small>/100</small></div><div><b>${verdict}</b><p>Average attacking space ${Math.round(space*100)}% · defensive pressure ${Math.round(pressure*100)}%</p><p>${tip}</p></div>`;
  }
  function start(){
    if(simRunning){stop();return}
    mode=document.getElementById('defenceStyle')?.value||'man';createDefenders();resetMetrics();simRunning=true;startAt=lastAt=performance.now();
    const b=document.getElementById('simulatePlay');if(b){b.classList.add('sim-active');b.querySelector('b').textContent='Stop AI'}
    document.getElementById('simResult').hidden=true;
    document.getElementById('courtHint').textContent='AI defence is reacting — play or record your attacking movement';
    frame=requestAnimationFrame(step);
    // If a recorded playback exists, trigger it so attack and defence run together.
    const play=document.getElementById('playMovement'); if(play && !play.classList.contains('playing')) play.click();
  }
  function stop(){
    simRunning=false;if(frame)cancelAnimationFrame(frame);frame=null;
    const b=document.getElementById('simulatePlay');if(b){b.classList.remove('sim-active');b.querySelector('b').textContent='Simulate'}
    showResult();document.getElementById('courtHint').textContent='Simulation complete — review the play score';
  }
  document.getElementById('simulatePlay')?.addEventListener('click',()=>simRunning?stop():start());
  document.getElementById('clearSimulation')?.addEventListener('click',()=>{simRunning=false;if(frame)cancelAnimationFrame(frame);clearDefenders();const p=document.getElementById('simResult');if(p)p.hidden=true});
  window.addEventListener('orientationchange',()=>setTimeout(()=>{if(defenders.length)createDefenders()},250));
})();