// ── Undo / Redo ────────────────────────────────────────────────
function snap() { return JSON.parse(JSON.stringify(nodes)); }

function pushUndo() {
  undoStack.push(snap());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snap());
  nodes = undoStack.pop();
  dismissPicker();
  markDirtyTree();
  render();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap());
  nodes = redoStack.pop();
  dismissPicker();
  markDirtyTree();
  render();
}

// ── Tree helpers ───────────────────────────────────────────────
function isAncestorCollapsed(idx) {
  const targetLevel = nodes[idx].level;
  let checkLevel = targetLevel;
  for (let i = idx - 1; i >= 0; i--) {
    if (nodes[i].level < checkLevel) {
      if (nodes[i].collapsed) return true;
      checkLevel = nodes[i].level;
      if (checkLevel === 0) break;
    }
  }
  return false;
}

function siblingAccounts(accountIdx) {
  let weekIdx = -1;
  for (let i = accountIdx - 1; i >= 0; i--) {
    if (nodes[i].level <= LEVEL_WEEK) { weekIdx = i; break; }
  }
  const result = [];
  for (let i = weekIdx >= 0 ? weekIdx + 1 : 0; i < nodes.length; i++) {
    if (nodes[i].level <= LEVEL_WEEK) break;
    if (nodes[i].level === LEVEL_ACCOUNT) result.push(i);
  }
  return result;
}

function hasChildren(nodeIdx) {
  const level = nodes[nodeIdx].level;
  for (let i = nodeIdx + 1; i < nodes.length; i++) {
    if (nodes[i].level <= level) return false;
    return true;
  }
  return false;
}

function buildRows() {
  const rows = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (isAncestorCollapsed(i)) { i++; continue; }

    if (n.level <= LEVEL_WEEK) {
      rows.push({ kind: 'node', node: n, nodeIdx: i });
      i++;
      continue;
    }

    if (n.level === LEVEL_ACCOUNT) {
      rows.push({ kind: 'node', node: n, nodeIdx: i });
      let j = i + 1;
      if (!n.collapsed) {
        const tasks = [];
        while (j < nodes.length && nodes[j].level >= LEVEL_TASK) {
          if (nodes[j].level === LEVEL_TASK) {
            tasks.push({ node: nodes[j], nodeIdx: j, subs: [] });
          } else if (nodes[j].level === LEVEL_SUB && tasks.length) {
            tasks[tasks.length - 1].subs.push({ node: nodes[j], nodeIdx: j });
          }
          j++;
        }
        const order = displayOrder();
        const buckets = {};
        order.forEach(s => buckets[s] = []);
        tasks.forEach(t => {
          const key = t.node.status || 'todo';
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push(t);
        });
        order.forEach(s => {
          const lst = buckets[s];
          if (!lst?.length) return;
          const gc = !!(n.collapsedGroups?.[s]);
          rows.push({ kind: 'group', status: s, accId: n.id, accIdx: i, collapsed: gc, count: lst.length });
          if (!gc) lst.forEach(t => {
            rows.push({ kind: 'node', node: t.node, nodeIdx: t.nodeIdx });
            if (!t.node.collapsed) t.subs.forEach(su => rows.push({ kind: 'node', node: su.node, nodeIdx: su.nodeIdx }));
          });
        });
      } else {
        while (j < nodes.length && nodes[j].level >= LEVEL_TASK) j++;
      }
      i = j;
      continue;
    }
    i++;
  }
  return rows;
}

function toggleCollapse(row) {
  if (row.kind === 'node') {
    row.node.collapsed = !row.node.collapsed;
  } else {
    const a = nodes.find(n => n.id === row.accId);
    if (a) {
      if (!a.collapsedGroups) a.collapsedGroups = {};
      a.collapsedGroups[row.status] = !a.collapsedGroups[row.status];
    }
  }
  markDirtyUI();
  render();
}

