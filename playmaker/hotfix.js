// Touch/drag hotfix for Playmaker court controls.
(() => {
  const board = document.getElementById('courtBoard');
  if (!board) return;

  let activeToken = null;
  let pointerId = null;

  const setHint = (text) => {
    const hint = document.getElementById('courtHint');
    if (hint) hint.textContent = text;
  };

  // Re-assert tool selection on every toolbar tap so touch browsers reliably
  // return to move mode after Pass/Lead.
  document.querySelectorAll('.tool[data-tool]').forEach(button => {
    button.addEventListener('click', () => {
      state.tool = button.dataset.tool;
      document.querySelectorAll('.tool[data-tool]').forEach(x => x.classList.toggle('active', x === button));
      if (state.tool === 'move') setHint('Drag any player to reposition them');
    });
  });

  board.addEventListener('pointerdown', e => {
    const token = e.target.closest('.token');
    if (!token || state.tool !== 'move') return;
    e.preventDefault();
    activeToken = token;
    pointerId = e.pointerId;
    activeToken.classList.add('selected');
    try { activeToken.setPointerCapture(pointerId); } catch (_) {}
  }, { passive: false, capture: true });

  board.addEventListener('pointermove', e => {
    if (!activeToken || state.tool !== 'move' || (pointerId !== null && e.pointerId !== pointerId)) return;
    e.preventDefault();
    const r = board.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(4, Math.min(96, ((e.clientY - r.top) / r.height) * 100));
    activeToken.style.left = `${x}%`;
    activeToken.style.top = `${y}%`;
    state.tokenPositions[activeToken.dataset.player] = { x, y };
  }, { passive: false, capture: true });

  const finish = e => {
    if (!activeToken) return;
    if (pointerId !== null && e.pointerId !== undefined && e.pointerId !== pointerId) return;
    activeToken.classList.remove('selected');
    activeToken = null;
    pointerId = null;
  };

  board.addEventListener('pointerup', finish, true);
  board.addEventListener('pointercancel', finish, true);
})();
