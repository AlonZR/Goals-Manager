// MyGoals front-end — plain JavaScript, no build step.
(() => {
  const INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'];
  const LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

  let state = { subjects: [], goals: [], periods: {} };
  const ui = {
    mobileInterval: safeGet('mg.interval') || 'daily',
    hideDone: safeGet('mg.hideDone') === '1',
    showDesc: safeGet('mg.showDesc') === '1',
    recurring: {}, // per add-row toggle: "subjectId:interval" -> bool
    descHidden: {}, // per add-row: description box collapsed
    focusKey: null,
    dragId: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const board = $('#board');

  // ---------- storage helpers (per-browser UI conveniences only) ----------
  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  // ---------- API ----------
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { location.href = '/login.html'; throw new Error('Signed out'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function load() {
    try {
      state = await api('GET', '/api/state');
      render();
    } catch (e) {
      board.innerHTML = `<p class="empty-board">Can't reach the MyGoals server. Is it running?<br><small>${esc(e.message)}</small></p>`;
    }
  }

  async function run(fn) {
    try { await fn(); } catch (e) { toast(e.message); }
    await load();
  }

  // ---------- formatting ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function periodLabel(interval, d = new Date()) {
    if (interval === 'daily') return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    if (interval === 'weekly') {
      const day = (d.getDay() + 6) % 7; // Mon=0
      const mon = new Date(d); mon.setDate(d.getDate() - day);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const f = (x) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `${f(mon)} – ${f(sun)}`;
    }
    if (interval === 'monthly') return d.toLocaleDateString('en-GB', { month: 'long' });
    return String(d.getFullYear());
  }

  // ---------- rendering ----------
  function render() {
    $('#today').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.body.classList.toggle('hide-done', ui.hideDone);
    const tbtn = $('#toggleDone');
    tbtn.textContent = ui.hideDone ? 'Show done' : 'Hide done';
    tbtn.classList.toggle('active', ui.hideDone);
    document.body.classList.toggle('show-desc', ui.showDesc);
    const dbtn = $('#toggleDesc');
    dbtn.textContent = ui.showDesc ? 'Hide details' : 'Show details';
    dbtn.classList.toggle('active', ui.showDesc);
    renderTabs();

    if (!state.subjects.length) {
      board.innerHTML = '<p class="empty-board">No subjects yet — add one with <b>+ Subject</b>.</p>';
      return;
    }
    board.innerHTML = state.subjects.map(renderSubject).join('');

    if (ui.focusKey) {
      const input = board.querySelector(`.add-row[data-key="${ui.focusKey}"] .add-title`);
      if (input) input.focus();
      ui.focusKey = null;
    }
  }

  function renderTabs() {
    $('#intervalTabs').innerHTML = INTERVALS.map((i) => {
      const goals = state.goals.filter((g) => g.interval === i);
      const done = goals.filter((g) => g.doneNow).length;
      return `<button role="tab" data-interval="${i}" aria-selected="${ui.mobileInterval === i}">${LABEL[i]}${goals.length ? ` ${done}/${goals.length}` : ''}</button>`;
    }).join('');
  }

  function renderSubject(s) {
    const goals = state.goals.filter((g) => g.subjectId === s.id);
    const done = goals.filter((g) => g.doneNow).length;
    const pct = goals.length ? Math.round((done / goals.length) * 100) : 0;
    return `
      <section class="subject ${s.collapsed ? 'collapsed' : ''}" data-subject="${s.id}" style="--subject-color:${esc(s.color)}">
        <header class="subject-head">
          <button class="collapse-btn" data-act="collapse" aria-label="Collapse ${esc(s.name)}" aria-expanded="${!s.collapsed}">▾</button>
          <h2 class="subject-name" dir="auto">${esc(s.name)}</h2>
          <span class="subject-stats">${done}/${goals.length} done</span>
          <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <div class="subject-menu">
            <button class="icon-btn" data-act="edit-subject" title="Rename / color" aria-label="Edit subject">✎</button>
            <button class="icon-btn danger" data-act="delete-subject" title="Delete subject" aria-label="Delete subject">🗑</button>
          </div>
        </header>
        <div class="columns">
          ${INTERVALS.map((i) => renderColumn(s, i, goals.filter((g) => g.interval === i))).join('')}
        </div>
      </section>`;
  }

  function renderColumn(s, interval, goals) {
    const key = `${s.id}:${interval}`;
    const recur = !!ui.recurring[key];
    const descOpen = !ui.descHidden[key];
    const done = goals.filter((g) => g.doneNow).length;
    return `
      <div class="column ${ui.mobileInterval === interval ? 'active' : ''}" data-subject="${s.id}" data-interval="${interval}">
        <div class="column-head">
          <span><span class="column-title">${LABEL[interval]}</span>${goals.length ? `<span class="column-count">${done}/${goals.length}</span>` : ''}</span>
          <span class="column-period">${esc(periodLabel(interval))}</span>
        </div>
        <ul class="goals">${goals.map(renderGoal).join('')}</ul>
        <div class="add-row" data-key="${key}">
          <div class="add-line">
          <input type="text" dir="auto" class="add-title" placeholder="Add ${LABEL[interval].toLowerCase()} goal…" maxlength="200" aria-label="New ${LABEL[interval]} goal for ${esc(s.name)}">
          <button class="desc-toggle" data-act="add-desc" aria-pressed="${descOpen}" title="Show / hide description">≡</button>
          <button class="recur-toggle" data-act="recur" aria-pressed="${recur}" title="Recurring: repeats every ${interval.replace('ly', '').replace('dai', 'day')}">↻ ${recur ? 'Repeats' : 'Once'}</button>
          </div>
          <textarea dir="auto" class="add-desc" rows="1" maxlength="2000" placeholder="Description (optional)" title="Enter to add · Shift+Enter for a new line" aria-label="Description" ${descOpen ? '' : 'hidden'}></textarea>
        </div>
      </div>`;
  }

  function renderGoal(g) {
    const badges = [];
    if (g.recurring) {
      badges.push(`<span class="badge" title="Repeats every period">↻ repeats</span>`);
      if (g.streak > 1) badges.push(`<span class="badge streak" title="Periods in a row">🔥 ${g.streak}</span>`);
    } else if (g.rolledCount) {
      badges.push(`<span class="badge" title="Carried over from previous periods">carried ×${g.rolledCount}</span>`);
    }
    return `
      <li class="goal ${g.doneNow ? 'done' : ''} ${g.recurring ? 'recurring' : ''} ${g.description ? 'has-desc' : ''}" draggable="true" data-id="${g.id}">
        <input type="checkbox" class="check" ${g.doneNow ? 'checked' : ''} aria-label="Mark ${esc(g.title)} done">
        <div class="goal-body">
          <div class="goal-title" dir="auto">${esc(g.title)}</div>${g.description ? `<button class="desc-ind" data-act="show-desc" aria-label="Show description" title="Has a description">≡</button>` : ''}
          ${g.description ? `<div class="goal-desc" dir="auto">${esc(g.description)}</div>` : ''}
          ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
        </div>
        <div class="goal-actions">
          <button class="icon-btn" data-act="edit-goal" title="Edit goal (title, description, time, repeat)" aria-label="Edit goal">✎</button>
          <button class="icon-btn" data-act="move" title="Move" aria-label="Move goal">⇄</button>
          <button class="icon-btn danger" data-act="delete-goal" title="Delete" aria-label="Delete goal">✕</button>
        </div>
      </li>`;
  }

  // ---------- actions ----------
  const goalById = (id) => state.goals.find((g) => g.id === id);

  async function addGoal(el) {
    const row = el.closest('.add-row');
    const col = el.closest('.column');
    const input = $('.add-title', row);
    const desc = $('.add-desc', row);
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    const description = desc.value.trim();
    input.value = '';
    desc.value = '';
    ui.focusKey = row.dataset.key;
    await run(() => api('POST', '/api/goals', {
      subjectId: col.dataset.subject,
      interval: col.dataset.interval,
      title,
      description,
      recurring: !!ui.recurring[row.dataset.key],
    }));
  }

  async function toggleGoal(id, checkbox) {
    const g = goalById(id);
    if (g) { g.doneNow = checkbox.checked; checkbox.closest('.goal').classList.toggle('done', g.doneNow); }
    await run(() => api('POST', `/api/goals/${id}/toggle`));
  }

  async function deleteGoal(id) {
    const g = goalById(id);
    await run(() => api('DELETE', `/api/goals/${id}`));
    toast(`Deleted “${g ? g.title : 'goal'}”`, 'Undo', () => run(() => api('POST', '/api/goals/restore', g)));
  }

  function editGoalTitle(titleEl) {
    const id = titleEl.closest('.goal').dataset.id;
    const original = titleEl.textContent;
    const li = titleEl.closest('.goal');
    li.draggable = false;
    titleEl.contentEditable = 'true';
    titleEl.focus();
    document.getSelection().selectAllChildren(titleEl);

    const finish = async (save) => {
      titleEl.removeEventListener('blur', onBlur);
      titleEl.removeEventListener('keydown', onKey);
      titleEl.contentEditable = 'false';
      li.draggable = true;
      const title = titleEl.textContent.trim();
      if (!save || !title || title === original) { titleEl.textContent = original; return; }
      await run(() => api('PATCH', `/api/goals/${id}`, { title }));
    };
    const onBlur = () => finish(true);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    titleEl.addEventListener('blur', onBlur);
    titleEl.addEventListener('keydown', onKey);
  }

  async function moveGoal(id, changes) {
    await run(() => api('PATCH', `/api/goals/${id}`, changes));
  }

  // ---------- move menu ----------
  function closeMenus() { document.querySelectorAll('.move-menu').forEach((m) => m.remove()); }

  function openMoveMenu(goalEl) {
    closeMenus();
    hideTip();
    const g = goalById(goalEl.dataset.id);
    if (!g) return;
    const menu = document.createElement('div');
    menu.className = 'move-menu';
    menu.innerHTML = `
      <div class="menu-label">Move to</div>
      ${INTERVALS.map((i) => `<button data-interval="${i}" ${i === g.interval ? 'disabled' : ''}>${LABEL[i]}${i === g.interval ? ' ✓' : ''}</button>`).join('')}
      <hr>
      <div class="menu-label">Subject</div>
      ${state.subjects.map((s) => `<button data-subject="${s.id}" ${s.id === g.subjectId ? 'disabled' : ''}>${esc(s.name)}${s.id === g.subjectId ? ' ✓' : ''}</button>`).join('')}
      <hr>
      <button data-recurring="${!g.recurring}">${g.recurring ? 'Make one-time' : 'Make recurring ↻'}</button>`;
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      e.stopPropagation();
      closeMenus();
      if (b.dataset.interval) moveGoal(g.id, { interval: b.dataset.interval });
      else if (b.dataset.subject) moveGoal(g.id, { subjectId: b.dataset.subject });
      else if (b.dataset.recurring) moveGoal(g.id, { recurring: b.dataset.recurring === 'true' });
    });
    // Attach to <body> with fixed positioning so the subject card can't clip it.
    document.body.appendChild(menu);
    const anchor = (goalEl.querySelector('[data-act=move]') || goalEl).getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const gap = 4, pad = 8;
    const below = window.innerHeight - anchor.bottom - pad;
    const above = anchor.top - pad;
    let top;
    if (m.height <= below || below >= above) {
      top = anchor.bottom + gap;
      menu.style.maxHeight = `${below - gap}px`;
    } else {
      top = Math.max(pad, anchor.top - gap - Math.min(m.height, above));
      menu.style.maxHeight = `${above - gap}px`;
    }
    const left = Math.min(Math.max(pad, anchor.right - m.width), window.innerWidth - m.width - pad);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  // ---------- edit goal dialog ----------
  const EVERY = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

  function openGoalDialog(id) {
    const g = goalById(id);
    if (!g) return;
    const dlg = $('#goalDialogTpl').content.firstElementChild.cloneNode(true);
    const f = (n) => dlg.querySelector(`[name=${n}]`);
    f('subjectId').innerHTML = state.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    f('title').value = g.title;
    f('description').value = g.description || '';
    f('interval').value = g.interval;
    f('subjectId').value = g.subjectId;
    f('recurring').checked = !!g.recurring;
    const hint = () => {
      $('.repeat-hint', dlg).textContent = f('recurring').checked
        ? `Resets every ${EVERY[f('interval').value]} — check it off each time`
        : `One-time goal — carries over until done`;
    };
    hint();
    f('recurring').addEventListener('change', hint);
    f('interval').addEventListener('change', hint);

    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      const next = { title: f('title').value.trim(), description: f('description').value.trim(), interval: f('interval').value, subjectId: f('subjectId').value, recurring: f('recurring').checked };
      dlg.remove();
      if (!ok || !next.title) return;
      const changes = {};
      for (const k of Object.keys(next)) if (next[k] !== (k === 'recurring' ? !!g[k] : (g[k] || ''))) changes[k] = next[k];
      if (Object.keys(changes).length) moveGoal(g.id, changes);
    });
    dlg.showModal();
    f('title').focus();
  }

  // ---------- subjects ----------
  function subjectDialog(title, initial = {}) {
    return new Promise((resolve) => {
      const dlg = $('#subjectDialogTpl').content.firstElementChild.cloneNode(true);
      $('.dialog-title', dlg).textContent = title;
      dlg.querySelector('[name=name]').value = initial.name || '';
      dlg.querySelector('[name=color]').value = initial.color || randomColor();
      document.body.appendChild(dlg);
      dlg.addEventListener('close', () => {
        const ok = dlg.returnValue === 'ok';
        const data = { name: dlg.querySelector('[name=name]').value.trim(), color: dlg.querySelector('[name=color]').value };
        dlg.remove();
        resolve(ok && data.name ? data : null);
      });
      dlg.showModal();
    });
  }

  function randomColor() {
    const c = ['#7c5cff', '#e85d8f', '#2f9e8f', '#3b82f6', '#e89b2f', '#8bbf3a', '#d95cd0', '#5c7cff'];
    return c[Math.floor(Math.random() * c.length)];
  }

  // ---------- "⋯" menu: backup & account ----------
  let me = { authEnabled: false, email: null };
  api('GET', '/api/me').then((m) => { me = m; }).catch(() => {});

  $('#moreBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.querySelector('.move-menu')) return closeMenus();
    const menu = document.createElement('div');
    menu.className = 'move-menu';
    const compact = getComputedStyle($('#toggleDone')).display === 'none';
    menu.innerHTML = `
      ${compact ? `<div class="menu-label">View</div>
      <button data-do="desc">${ui.showDesc ? '✓ ' : ''}Show details</button>
      <button data-do="done">${ui.hideDone ? '✓ ' : ''}Hide done</button><hr>` : ''}
      <div class="menu-label">Backup</div>
      <button data-do="export">⬇ Download backup</button>
      <button data-do="import">⬆ Restore from backup…</button>
      ${me.authEnabled ? `<hr><div class="menu-label menu-email">${esc(me.email || '')}</div><button data-do="logout">Sign out</button>` : ''}`;
    document.body.appendChild(menu);
    const a = e.currentTarget.getBoundingClientRect();
    menu.style.top = `${a.bottom + 6}px`;
    menu.style.left = `${Math.max(8, a.right - menu.offsetWidth)}px`;
    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      ev.stopPropagation();
      closeMenus();
      if (b.dataset.do === 'desc') $('#toggleDesc').click();
      if (b.dataset.do === 'done') $('#toggleDone').click();
      if (b.dataset.do === 'export') location.href = '/api/export';
      if (b.dataset.do === 'import') $('#importFile').click();
      if (b.dataset.do === 'logout') location.href = '/auth/logout';
    });
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('That file is not a valid backup'); }
    const n = Array.isArray(data.goals) ? data.goals.length : 0;
    if (!confirm(`Replace ALL current goals with this backup (${n} goals)?`)) return;
    try {
      const r = await api('POST', '/api/import', data);
      toast(`Restored ${r.goals} goals in ${r.subjects} subjects`);
    } catch (err) { toast(err.message); }
    await load();
  });

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
    t.hidden = false;
    if (actionLabel) t.querySelector('button').onclick = () => { t.hidden = true; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  }

  // ---------- event wiring ----------
  board.addEventListener('change', (e) => {
    if (e.target.matches('.check')) toggleGoal(e.target.closest('.goal').dataset.id, e.target);
  });

  board.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.add-title')) { e.preventDefault(); addGoal(e.target); }
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.add-desc')) { e.preventDefault(); addGoal(e.target); }
  });

  // Description box grows with its content
  board.addEventListener('input', (e) => {
    if (!e.target.matches('.add-desc')) return;
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  });

  board.addEventListener('dblclick', (e) => {
    const t = e.target.closest('.goal-title');
    if (t && t.contentEditable !== 'true') editGoalTitle(t);
  });

  board.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const subjectEl = btn.closest('.subject');
    const sid = subjectEl && subjectEl.dataset.subject;
    const subject = state.subjects.find((s) => s.id === sid);
    const goalEl = btn.closest('.goal');

    switch (btn.dataset.act) {
      case 'collapse':
        subject.collapsed = !subject.collapsed;
        render();
        api('PATCH', `/api/subjects/${sid}`, { collapsed: subject.collapsed }).catch((err) => toast(err.message));
        break;
      case 'add-desc': {
        const row = btn.closest('.add-row');
        const ta = $('.add-desc', row);
        ta.hidden = !ta.hidden;
        ui.descHidden[row.dataset.key] = ta.hidden;
        btn.setAttribute('aria-pressed', !ta.hidden);
        (ta.hidden ? $('.add-title', row) : ta).focus();
        break;
      }
      case 'show-desc': e.stopPropagation(); showTip(goalEl, true); break;
      case 'recur': {
        const key = btn.closest('.add-row').dataset.key;
        ui.recurring[key] = !ui.recurring[key];
        btn.setAttribute('aria-pressed', ui.recurring[key]);
        btn.textContent = `↻ ${ui.recurring[key] ? 'Repeats' : 'Once'}`;
        $('.add-title', btn.closest('.add-row')).focus();
        break;
      }
      case 'edit-subject': {
        const data = await subjectDialog('Edit subject', subject);
        if (data) run(() => api('PATCH', `/api/subjects/${sid}`, data));
        break;
      }
      case 'delete-subject': {
        const n = state.goals.filter((g) => g.subjectId === sid).length;
        if (confirm(`Delete “${subject.name}”${n ? ` and its ${n} goal${n > 1 ? 's' : ''}` : ''}?`)) run(() => api('DELETE', `/api/subjects/${sid}`));
        break;
      }
      case 'edit-goal': openGoalDialog(goalEl.dataset.id); break;
      case 'move': e.stopPropagation(); openMoveMenu(goalEl); break;
      case 'delete-goal': deleteGoal(goalEl.dataset.id); break;
    }
  });

  document.addEventListener('click', (e) => { if (!e.target.closest('.move-menu')) closeMenus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  window.addEventListener('resize', closeMenus);
  window.addEventListener('scroll', (e) => { if (!e.target.closest || !e.target.closest('.move-menu')) closeMenus(); }, true);

  $('#addSubject').addEventListener('click', async () => {
    const data = await subjectDialog('New subject');
    if (data) run(() => api('POST', '/api/subjects', data));
  });

  $('#toggleDesc').addEventListener('click', () => {
    ui.showDesc = !ui.showDesc;
    safeSet('mg.showDesc', ui.showDesc ? '1' : '0');
    hideTip();
    render();
  });

  $('#toggleDone').addEventListener('click', () => {
    ui.hideDone = !ui.hideDone;
    safeSet('mg.hideDone', ui.hideDone ? '1' : '0');
    render();
  });

  $('#intervalTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-interval]');
    if (!b) return;
    ui.mobileInterval = b.dataset.interval;
    safeSet('mg.interval', ui.mobileInterval);
    render();
  });

  // ---------- description tooltip ----------
  const tip = document.createElement('div');
  tip.className = 'desc-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  let tipTimer, tipFor = null;

  function showTip(goalEl, now = false) {
    const g = goalById(goalEl.dataset.id);
    clearTimeout(tipTimer);
    if (!g || !g.description || ui.showDesc || ui.dragId || document.querySelector('.move-menu')) return hideTip();
    tipTimer = setTimeout(() => {
      tipFor = goalEl;
      tip.innerHTML = `<div class="desc-tip-title" dir="auto">${esc(g.title)}</div><div class="desc-tip-body" dir="auto">${esc(g.description)}</div>`;
      tip.hidden = false;
      const a = goalEl.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const pad = 8;
      let top = a.bottom + 6;
      if (top + t.height > window.innerHeight - pad) top = Math.max(pad, a.top - 6 - t.height);
      const left = Math.min(Math.max(pad, a.left), window.innerWidth - t.width - pad);
      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;
    }, now ? 0 : 250);
  }
  function hideTip() { clearTimeout(tipTimer); tip.hidden = true; tipFor = null; }

  board.addEventListener('mouseover', (e) => {
    const li = e.target.closest('.goal.has-desc');
    if (li && li !== tipFor) showTip(li);
    else if (!li) hideTip();
  });
  board.addEventListener('mouseleave', hideTip);
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-act=show-desc]')) hideTip(); });
  window.addEventListener('scroll', hideTip, true);

  // ---------- drag & drop (desktop) ----------
  board.addEventListener('dragstart', (e) => {
    const li = e.target.closest && e.target.closest('.goal');
    if (!li) return;
    ui.dragId = li.dataset.id;
    hideTip();
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });

  board.addEventListener('dragend', () => {
    ui.dragId = null;
    clearDropMarks();
  });

  function clearDropMarks() {
    board.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
    board.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
    board.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
  }

  // The goal element the dragged item should be inserted before (or null = end).
  function dropTarget(column, y) {
    const items = [...column.querySelectorAll('.goal')].filter((x) => x.dataset.id !== ui.dragId);
    return items.find((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
  }

  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.column');
    if (!col || !ui.dragId) return;
    e.preventDefault();
    board.querySelectorAll('.drag-over').forEach((x) => x !== col && x.classList.remove('drag-over'));
    col.classList.add('drag-over');
    board.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
    const before = dropTarget(col, e.clientY);
    if (before) before.classList.add('drop-before');
  });

  board.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.column');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });

  board.addEventListener('drop', (e) => {
    const col = e.target.closest('.column');
    if (!col || !ui.dragId) return;
    e.preventDefault();
    const g = goalById(ui.dragId);
    const before = dropTarget(col, e.clientY);
    const siblings = state.goals
      .filter((x) => x.subjectId === col.dataset.subject && x.interval === col.dataset.interval && x.id !== g.id)
      .sort((a, b) => a.order - b.order);

    let order;
    if (!siblings.length) order = g.order;
    else if (!before) order = siblings[siblings.length - 1].order + 1;
    else {
      const idx = siblings.findIndex((x) => x.id === before.dataset.id);
      order = idx === 0 ? siblings[0].order - 1 : (siblings[idx - 1].order + siblings[idx].order) / 2;
    }

    const changes = { order };
    if (g.subjectId !== col.dataset.subject) changes.subjectId = col.dataset.subject;
    if (g.interval !== col.dataset.interval) changes.interval = col.dataset.interval;
    clearDropMarks();
    ui.dragId = null;
    moveGoal(g.id, changes);
  });

  // ---------- keep fresh (new day / week rolls over) ----------
  window.addEventListener('focus', load);
  setInterval(() => { if (!document.querySelector('[contenteditable="true"], .move-menu, dialog[open]') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) load(); }, 60 * 1000);

  load();
})();