function toggleSiblings(row) {
  if (row.kind === 'node') {
    const lv = row.node.level;
    const tgt = !row.node.collapsed;
    if (lv === LEVEL_ACCOUNT) {
      siblingAccounts(row.nodeIdx).forEach(si => nodes[si].collapsed = tgt);
    } else if (lv === LEVEL_WEEK) {
      let mi = -1;
      for (let i = row.nodeIdx - 1; i >= 0; i--) { if (nodes[i].level === LEVEL_MONTH) { mi = i; break; } }
      for (let i = mi >= 0 ? mi + 1 : 0; i < nodes.length; i++) {
        if (nodes[i].level <= LEVEL_MONTH) break;
        if (nodes[i].level === LEVEL_WEEK) nodes[i].collapsed = tgt;
      }
    } else if (lv === LEVEL_MONTH) {
      let qi = -1;
      for (let i = row.nodeIdx - 1; i >= 0; i--) { if (nodes[i].level === LEVEL_QUARTER) { qi = i; break; } }
      for (let i = qi >= 0 ? qi + 1 : 0; i < nodes.length; i++) {
        if (nodes[i].level <= LEVEL_QUARTER) break;
        if (nodes[i].level === LEVEL_MONTH) nodes[i].collapsed = tgt;
      }
    } else if (lv === LEVEL_QUARTER) {
      let yi = -1;
      for (let i = row.nodeIdx - 1; i >= 0; i--) { if (nodes[i].level === LEVEL_YEAR) { yi = i; break; } }
      for (let i = yi >= 0 ? yi + 1 : 0; i < nodes.length; i++) {
        if (nodes[i].level === LEVEL_YEAR) break;
        if (nodes[i].level === LEVEL_QUARTER) nodes[i].collapsed = tgt;
      }
    } else {
      nodes.filter(n => n.level === LEVEL_YEAR).forEach(n => n.collapsed = tgt);
    }
  } else {
    const a = nodes.find(n => n.id === row.accId);
    if (!a) return;
    const tgt = !row.collapsed;
    siblingAccounts(nodes.indexOf(a)).forEach(si => {
      if (!nodes[si].collapsedGroups) nodes[si].collapsedGroups = {};
      nodes[si].collapsedGroups[row.status] = tgt;
    });
  }
  markDirtyUI();
  render();
}

function addChild(ni) {
  pushUndo();
  const n = nodes[ni];
  if (n.level === LEVEL_WEEK) {
    const nn = { id: nextId++, level: LEVEL_ACCOUNT, text: '', status: '', collapsed: false, collapsedGroups: {} };
    let ins = ni + 1;
    while (ins < nodes.length && nodes[ins].level >= LEVEL_ACCOUNT) ins++;
    nodes.splice(ins, 0, nn);
    n.collapsed = false;
    focusedNodeId = nn.id;
    editingNodeId = nn.id;
  } else if (n.level === LEVEL_ACCOUNT) {
    const nn = { id: nextId++, level: LEVEL_TASK, text: '', status: 'todo' };
    let ins = ni + 1;
    while (ins < nodes.length && nodes[ins].level >= LEVEL_TASK) ins++;
    nodes.splice(ins, 0, nn);
    n.collapsed = false;
    focusedNodeId = nn.id;
    editingNodeId = nn.id;
  }
  markDirtyTree();
  render();
}

// ── Reparenting ────────────────────────────────────────────────
function moveTaskToAccount(taskId, accId, newStatus) {
  const srcIdx = nodes.findIndex(n => n.id === taskId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_TASK) return false;
  let end = srcIdx + 1;
  while (end < nodes.length && nodes[end].level === LEVEL_SUB) end++;
  const chunk = nodes.splice(srcIdx, end - srcIdx);
  if (newStatus !== undefined) chunk[0].status = newStatus;
  const accIdx = nodes.findIndex(n => n.id === accId);
  if (accIdx === -1) { nodes.push(...chunk); return true; }
  let ins = accIdx + 1;
  while (ins < nodes.length && nodes[ins].level >= LEVEL_TASK) ins++;
  nodes.splice(ins, 0, ...chunk);
  return true;
}

