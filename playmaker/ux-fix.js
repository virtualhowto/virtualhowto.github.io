// Playmaker UX correction layer: 7-on-court assignments, bench tray, attack direction, mode controls.
(()=>{
  const board=document.getElementById('courtBoard'); if(!board||!window.state)return;
  const POS=['GS','GA','WA','C','WD','GD','GK'];
  state.assignments=JSON.parse(localStorage.getItem('pm_assignments')||'null')||{};
  state.attackDirection=localStorage.getItem('pm_attack_direction')||'right';
  const saveUx=()=>{localStorage.setItem('pm_assignments',JSON.stringify(state.assignments));localStorage.setItem('pm_attack_direction',state.attackDirection)};

  function playerFor(pos){
    const id=state.assignments[pos];
    if(id){const p=state.players.find(x=>x.id===id);if(p)return p}
    const preferred=state.players.find(p=>p.preferred===pos&&!Object.values(state.assignments).includes(p.id));
    if(preferred){state.assignments[pos]=preferred.id;return preferred}
    const fallback=state.players.find(p=>!Object.values(state.assignments).includes(p.id));
    if(fallback){state.assignments[pos]=fallback.id;return fallback}
    return null;
  }
  POS.forEach(playerFor);saveUx();

  function layout(){
    // Regulation-ish centre-pass reset shape, authored landscape attacking right.
    const right={GS:{x:86,y:50},GA:{x:72,y:38},WA:{x:60,y:66},C:{x:50,y:50},WD:{x:40,y:32},GD:{x:26,y:62},GK:{x:14,y:50}};
    const left={};Object.entries(right).forEach(([k,p])=>left[k]={x:100-p.x,y:p.y});
    return state.attackDirection==='right'?right:left;
  }
  function portraitPoint(p){return matchMedia('(max-width:520px)').matches?{x:p.y,y:p.x}:p}

  function ensureUi(){
    if(document.getElementById('uxModeBar'))return;
    const bar=document.createElement('div');bar.id='uxModeBar';bar.className='ux-mode-bar';bar.innerHTML=`<button data-mode="design" class="active">Design</button><button data-mode="record">Record</button><button data-mode="teach">Teach</button><button data-mode="simulate">Simulate</button>`;
    document.querySelector('.court-stage')?.appendChild(bar);
    const attack=document.createElement('button');attack.id='attackDirection';attack.className='attack-direction';attack.type='button';document.querySelector('.court-stage')?.appendChild(attack);
    const bench=document.createElement('div');bench.id='benchTray';bench.className='bench-tray';document.querySelector('.court-stage')?.appendChild(bench);
    bar.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    attack.addEventListener('click',()=>{state.attackDirection=state.attackDirection==='right'?'left':'right';saveUx();resetPositions();updateAttack();});
    updateAttack();setMode('design');
  }
  function updateAttack(){const b=document.getElementById('attackDirection');if(b)b.textContent=state.attackDirection==='right'?'ATTACK →':'← ATTACK'}
  function setMode(mode){
    document.querySelectorAll('#uxModeBar button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    document.querySelector('.court-toolbar')?.classList.toggle('ux-hidden',mode!=='design'&&mode!=='record');
    document.querySelector('.sim-controls')?.classList.toggle('ux-hidden',mode!=='simulate');
    document.querySelector('.demo-game-controls')?.classList.toggle('ux-hidden',mode!=='teach');
    const toolbar=document.querySelector('.court-toolbar');
    if(toolbar)toolbar.querySelectorAll('.tool').forEach(btn=>{
      const id=btn.id||'',tool=btn.dataset.tool||'';
      let show=true;
      if(mode==='design')show=['move','pass','lead'].includes(tool)||['deleteLine','clearLines'].includes(id);
      if(mode==='record')show=['move'].includes(tool)||['recordMovement','playMovement','resetMovement'].includes(id);
      btn.classList.toggle('ux-tool-hidden',!show);
    });
  }
  function renderBench(){
    const tray=document.getElementById('benchTray');if(!tray)return;
    const used=new Set(Object.values(state.assignments));const bench=state.players.filter(p=>!used.has(p.id));
    tray.innerHTML=`<button class="bench-toggle" type="button">Bench ${bench.length}</button><div class="bench-list">${bench.map(p=>`<button type="button" data-player="${p.id}">${p.name}<small>${p.preferred}</small></button>`).join('')}</div>`;
    tray.querySelector('.bench-toggle')?.addEventListener('click',()=>tray.classList.toggle('open'));
  }
  function attachAssignment(token,pos){
    token.dataset.position=pos;
    token.title='Tap to change player';
    token.addEventListener('dblclick',()=>choosePlayer(pos));
    token.addEventListener('contextmenu',e=>{e.preventDefault();choosePlayer(pos)});
  }
  function choosePlayer(pos){
    const names=state.players.map((p,i)=>`${i+1}. ${p.name} (${p.preferred})`).join('\n');
    const answer=prompt(`Assign ${pos}:\n${names}\n\nEnter player number`);const idx=Number(answer)-1;if(!state.players[idx])return;
    const chosen=state.players[idx];
    Object.keys(state.assignments).forEach(k=>{if(state.assignments[k]===chosen.id)delete state.assignments[k]});
    state.assignments[pos]=chosen.id;saveUx();renderCourtUx();
  }
  function renderCourtUx(){
    board.querySelectorAll('.token:not(.defender-token)').forEach(x=>x.remove());
    const positions=layout();
    POS.forEach(pos=>{
      const p=playerFor(pos);if(!p)return;
      const saved=state.tokenPositions[p.id];const pt=saved||portraitPoint(positions[pos]);
      const t=document.createElement('div');t.className='token';t.textContent=pos;t.dataset.player=p.id;t.dataset.name=p.name;t.style.left=pt.x+'%';t.style.top=pt.y+'%';
      if(typeof makeDraggable==='function')makeDraggable(t);attachAssignment(t,pos);board.appendChild(t);
    });
    if(typeof drawLines==='function')drawLines();renderBench();
  }
  function resetPositions(){state.tokenPositions={};renderCourtUx()}

  ensureUi();
  const originalRender=window.renderCourt;
  window.renderCourt=function(){renderCourtUx()};
  // Preserve positions across orientation/resize: only re-render, never clear tokenPositions.
  window.addEventListener('resize',()=>{if(document.querySelector('#court.active'))renderCourtUx()});
  setTimeout(renderCourtUx,0);
})();