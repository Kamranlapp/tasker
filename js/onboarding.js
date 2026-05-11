// ── Hint card system ───────────────────────────────────────────

let _hintIdx = 0;

function _demoHTML(demo, rowIdx) {
  let delay = (rowIdx || 0) * 0.75;
  return demo.map(d => {
    if (d.arrow) return `<span class="oh-arr">▶</span><span class="oh-arr-child"></span>`;
    if (d.rc) {
      const s = delay.toFixed(2);
      delay += 0.22;
      return `<span class="oh-mouse"><span class="oh-mb-r" style="animation-delay:${s}s"></span></span>`;
    }
    if (d.k) {
      const s = delay.toFixed(2);
      delay += 0.22;
      return `<kbd class="oh-kbd" style="animation-delay:${s}s">${d.k}</kbd>`;
    }
    if (d.drag)  return `<span class="oh-drag-bar"></span>`;
    if (d.hold)  return `<span class="oh-timer"><span class="oh-timer-fill"></span></span>`;
    if (d.file)  return `<span class="oh-file"></span>`;
    if (d.swipe) return `<span class="oh-swipe"></span>`;
    if (d.tab)   return `<span class="oh-tab"></span>`;
    if (d.t)     return `<span class="oh-icon">${d.t}</span>`;
    return '';
  }).join('');
}

function _cardHTML(idx) {
  const cfg   = HINTS[idx];
  const total = HINTS.length;
  const rows  = cfg.rows.map((r, i) =>
    `<div class="oh-row">
      <span class="oh-demo">${_demoHTML(r.demo, i)}</span>
      <span class="oh-text">${r.text}</span>
    </div>`
  ).join('');

  return `
    <div class="oh-header">
      <span class="oh-title">${cfg.title}</span>
      <span class="oh-counter">${idx + 1} / ${total}</span>
    </div>
    <div class="oh-divider"></div>
    <div class="oh-rows">${rows}</div>
    <div class="oh-divider oh-divider-lo"></div>
    <div class="oh-footer">
      <button class="oh-nav-btn" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>← Prev</button>
      <button class="oh-close-btn">Close all</button>
      <button class="oh-nav-btn" data-dir="1" ${idx === total - 1 ? 'disabled' : ''}>Next →</button>
    </div>`;
}

function _attach(card) {
  card.querySelectorAll('.oh-nav-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = _hintIdx + parseInt(btn.dataset.dir, 10);
      if (next >= 0 && next < HINTS.length) _goTo(next);
    });
  });
  card.querySelector('.oh-close-btn')?.addEventListener('click', closeAllHints);
}

function _goTo(idx) {
  const card = document.getElementById('ob-hint-card');
  if (!card) return;
  const body = card.querySelector('.oh-body');
  body.classList.add('oh-fade');
  setTimeout(() => {
    _hintIdx = idx;
    body.innerHTML = _cardHTML(idx);
    _attach(card);
    body.classList.remove('oh-fade');
  }, 140);
}

// ── Public API ─────────────────────────────────────────────────

function showAllHints() {
  closeAllHints();
  setTimeout(() => { _hintIdx = 0; _show(); }, 350);
}

function closeAllHints() {
  const el = document.getElementById('ob-hint-card');
  if (!el) return;
  el.classList.remove('oh-visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  localStorage.setItem('hints_seen', '1');
}

function maybeShowHints() {
  if (!localStorage.getItem('hints_seen')) setTimeout(_show, 600);
}

function _show() {
  if (document.getElementById('ob-hint-card')) return;
  _hintIdx = 0;

  const card = document.createElement('div');
  card.id = 'ob-hint-card';

  const body = document.createElement('div');
  body.className = 'oh-body';
  body.innerHTML = _cardHTML(0);
  card.appendChild(body);

  document.body.appendChild(card);
  _attach(card);

  localStorage.setItem('hints_seen', '1');
  requestAnimationFrame(() => card.classList.add('oh-visible'));
}