function moveSubToTask(subId, taskId) {
  const srcIdx = nodes.findIndex(n => n.id === subId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_SUB) return false;
  const [sub] = nodes.splice(srcIdx, 1);
  const taskIdx = nodes.findIndex(n => n.id === taskId);
  if (taskIdx === -1 || nodes[taskIdx].level !== LEVEL_TASK) { nodes.push(sub); return true; }
  let ins = taskIdx + 1;
  while (ins < nodes.length && nodes[ins].level === LEVEL_SUB) ins++;
  nodes.splice(ins, 0, sub);
  return true;
}

// ── Positional reparenting ─────────────────────────────────────
function subsEnd(idx) {
  let end = idx + 1;
  while (end < nodes.length && nodes[end].level === LEVEL_SUB) end++;
  return end;
}

function insertTaskBefore(srcId, refId) {
  if (srcId === refId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_TASK) return false;
  pushUndo();
  const chunk = nodes.splice(srcIdx, subsEnd(srcIdx) - srcIdx);
  const refIdx = nodes.findIndex(n => n.id === refId);
  if (refIdx === -1) { nodes.push(...chunk); return true; }
  nodes.splice(refIdx, 0, ...chunk);
  return true;
}

function insertTaskAfter(srcId, refId) {
  if (srcId === refId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_TASK) return false;
  pushUndo();
  const chunk = nodes.splice(srcIdx, subsEnd(srcIdx) - srcIdx);
  const refIdx = nodes.findIndex(n => n.id === refId);
  if (refIdx === -1) { nodes.push(...chunk); return true; }
  nodes.splice(subsEnd(refIdx), 0, ...chunk);
  return true;
}

function nestTaskUnderTask(srcId, targetId) {
  if (srcId === targetId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_TASK) return false;
  if (srcIdx + 1 < nodes.length && nodes[srcIdx + 1].level === LEVEL_SUB) return false;
  pushUndo();
  const [taskNode] = nodes.splice(srcIdx, 1);
  taskNode.level = LEVEL_SUB;
  delete taskNode.status;
  const targetIdx = nodes.findIndex(n => n.id === targetId);
  if (targetIdx === -1) { nodes.push(taskNode); return true; }
  nodes.splice(subsEnd(targetIdx), 0, taskNode);
  return true;
}

function insertSubBefore(srcId, refId) {
  if (srcId === refId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_SUB) return false;
  pushUndo();
  const [sub] = nodes.splice(srcIdx, 1);
  const refIdx = nodes.findIndex(n => n.id === refId);
  if (refIdx === -1) { nodes.push(sub); return true; }
  nodes.splice(refIdx, 0, sub);
  return true;
}

function insertSubAfter(srcId, refId) {
  if (srcId === refId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_SUB) return false;
  pushUndo();
  const [sub] = nodes.splice(srcIdx, 1);
  const refIdx = nodes.findIndex(n => n.id === refId);
  if (refIdx === -1) { nodes.push(sub); return true; }
  nodes.splice(refIdx + 1, 0, sub);
  return true;
}

function promoteSubToTask(srcId, refTaskId, pos) {
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== LEVEL_SUB) return false;
  pushUndo();
  const [sub] = nodes.splice(srcIdx, 1);
  sub.level = LEVEL_TASK;
  sub.status = sub.status || 'todo';
  const refIdx = nodes.findIndex(n => n.id === refTaskId);
  if (refIdx === -1) { nodes.push(sub); return true; }
  if (pos === 'before') {
    nodes.splice(refIdx, 0, sub);
  } else {
    nodes.splice(subsEnd(refIdx), 0, sub);
  }
  return true;
}

// ── Default nodes ──────────────────────────────────────────────
function getDefaultNodes() {
  return [];
}

// ── Calendar week ──────────────────────────────────────────────
function quarterLabelForMonthIndex(monthIndex) {
  return 'Q' + (Math.floor(monthIndex / 3) + 1);
}

