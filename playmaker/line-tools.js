// Select and delete individual pass/lead lines on the Playmaker court.
(() => {
  const svg = document.getElementById('courtLines');
  const deleteBtn = document.getElementById('deleteLine');
  if (!svg || !deleteBtn || typeof drawLines !== 'function') return;

  let selectedIndex = null;
  const originalDrawLines = drawLines;

  function setHint(text) {
    const hint = document.getElementById('courtHint');
    if (hint) hint.textContent = text;
  }

  function decorateLines() {
    [...svg.querySelectorAll('line')].forEach((line, index) => {
      line.dataset.lineIndex = String(index);
      line.classList.add('editable-line');
      if (index === selectedIndex) line.classList.add('selected-line');
      line.addEventListener('pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = index;
        decorateLines();
        deleteBtn.disabled = false;
        deleteBtn.classList.add('active-delete');
        const item = state.lines[index];
        setHint(`${item?.type === 'pass' ? 'Pass' : 'Lead'} selected — tap Delete to remove it`);
      });
    });
  }

  drawLines = function () {
    originalDrawLines();
    if (selectedIndex !== null && selectedIndex >= state.lines.length) selectedIndex = null;
    decorateLines();
    deleteBtn.disabled = selectedIndex === null;
    deleteBtn.classList.toggle('active-delete', selectedIndex !== null);
  };

  deleteBtn.addEventListener('click', () => {
    if (selectedIndex === null || !state.lines[selectedIndex]) {
      setHint('Tap a pass or lead line first');
      return;
    }
    state.lines.splice(selectedIndex, 1);
    selectedIndex = null;
    drawLines();
    setHint('Selected line deleted');
  });

  document.getElementById('clearLines')?.addEventListener('click', () => {
    selectedIndex = null;
    deleteBtn.disabled = true;
    deleteBtn.classList.remove('active-delete');
  });

  document.querySelectorAll('[data-tool]').forEach(button => {
    button.addEventListener('click', () => {
      selectedIndex = null;
      drawLines();
    });
  });

  drawLines();
})();
