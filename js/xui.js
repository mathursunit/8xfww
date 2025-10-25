// xui add-on: Stats & About toast (isolated; safe to include once)
(() => {
  const qs = sel => document.querySelector(sel);
  const toast = qs('#xuiToast');
  const content = qs('#xuiToastContent');
  const closeBtn = qs('#xuiToastClose');
  const statsBtn = qs('#xuiStatsBtn');
  const aboutBtn = qs('#xuiAboutBtn');

  if (!toast || !content || !closeBtn || !statsBtn || !aboutBtn) return;

  function openToast(html) {
    content.innerHTML = html;
    toast.classList.remove('xui-hidden');
    toast.setAttribute('aria-hidden', 'false');
    setTimeout(() => closeBtn.focus(), 0);
  }
  function closeToast() {
    toast.classList.add('xui-hidden');
    toast.setAttribute('aria-hidden', 'true');
  }

  toast.addEventListener('click', (e) => { if (e.target === toast) closeToast(); });
  closeBtn.addEventListener('click', closeToast);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !toast.classList.contains('xui-hidden')) closeToast(); });

  const safeParseInt = (v, d=0) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  };
  function getTodayStats() {
    try {
      const solved = safeParseInt(localStorage.getItem('x-solved'));
      const tries  = safeParseInt(localStorage.getItem('x-tries'));
      const best   = safeParseInt(localStorage.getItem('x-best'));
      const streak = safeParseInt(localStorage.getItem('x-streak'));
      return { solved, tries, best, streak };
    } catch {
      return { solved:0, tries:0, best:0, streak:0 };
    }
  }

  statsBtn.addEventListener('click', () => {
    const { solved, tries, best, streak } = getTodayStats();
    openToast(`
      <h3 id="xuiToastTitle">Today’s Stats</h3>
      <div class="xui-kv" role="table">
        <div role="row"><strong>Boards solved</strong></div><div role="cell">${solved||0}/8</div>
        <div role="row"><strong>Total tries used</strong></div><div role="cell">${tries||0}</div>
        <div role="row"><strong>Best (all time)</strong></div><div role="cell">${best || '—'}</div>
        <div role="row"><strong>Current streak</strong></div><div role="cell">${streak || 0}</div>
      </div>
    `);
  });

  aboutBtn.addEventListener('click', () => {
    openToast(`
      <h3 id="xuiToastTitle">About</h3>
      <p>Disclaimer: This is a fun project to learn coding and has no commercial value.
      All rights are with the amazing Britannica only.</p>
    `);
  });
})();