function quarterLabelForMonthName(monthName) {
  const idx = MONTH_NAMES.indexOf(monthName);
  return idx === -1 ? 'Q?' : quarterLabelForMonthIndex(idx);
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getCalendarWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

function mergeDuplicates() {
  if (!nodes.length) return;

  // Parse flat array into hierarchy
  const years = [];
  let cy = null, cq = null, cm = null, cw = null, ca = null;
  for (const n of nodes) {
    if (n.level === LEVEL_YEAR) {
      cy = { node: n, quarters: [] }; years.push(cy); cq = cm = cw = ca = null;
    } else if (n.level === LEVEL_QUARTER) {
      cq = { node: n, months: [] }; if (cy) cy.quarters.push(cq); cm = cw = ca = null;
    } else if (n.level === LEVEL_MONTH) {
      if (!cq && cy) {
        cq = { node: { id: nextId++, level: LEVEL_QUARTER, text: quarterLabelForMonthName(n.text), status: '', collapsed: false }, months: [] };
        cy.quarters.push(cq);
      }
      cm = { node: n, weeks: [] }; if (cq) cq.months.push(cm); cw = ca = null;
    } else if (n.level === LEVEL_WEEK) {
      cw = { node: n, accounts: [], loose: [] }; if (cm) cm.weeks.push(cw); ca = null;
    } else if (n.level === LEVEL_ACCOUNT) {
      ca = { node: n, tasks: [] }; if (cw) cw.accounts.push(ca);
    } else if (n.level === LEVEL_TASK) {
      const task = { node: n, subs: [] };
      if (ca) ca.tasks.push(task); else if (cw) cw.loose.push(task);
    } else if (n.level === LEVEL_SUB) {
      const tasks = ca ? ca.tasks : (cw ? cw.loose : null);
      if (tasks && tasks.length) tasks[tasks.length - 1].subs.push(n);
    }
  }

  // Merge duplicates at each level (first occurrence wins, children absorbed)
  const dedup = (arr, getChildren, setChildren) => {
    const seen = new Map();
    const merged = [];
    for (const item of arr) {
      const key = item.node.text;
      if (seen.has(key)) {
        getChildren(seen.get(key)).push(...getChildren(item));
      } else {
        seen.set(key, item);
        merged.push(item);
      }
    }
    return merged;
  };

  const mergedYears = dedup(years, y => y.quarters);
  for (const y of mergedYears) {
    y.quarters = dedup(y.quarters, q => q.months);
    for (const q of y.quarters) {
      q.months = dedup(q.months, m => m.weeks);
      for (const m of q.months) {
        m.weeks = dedup(m.weeks, w => w.accounts);
        for (const w of m.weeks) {
          w.accounts = dedup(w.accounts, a => a.tasks);
        }
      }
    }
  }

  // Flatten back
  const out = [];
  for (const y of mergedYears) {
    out.push(y.node);
    for (const q of y.quarters) {
      out.push(q.node);
      for (const m of q.months) {
        out.push(m.node);
        for (const w of m.weeks) {
          out.push(w.node);
          for (const a of w.accounts) { out.push(a.node); a.tasks.forEach(t => { out.push(t.node); t.subs.forEach(s => out.push(s)); }); }
          w.loose.forEach(t => { out.push(t.node); t.subs.forEach(s => out.push(s)); });
        }
      }
    }
  }
  const seen = new Set(out.map(n => n.id));
  for (const n of nodes) if (!seen.has(n.id)) out.push(n);

  let changed = out.length !== nodes.length;
  if (!changed) for (let i = 0; i < out.length; i++) if (out[i] !== nodes[i]) { changed = true; break; }
  if (changed) { nodes.length = 0; nodes.push(...out); markDirtyTree(); }
}

function normalizeCalendar() {
  migrateLegacyCalendarLevels();
  mergeDuplicates();
  if (!nodes.length) return;
  const isoWeekMonday = (year, wn) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day1 = jan4.getUTCDay() || 7;
    return new Date(Date.UTC(year, 0, 4 - (day1 - 1) + (wn - 1) * 7));
  };

  const years = [], orphanMonths = [];
  let cy = null, cq = null, cm = null, cw = null;
  for (const n of nodes) {
    if (n.level === LEVEL_YEAR) { cy = { node: n, quarters: [] }; years.push(cy); cq = cm = cw = null; }
    else if (n.level === LEVEL_QUARTER) { cq = { node: n, months: [] }; if (cy) cy.quarters.push(cq); cm = cw = null; }
    else if (n.level === LEVEL_MONTH) {
      cm = { node: n, weeks: [] };
      if (cq) cq.months.push(cm); else orphanMonths.push(cm);
      cw = null;
    }
    else if (n.level === LEVEL_WEEK) {
      cw = { node: n, children: [] };
      if (!cm && cy) {
        if (!cq) { cq = { node: { id: nextId++, level: LEVEL_QUARTER, text: 'Q?', status: '', collapsed: false }, months: [] }; cy.quarters.push(cq); }
        cm = { node: { id: nextId++, level: LEVEL_MONTH, text: '?', status: '', collapsed: false }, weeks: [] };
        cq.months.push(cm);
      }
      if (cm) cm.weeks.push(cw);
    } else if (cw) cw.children.push(n);
  }
  if (!years.length) return;

  const latest = years.reduce((a,b) => (parseInt(b.node.text) > parseInt(a.node.text) ? b : a), years[0]);
  orphanMonths.forEach(m => {
    const qText = quarterLabelForMonthName(m.node.text);
    let q = latest.quarters.find(x => x.node.text === qText);
    if (!q) {
      q = { node: { id: nextId++, level: LEVEL_QUARTER, text: qText, status: '', collapsed: false }, months: [] };
      latest.quarters.push(q);
    }
    q.months.push(m);
  });

  for (const y of years) {
    const yn = parseInt(y.node.text);
    if (!Number.isFinite(yn)) continue;
    const monthBuckets = {};
    for (const q of y.quarters) for (const m of q.months) {
      if (!monthBuckets[m.node.text]) monthBuckets[m.node.text] = { node: m.node, weeks: [] };
      monthBuckets[m.node.text].weeks.push(...m.weeks);
    }
    for (const m of Object.values(monthBuckets)) {
      const moved = [];
      for (const w of [...m.weeks]) {
        const mm = /Week\s+(\d+)/i.exec(w.node.text);
        const target = mm ? MONTH_NAMES[isoWeekMonday(yn, parseInt(mm[1])).getUTCMonth()] : m.node.text;
        if (!monthBuckets[target]) monthBuckets[target] = { node: { id: nextId++, level: LEVEL_MONTH, text: target, status: '', collapsed: false }, weeks: [] };
        if (target === m.node.text) moved.push(w);
        else monthBuckets[target].weeks.push(w);
      }
      m.weeks = moved;
    }
    const quarters = {};
    Object.values(monthBuckets).forEach(m => {
      if (!m.weeks.length) return;
      const qText = quarterLabelForMonthName(m.node.text);
      if (!quarters[qText]) {
        const existingQuarter = y.quarters.find(q => q.node.text === qText)?.node;
        quarters[qText] = { node: existingQuarter || { id: nextId++, level: LEVEL_QUARTER, text: qText, status: '', collapsed: false }, months: [] };
      }
      quarters[qText].months.push(m);
    });
    y.quarters = Object.values(quarters).sort((a,b) => a.node.text.localeCompare(b.node.text));
    y.quarters.forEach(q => q.months.sort((a,b) => {
      const ai = MONTH_NAMES.indexOf(a.node.text), bi = MONTH_NAMES.indexOf(b.node.text);
      return (ai === -1) - (bi === -1) || ai - bi;
    }));
  }

  const before = nodes.slice();
  const out = [];
  for (const y of years) {
    out.push(y.node);
    for (const q of y.quarters) {
      out.push(q.node);
      for (const m of q.months) {
        out.push(m.node);
        for (const w of m.weeks) { out.push(w.node); for (const c of w.children) out.push(c); }
      }
    }
  }
  const seen = new Set(out);
  for (const n of before) if (!seen.has(n)) out.push(n);
  let changed = out.length !== before.length;
  if (!changed) for (let i = 0; i < out.length; i++) if (out[i] !== before[i]) { changed = true; break; }
  if (changed) { nodes.length = 0; nodes.push(...out); markDirtyTree(); }
}

