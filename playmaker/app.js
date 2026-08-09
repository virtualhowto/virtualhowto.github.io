const POSITIONS=['GS','GA','WA','C','WD','GD','GK'];
const defaultPlayers=['Mia','Ava','Ruby','Sophie','Ella','Zoe','Grace','Chloe','Lily','Evie'].map((name,i)=>({id:crypto.randomUUID(),name,preferred:POSITIONS[i%7]}));
const state={
  players:JSON.parse(localStorage.getItem('pm_players')||'null')||defaultPlayers,
  plays:JSON.parse(localStorage.getItem('pm_plays')||'[]'),
  lines:[],tool:'move',ourScore:0,oppScore:0,tokenPositions:{}
};
const $=id=>document.getElementById(id);
const save=()=>{localStorage.setItem('pm_players',JSON.stringify(state.players));localStorage.setItem('pm_plays',JSON.stringify(state.plays));};

function nav(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('.bottom-nav [data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===id));
  if(id==='team')renderPlayers();
  if(id==='court')renderCourt();
  if(id==='playbook')renderPlays();
  if(id==='rotations')renderRotations();
  if(id==='game')renderGame();
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));

function renderPlayers(){
  $('playerList').innerHTML='';
  state.players.forEach(p=>{
    const el=document.createElement('div');
    el.className='player-card';
    el.innerHTML=`<div class="avatar">${p.name.slice(0,1)}</div><div class="meta"><strong>${p.name}</strong><br><small>Preferred: ${p.preferred}</small></div><button>Edit</button>`;
    el.querySelector('button').onclick=()=>{
      const name=prompt('Player name',p.name); if(name)p.name=name;
      const pos=prompt('Preferred position',p.preferred);
      if(POSITIONS.includes(pos?.toUpperCase()))p.preferred=pos.toUpperCase();
      save();renderPlayers();renderCourt();
    };
    $('playerList').appendChild(el);
  });
}
$('addPlayer').onclick=()=>{
  const name=prompt('Player name'); if(!name)return;
  state.players.push({id:crypto.randomUUID(),name,preferred:'C'});save();renderPlayers();
};

function isPortraitCourt(){return matchMedia('(max-width:520px)').matches}
function defaultCourtPositions(){
  if(isPortraitCourt()) return [[50,14],[32,24],[68,37],[50,50],[32,63],[68,76],[50,86],[16,92],[50,92],[84,92]];
  return [[14,50],[24,32],[37,68],[50,50],[63,32],[76,68],[86,50],[12,88],[50,88],[88,88]];
}
function renderCourt(){
  const board=$('courtBoard');
  board.querySelectorAll('.token').forEach(x=>x.remove());
  const defaults=defaultCourtPositions();
  state.players.slice(0,10).forEach((p,i)=>{
    const stored=state.tokenPositions[p.id];
    const pos=stored||{x:defaults[i][0],y:defaults[i][1]};
    const t=document.createElement('div');
    t.className='token'+(i>6?' bench':'');
    t.textContent=i<7?POSITIONS[i]:'B';
    t.dataset.player=p.id;t.dataset.name=p.name;
    t.style.left=pos.x+'%';t.style.top=pos.y+'%';
    makeDraggable(t);board.appendChild(t);
  });
  drawLines();
}
function makeDraggable(el){
  let dragging=false;
  el.addEventListener('pointerdown',e=>{
    if(state.tool==='move'){
      dragging=true;el.setPointerCapture?.(e.pointerId);el.classList.add('selected');
    }else handleLineClick(el);
  });
  el.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const r=$('courtBoard').getBoundingClientRect();
    const x=Math.max(3,Math.min(97,(e.clientX-r.left)/r.width*100));
    const y=Math.max(3,Math.min(97,(e.clientY-r.top)/r.height*100));
    el.style.left=x+'%';el.style.top=y+'%';
    state.tokenPositions[el.dataset.player]={x,y};
  });
  const end=()=>{dragging=false;el.classList.remove('selected')};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
}
let lineStart=null;
function handleLineClick(el){
  if(!lineStart){
    lineStart=el;el.classList.add('selected');
    $('courtHint').textContent='Now tap the destination player';
    return;
  }
  const a={x:parseFloat(lineStart.style.left),y:parseFloat(lineStart.style.top)};
  const b={x:parseFloat(el.style.left),y:parseFloat(el.style.top)};
  state.lines.push({a,b,type:state.tool});
  lineStart.classList.remove('selected');lineStart=null;
  $('courtHint').textContent=state.tool==='pass'?'Pass added':'Lead added';
  drawLines();
}
function drawLines(){
  const svg=$('courtLines');svg.innerHTML='';
  const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
  defs.innerHTML='<marker id="arrowWhite" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="white"/></marker><marker id="arrowDark" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#172554"/></marker>';
  svg.appendChild(defs);
  state.lines.forEach(l=>{
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',l.a.x+'%');line.setAttribute('y1',l.a.y+'%');line.setAttribute('x2',l.b.x+'%');line.setAttribute('y2',l.b.y+'%');
    const pass=l.type==='pass';line.setAttribute('stroke',pass?'#fff':'#172554');line.setAttribute('stroke-width','3');
    if(!pass)line.setAttribute('stroke-dasharray','8 6');
    line.setAttribute('marker-end',pass?'url(#arrowWhite)':'url(#arrowDark)');
    svg.appendChild(line);
  });
}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{
  state.tool=b.dataset.tool;
  document.querySelectorAll('.tool[data-tool]').forEach(x=>x.classList.toggle('active',x===b));
  if(lineStart){lineStart.classList.remove('selected');lineStart=null}
  $('courtHint').textContent=state.tool==='move'?'Drag players to position them':state.tool==='pass'?'Tap a passer, then receiver':'Tap a player, then where the lead finishes';
});
$('clearLines').onclick=()=>{state.lines=[];if(lineStart){lineStart.classList.remove('selected');lineStart=null}drawLines();$('courtHint').textContent='Court cleared'};

