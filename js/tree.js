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
    if (nodes[i].level <= 2) { weekIdx = i; break; }
  }
  const result = [];
  for (let i = weekIdx >= 0 ? weekIdx + 1 : 0; i < nodes.length; i++) {
    if (nodes[i].level <= 2) break;
    if (nodes[i].level === 3) result.push(i);
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

    if (n.level <= 2) {
      rows.push({ kind: 'node', node: n, nodeIdx: i });
      i++;
      continue;
    }

    if (n.level === 3) {
      rows.push({ kind: 'node', node: n, nodeIdx: i });
      let j = i + 1;
      if (!n.collapsed) {
        const tasks = [];
        while (j < nodes.length && nodes[j].level >= 4) {
          if (nodes[j].level === 4) {
            tasks.push({ node: nodes[j], nodeIdx: j, subs: [] });
          } else if (nodes[j].level === 5 && tasks.length) {
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
        while (j < nodes.length && nodes[j].level >= 4) j++;
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
    if (lv === 3) {
      siblingAccounts(row.nodeIdx).forEach(si => nodes[si].collapsed = tgt);
    } else if (lv === 2) {
      let mi = -1;
      for (let i = row.nodeIdx - 1; i >= 0; i--) { if (nodes[i].level === 1) { mi = i; break; } }
      for (let i = mi >= 0 ? mi + 1 : 0; i < nodes.length; i++) {
        if (nodes[i].level <= 1) break;
        if (nodes[i].level === 2) nodes[i].collapsed = tgt;
      }
    } else if (lv === 1) {
      let yi = -1;
      for (let i = row.nodeIdx - 1; i >= 0; i--) { if (nodes[i].level === 0) { yi = i; break; } }
      for (let i = yi >= 0 ? yi + 1 : 0; i < nodes.length; i++) {
        if (nodes[i].level === 0) break;
        if (nodes[i].level === 1) nodes[i].collapsed = tgt;
      }
    } else {
      nodes.filter(n => n.level === 0).forEach(n => n.collapsed = tgt);
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
  if (n.level === 2) {
    const nn = { id: nextId++, level: 3, text: '', status: '', collapsed: false, collapsedGroups: {} };
    let ins = ni + 1;
    while (ins < nodes.length && nodes[ins].level >= 3) ins++;
    nodes.splice(ins, 0, nn);
    n.collapsed = false;
    focusedNodeId = nn.id;
    editingNodeId = nn.id;
  } else if (n.level === 3) {
    const nn = { id: nextId++, level: 4, text: '', status: 'todo' };
    let ins = ni + 1;
    while (ins < nodes.length && nodes[ins].level >= 4) ins++;
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
  if (srcIdx === -1 || nodes[srcIdx].level !== 4) return false;
  let end = srcIdx + 1;
  while (end < nodes.length && nodes[end].level === 5) end++;
  const chunk = nodes.splice(srcIdx, end - srcIdx);
  if (newStatus !== undefined) chunk[0].status = newStatus;
  const accIdx = nodes.findIndex(n => n.id === accId);
  if (accIdx === -1) { nodes.push(...chunk); return true; }
  let ins = accIdx + 1;
  while (ins < nodes.length && nodes[ins].level >= 4) ins++;
  nodes.splice(ins, 0, ...chunk);
  return true;
}

function moveSubToTask(subId, taskId) {
  const srcIdx = nodes.findIndex(n => n.id === subId);
  if (srcIdx === -1 || nodes[srcIdx].level !== 5) return false;
  const [sub] = nodes.splice(srcIdx, 1);
  const taskIdx = nodes.findIndex(n => n.id === taskId);
  if (taskIdx === -1 || nodes[taskIdx].level !== 4) { nodes.push(sub); return true; }
  let ins = taskIdx + 1;
  while (ins < nodes.length && nodes[ins].level === 5) ins++;
  nodes.splice(ins, 0, sub);
  return true;
}

// ── Positional reparenting ─────────────────────────────────────
function subsEnd(idx) {
  let end = idx + 1;
  while (end < nodes.length && nodes[end].level === 5) end++;
  return end;
}

function insertTaskBefore(srcId, refId) {
  if (srcId === refId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== 4) return false;
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
  if (srcIdx === -1 || nodes[srcIdx].level !== 4) return false;
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
  if (srcIdx === -1 || nodes[srcIdx].level !== 4) return false;
  if (srcIdx + 1 < nodes.length && nodes[srcIdx + 1].level === 5) return false;
  pushUndo();
  const [taskNode] = nodes.splice(srcIdx, 1);
  taskNode.level = 5;
  delete taskNode.status;
  const targetIdx = nodes.findIndex(n => n.id === targetId);
  if (targetIdx === -1) { nodes.push(taskNode); return true; }
  nodes.splice(subsEnd(targetIdx), 0, taskNode);
  return true;
}

function insertSubBefore(srcId, refId) {
  if (srcId === refId) return false;
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== 5) return false;
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
  if (srcIdx === -1 || nodes[srcIdx].level !== 5) return false;
  pushUndo();
  const [sub] = nodes.splice(srcIdx, 1);
  const refIdx = nodes.findIndex(n => n.id === refId);
  if (refIdx === -1) { nodes.push(sub); return true; }
  nodes.splice(refIdx + 1, 0, sub);
  return true;
}

function promoteSubToTask(srcId, refTaskId, pos) {
  const srcIdx = nodes.findIndex(n => n.id === srcId);
  if (srcIdx === -1 || nodes[srcIdx].level !== 5) return false;
  pushUndo();
  const [sub] = nodes.splice(srcIdx, 1);
  sub.level = 4;
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
  let cy = null, cm = null, cw = null, ca = null;
  for (const n of nodes) {
    if (n.level === 0) {
      cy = { node: n, months: [] }; years.push(cy); cm = cw = ca = null;
    } else if (n.level === 1) {
      cm = { node: n, weeks: [] }; if (cy) cy.months.push(cm); cw = ca = null;
    } else if (n.level === 2) {
      cw = { node: n, accounts: [], loose: [] }; if (cm) cm.weeks.push(cw); ca = null;
    } else if (n.level === 3) {
      ca = { node: n, tasks: [] }; if (cw) cw.accounts.push(ca);
    } else if (n.level === 4) {
      const task = { node: n, subs: [] };
      if (ca) ca.tasks.push(task); else if (cw) cw.loose.push(task);
    } else if (n.level === 5) {
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

  const mergedYears = dedup(years, y => y.months);
  for (const y of mergedYears) {
    y.months = dedup(y.months, m => m.weeks);
    for (const m of y.months) {
      m.weeks = dedup(m.weeks, w => w.accounts);
      for (const w of m.weeks) {
        w.accounts = dedup(w.accounts, a => a.tasks);
      }
    }
  }

  // Flatten back
  const out = [];
  for (const y of mergedYears) {
    out.push(y.node);
    for (const m of y.months) {
      out.push(m.node);
      for (const w of m.weeks) {
        out.push(w.node);
        for (const a of w.accounts) { out.push(a.node); a.tasks.forEach(t => { out.push(t.node); t.subs.forEach(s => out.push(s)); }); }
        w.loose.forEach(t => { out.push(t.node); t.subs.forEach(s => out.push(s)); });
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
  mergeDuplicates();
  if (!nodes.length) return;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const isoWeekMonday = (year, wn) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day1 = jan4.getUTCDay() || 7;
    return new Date(Date.UTC(year, 0, 4 - (day1 - 1) + (wn - 1) * 7));
  };

  const years = [], orphanMonths = [];
  let cy = null, cm = null, cw = null;
  for (const n of nodes) {
    if (n.level === 0) { cy = { node: n, months: [] }; years.push(cy); cm = cw = null; }
    else if (n.level === 1) { cm = { node: n, weeks: [] }; (cy ? cy.months : orphanMonths).push(cm); cw = null; }
    else if (n.level === 2) {
      cw = { node: n, children: [] };
      if (!cm && cy) { cm = { node: { id: nextId++, level: 1, text: '?', status: '', collapsed: false }, weeks: [] }; cy.months.push(cm); }
      if (cm) cm.weeks.push(cw);
    } else if (cw) cw.children.push(n);
  }
  if (!years.length) return;

  const latest = years.reduce((a,b) => (parseInt(b.node.text) > parseInt(a.node.text) ? b : a), years[0]);
  orphanMonths.forEach(m => latest.months.push(m));

  for (const y of years) {
    const yn = parseInt(y.node.text);
    if (!Number.isFinite(yn)) continue;
    const byName = {};
    y.months.forEach(m => { byName[m.node.text] = { node: m.node, weeks: [] }; });
    for (const m of y.months) for (const w of m.weeks) {
      const mm = /Week\s+(\d+)/i.exec(w.node.text);
      const target = mm ? MONTHS[isoWeekMonday(yn, parseInt(mm[1])).getUTCMonth()] : m.node.text;
      if (!byName[target]) byName[target] = { node: { id: nextId++, level: 1, text: target, status: '', collapsed: false }, weeks: [] };
      byName[target].weeks.push(w);
    }
    y.months = Object.values(byName).sort((a,b) => {
      const ai = MONTHS.indexOf(a.node.text), bi = MONTHS.indexOf(b.node.text);
      return (ai === -1) - (bi === -1) || ai - bi;
    });
  }

  const before = nodes.slice();
  const out = [];
  for (const y of years) {
    out.push(y.node);
    for (const m of y.months) { out.push(m.node); for (const w of m.weeks) { out.push(w.node); for (const c of w.children) out.push(c); } }
  }
  const seen = new Set(out);
  for (const n of before) if (!seen.has(n)) out.push(n);
  let changed = out.length !== before.length;
  if (!changed) for (let i = 0; i < out.length; i++) if (out[i] !== before[i]) { changed = true; break; }
  if (changed) { nodes.length = 0; nodes.push(...out); markDirtyTree(); }
}

function checkAndCreateCurrentWeek() {
  normalizeCalendar();
  const now = getCETDate();
  const { week, year } = getCalendarWeek(now);
  const weekLabel = `Week ${week}`;
  const yearLabel = `${year}`;

  // Find Monday of current week to determine month
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek - 1));
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = monthNames[monday.getMonth()];

  // Ensure year node exists
  let yearNode = nodes.find(n => n.level === 0 && n.text === yearLabel);
  if (!yearNode) {
    yearNode = { id: nextId++, level: 0, text: yearLabel, status: '', collapsed: false };
    nodes.push(yearNode);
    markDirtyTree();
  }
  const yearIdx = nodes.findIndex(n => n.id === yearNode.id);

  // Ensure month node exists under year
  let monthNode = null;
  for (let i = yearIdx + 1; i < nodes.length; i++) {
    if (nodes[i].level === 0) break;
    if (nodes[i].level === 1 && nodes[i].text === monthLabel) { monthNode = nodes[i]; break; }
  }
  if (!monthNode) {
    let ins = yearIdx + 1;
    while (ins < nodes.length && nodes[ins].level >= 1) ins++;
    monthNode = { id: nextId++, level: 1, text: monthLabel, status: '', collapsed: false };
    nodes.splice(ins, 0, monthNode);
    markDirtyTree();
  }
  const monthIdx = nodes.findIndex(n => n.id === monthNode.id);

  // Ensure week node exists under month
  let found = false;
  for (let i = monthIdx + 1; i < nodes.length; i++) {
    if (nodes[i].level <= 1) break;
    if (nodes[i].level === 2 && nodes[i].text === weekLabel) { found = true; break; }
  }
  if (!found) {
    let ins = monthIdx + 1;
    while (ins < nodes.length && nodes[ins].level >= 2) ins++;
    nodes.splice(ins, 0, { id: nextId++, level: 2, text: weekLabel, status: '', collapsed: false });
    markDirtyTree();
    render();
  }
}