function migrateLegacyCalendarLevels() {
  const hasQuarter = nodes.some(n => n.level === LEVEL_QUARTER && /^Q[1-4?]$/.test(n.text || ''));
  const hasLegacyCalendar = !hasQuarter && nodes.some(n =>
    (n.level === 1 && MONTH_NAMES.includes(n.text)) ||
    (n.level === 2 && /^Week\s+\d+/i.test(n.text || ''))
  );
  if (!hasLegacyCalendar) return;
  nodes.forEach(n => { if (n.level >= LEVEL_QUARTER) n.level += 1; });
  markDirtyTree();
}

function checkAndCreateCurrentWeek() {
  if (isProjectsNotepad()) return;
  normalizeCalendar();
  const now = getCETDate();
  const { week, year } = getCalendarWeek(now);
  const weekLabel = `Week ${week}`;
  const yearLabel = `${year}`;

  // Find Monday of current week to determine month
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek - 1));
  const monthLabel = MONTH_NAMES[monday.getMonth()];
  const quarterLabel = quarterLabelForMonthIndex(monday.getMonth());

  // Ensure year node exists
  let yearNode = nodes.find(n => n.level === LEVEL_YEAR && n.text === yearLabel);
  if (!yearNode) {
    yearNode = { id: nextId++, level: LEVEL_YEAR, text: yearLabel, status: '', collapsed: false };
    nodes.push(yearNode);
    markDirtyTree();
  }
  const yearIdx = nodes.findIndex(n => n.id === yearNode.id);

  // Ensure quarter node exists under year
  let quarterNode = null;
  for (let i = yearIdx + 1; i < nodes.length; i++) {
    if (nodes[i].level === LEVEL_YEAR) break;
    if (nodes[i].level === LEVEL_QUARTER && nodes[i].text === quarterLabel) { quarterNode = nodes[i]; break; }
  }
  if (!quarterNode) {
    let ins = yearIdx + 1;
    while (ins < nodes.length && nodes[ins].level >= LEVEL_QUARTER) ins++;
    quarterNode = { id: nextId++, level: LEVEL_QUARTER, text: quarterLabel, status: '', collapsed: false };
    nodes.splice(ins, 0, quarterNode);
    markDirtyTree();
  }
  const quarterIdx = nodes.findIndex(n => n.id === quarterNode.id);

  // Ensure month node exists under year
  let monthNode = null;
  for (let i = quarterIdx + 1; i < nodes.length; i++) {
    if (nodes[i].level <= LEVEL_QUARTER) break;
    if (nodes[i].level === LEVEL_MONTH && nodes[i].text === monthLabel) { monthNode = nodes[i]; break; }
  }
  if (!monthNode) {
    let ins = quarterIdx + 1;
    while (ins < nodes.length && nodes[ins].level >= LEVEL_MONTH) ins++;
    monthNode = { id: nextId++, level: LEVEL_MONTH, text: monthLabel, status: '', collapsed: false };
    nodes.splice(ins, 0, monthNode);
    markDirtyTree();
  }
  const monthIdx = nodes.findIndex(n => n.id === monthNode.id);

  // Ensure week node exists under month
  let found = false;
  for (let i = monthIdx + 1; i < nodes.length; i++) {
    if (nodes[i].level <= LEVEL_MONTH) break;
    if (nodes[i].level === LEVEL_WEEK && nodes[i].text === weekLabel) { found = true; break; }
  }
  if (!found) {
    let ins = monthIdx + 1;
    while (ins < nodes.length && nodes[ins].level >= LEVEL_WEEK) ins++;
    nodes.splice(ins, 0, { id: nextId++, level: LEVEL_WEEK, text: weekLabel, status: '', collapsed: false });
    markDirtyTree();
    render();
  }
}