$('savePlay').onclick=()=>{
  const name=$('playName').value.trim()||`Play ${state.plays.length+1}`;
  const tokens=[...$('courtBoard').querySelectorAll('.token')].map(t=>({player:t.dataset.player,label:t.textContent,x:t.style.left,y:t.style.top}));
  state.plays.unshift({id:crypto.randomUUID(),name,note:$('playNote').value.trim(),tokens,lines:[...state.lines],created:new Date().toISOString()});
  save();$('playName').value='';$('playNote').value='';$('courtHint').textContent=`Saved “${name}”`;
};
function renderPlays(){
  const list=$('playList');list.innerHTML=state.plays.length?'':'<div class="game-card"><p>No plays yet. Build your first play on the Court tab.</p></div>';
  state.plays.forEach(p=>{
    const el=document.createElement('div');el.className='play-item';
    el.innerHTML=`<div><strong>${p.name}</strong><p>${p.note||'No coaching note'}</p></div><button>Delete</button>`;
    el.querySelector('button').onclick=()=>{state.plays=state.plays.filter(x=>x.id!==p.id);save();renderPlays()};
    list.appendChild(el);
  });
}
function renderRotations(){
  const periods=+$('matchFormat').value;$('rotationGrid').innerHTML='';
  for(let q=0;q<periods;q++){
    const card=document.createElement('div');card.className='period-card';card.innerHTML=`<h3>${periods===4?'Quarter '+(q+1):'Half '+(q+1)}</h3>`;
    POSITIONS.forEach((pos,i)=>{
      const row=document.createElement('div');row.className='rotation-row';
      row.innerHTML=`<span>${pos}</span><select>${state.players.map((p,j)=>`<option value="${p.id}" ${j===((i+q)%state.players.length)?'selected':''}>${p.name}</option>`).join('')}</select>`;
      card.appendChild(row);
    });$('rotationGrid').appendChild(card);
  }
}
$('matchFormat').onchange=renderRotations;$('autoRotate').onclick=renderRotations;
function renderGame(){
  $('gameLineup').innerHTML='';
  POSITIONS.forEach((pos,i)=>{const p=state.players[i];const d=document.createElement('div');d.innerHTML=`<strong>${pos}</strong><br>${p?.name||'Unassigned'}`;$('gameLineup').appendChild(d)});
  $('ourScore').querySelector('strong').textContent=state.ourScore;$('oppScore').querySelector('strong').textContent=state.oppScore;
}
$('ourPlus').onclick=()=>{state.ourScore++;renderGame()};$('ourScore').onclick=()=>{state.ourScore++;renderGame()};
$('oppMinus').onclick=()=>{state.oppScore=Math.max(0,state.oppScore-1);renderGame()};$('oppScore').onclick=()=>{state.oppScore++;renderGame()};
let seconds=900,timerId=null;
function showTimer(){$('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
$('timerToggle').onclick=()=>{if(timerId){clearInterval(timerId);timerId=null;$('timerToggle').textContent='Start'}else{timerId=setInterval(()=>{if(seconds>0){seconds--;showTimer()}else{clearInterval(timerId);timerId=null}},1000);$('timerToggle').textContent='Pause'}};
$('collapsePanel').onclick=()=>$('collapsePanel').closest('.coach-panel').classList.toggle('collapsed');

let deferredPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').hidden=false});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').hidden=true}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.addEventListener('resize',()=>{if(document.querySelector('#court.active')){state.tokenPositions={};renderCourt()}});
renderPlayers();renderCourt();