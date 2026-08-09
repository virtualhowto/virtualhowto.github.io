// AI Demo Game: cycles through standard netball attacking patterns against the existing defence engine.
(() => {
  const board=document.getElementById('courtBoard');
  const startBtn=document.getElementById('demoGame');
  const nextBtn=document.getElementById('nextDemoPlay');
  const panel=document.getElementById('demoPanel');
  const title=document.getElementById('demoTitle');
  const note=document.getElementById('demoNote');
  if(!board||!startBtn||!panel)return;

  const POS=['GS','GA','WA','C','WD','GD','GK'];
  let running=false,raf=null,playIndex=0,startedAt=0,lastPassIndex=-1,scoreUs=0,scoreAI=0;
  const passBall=document.createElement('div');passBall.className='demo-ball';board.appendChild(passBall);
  const tokens=()=>[...board.querySelectorAll('.token:not(.defender-token)')].slice(0,7);
  const portrait=()=>matchMedia('(orientation:portrait)').matches&&matchMedia('(max-width:520px)').matches;
  const mix=(a,b,f)=>a+(b-a)*f;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  // Keyframes are authored landscape left-to-right, then transformed for portrait.
  const plays=[
    {name:'Centre Pass — Split Lead',note:'WA and GA split away from centre, creating two first-pass options before C drives through the middle.',dur:6200,
      frames:[
        [[12,50],[26,38],[36,68],[50,50],[62,32],[75,68],[88,50]],
        [[12,50],[28,30],[41,77],[52,51],[63,31],[75,68],[88,50]],
        [[14,50],[38,28],[48,72],[60,49],[65,31],[76,67],[88,50]],
        [[18,48],[48,33],[58,64],[69,48],[67,32],[78,66],[88,50]],
        [[24,48],[59,39],[69,58],[78,49],[68,31],[80,64],[88,50]]],
      passes:[[800,3,2],[2450,2,1],[4100,1,0]]},
    {name:'Centre Pass — Front Cut',note:'GA shows short, then cuts across the face while WA holds width. The second receiver becomes available behind the first lead.',dur:6000,
      frames:[
        [[12,50],[27,50],[38,25],[50,50],[63,72],[76,34],[88,50]],
        [[13,50],[34,42],[41,26],[51,50],[63,72],[76,34],[88,50]],
        [[17,50],[45,35],[48,28],[59,51],[63,72],[76,34],[88,50]],
        [[23,50],[56,32],[58,31],[68,52],[64,70],[77,34],[88,50]],
        [[30,50],[67,37],[69,35],[77,51],[66,68],[79,35],[88,50]]],
      passes:[[700,3,1],[2300,1,2],[3900,2,0]]},
    {name:'Transition — Wide Reset',note:'If the middle is blocked, the ball resets wide through WA before C and GA re-time their drives into the attacking third.',dur:6500,
      frames:[
        [[16,50],[31,42],[41,28],[50,50],[62,72],[75,38],[87,50]],
        [[17,50],[33,43],[48,22],[55,52],[63,72],[75,38],[87,50]],
        [[20,50],[40,44],[58,20],[63,55],[64,70],[76,39],[87,50]],
        [[25,50],[51,43],[67,29],[72,52],[66,66],[78,41],[87,50]],
        [[31,50],[65,42],[77,39],[80,50],[67,64],[80,43],[87,50]]],
      passes:[[700,3,2],[2400,2,3],[4100,3,1],[5200,1,0]]},
    {name:'Circle Entry — Double Lead',note:'GS presents then clears while GA drives the opposite channel, forcing GK and GD to choose before the final circle feed.',dur:6200,
      frames:[
        [[70,50],[62,36],[51,62],[44,50],[35,31],[25,68],[15,50]],
        [[73,45],[66,42],[55,61],[49,50],[36,31],[25,68],[15,50]],
        [[77,37],[71,49],[62,58],[57,51],[38,31],[25,68],[15,50]],
        [[81,42],[76,58],[70,55],[66,50],[40,31],[25,68],[15,50]],
        [[86,50],[80,65],[76,53],[72,49],[42,31],[25,68],[15,50]]],
      passes:[[900,3,2],[2600,2,1],[4450,1,0]]}
  ];

  function transform(p){
    if(!portrait())return {x:p[0],y:p[1]};
    return {x:p[1],y:p[0]};
  }
  function setPositions(frame){tokens().forEach((t,i)=>{const p=transform(frame[i]);t.style.left=`${p.x}%`;t.style.top=`${p.y}%`;if(window.state?.tokenPositions)state.tokenPositions[t.dataset.player]={x:p.x,y:p.y}})}
  function animateBall(pass,elapsed,frameNow){
    const [pt,from,to]=pass,window=520;
    if(elapsed<pt||elapsed>pt+window){passBall.style.display='none';return false}
    const a=transform(frameNow[from]),b=transform(frameNow[to]),f=clamp((elapsed-pt)/window,0,1),e=f<.5?2*f*f:1-Math.pow(-2*f+2,2)/2;
    passBall.style.left=`${mix(a.x,b.x,e)}%`;passBall.style.top=`${mix(a.y,b.y,e)}%`;passBall.style.display='block';return true;
  }
  function frameAt(play,elapsed){
    const seg=(play.dur)/(play.frames.length-1),idx=Math.min(play.frames.length-2,Math.floor(elapsed/seg)),f=clamp((elapsed-idx*seg)/seg,0,1);
    return play.frames[idx].map((p,i)=>[mix(p[0],play.frames[idx+1][i][0],f),mix(p[1],play.frames[idx+1][i][1],f)]);
  }
  function startDefence(){
    const style=document.getElementById('defenceStyle'); if(style)style.value=['man','zone','circle'][playIndex%3];
    const sim=document.getElementById('simulatePlay');
    if(sim&&!sim.classList.contains('sim-active')) sim.click();
  }
  function stopDefence(){const sim=document.getElementById('simulatePlay');if(sim?.classList.contains('sim-active'))sim.click()}
  function showPlay(){const p=plays[playIndex];title.textContent=p.name;note.textContent=p.note;panel.hidden=false;startBtn.querySelector('b').textContent=running?'Stop Demo':'Demo Game'}
  function startPlay(){
    cancelAnimationFrame(raf);lastPassIndex=-1;startedAt=performance.now();setPositions(plays[playIndex].frames[0]);showPlay();startDefence();raf=requestAnimationFrame(tick);
  }
  function finishPlay(){
    stopDefence();passBall.style.display='none';
    // Deliberately simple outcome model for demonstration mode.
    const success=Math.random()>.33;
    if(success)scoreUs++; else scoreAI++;
    const result=document.getElementById('demoScore');if(result)result.textContent=`Attack ${scoreUs} · Defence ${scoreAI}`;
    if(!running)return;
    playIndex=(playIndex+1)%plays.length;
    setTimeout(()=>{if(running)startPlay()},900);
  }
  function tick(now){
    if(!running)return;const play=plays[playIndex],elapsed=now-startedAt;
    if(elapsed>=play.dur){finishPlay();return}
    const f=frameAt(play,elapsed);setPositions(f);
    let active=false;play.passes.forEach(pass=>{if(!active)active=animateBall(pass,elapsed,f)});if(!active)passBall.style.display='none';
    raf=requestAnimationFrame(tick);
  }
  startBtn.addEventListener('click',()=>{
    running=!running;
    if(running){scoreUs=0;scoreAI=0;playIndex=0;startPlay();}
    else{cancelAnimationFrame(raf);stopDefence();passBall.style.display='none';startBtn.querySelector('b').textContent='Demo Game';note.textContent='Demo stopped.';}
  });
  nextBtn?.addEventListener('click',()=>{playIndex=(playIndex+1)%plays.length;if(running)startPlay();else{setPositions(plays[playIndex].frames[0]);showPlay()}});
})();