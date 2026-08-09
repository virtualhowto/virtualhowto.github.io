// Select/delete lead lines. Passes are timed ball events and are not drawn as persistent lines.
(() => {
  const svg = document.getElementById('courtLines');
  const deleteBtn = document.getElementById('deleteLine');
  if (!svg || !deleteBtn) return;

  let selectedStateIndex = null;

  function setHint(text) {
    const hint = document.getElementById('courtHint');
    if (hint) hint.textContent = text;
  }

  drawLines = function () {
    svg.innerHTML='';
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML='<marker id="arrowDark" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#172554"/></marker>';
    svg.appendChild(defs);

    state.lines.forEach((item, stateIndex) => {
      if (item.type === 'pass') return;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',item.a.x+'%');line.setAttribute('y1',item.a.y+'%');
      line.setAttribute('x2',item.b.x+'%');line.setAttribute('y2',item.b.y+'%');
      line.setAttribute('stroke','#172554');line.setAttribute('stroke-width','3');
      line.setAttribute('stroke-dasharray','8 6');line.setAttribute('marker-end','url(#arrowDark)');
      line.dataset.lineIndex=String(stateIndex);line.classList.add('editable-line');
      if(stateIndex===selectedStateIndex)line.classList.add('selected-line');
      line.addEventListener('pointerdown',event=>{
        event.preventDefault();event.stopPropagation();
        selectedStateIndex=stateIndex;drawLines();
        setHint('Lead selected — tap Delete to remove it');
      });
      svg.appendChild(line);
    });

    if(selectedStateIndex!==null && (!state.lines[selectedStateIndex] || state.lines[selectedStateIndex].type==='pass')) selectedStateIndex=null;
    deleteBtn.disabled=selectedStateIndex===null;
    deleteBtn.classList.toggle('active-delete',selectedStateIndex!==null);
  };

  deleteBtn.addEventListener('click',()=>{
    if(selectedStateIndex===null || !state.lines[selectedStateIndex]){setHint('Tap a lead line first');return;}
    state.lines.splice(selectedStateIndex,1);selectedStateIndex=null;drawLines();setHint('Selected lead deleted');
  });

  document.getElementById('clearLines')?.addEventListener('click',()=>{selectedStateIndex=null;deleteBtn.disabled=true;deleteBtn.classList.remove('active-delete');});
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{selectedStateIndex=null;drawLines();}));
  drawLines();
})();
