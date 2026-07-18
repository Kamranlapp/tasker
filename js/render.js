// ── DOM helpers ────────────────────────────────────────────────
function mk(tag, style) {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  return e;
}

let dragState = null;
let labelClickTimer = null;

function startDrag(e, nodeId, level) {
  dragState = { nodeId, level, hoveredId: null, hoverTimer: null, nestReady: false, dropPos: null };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(nodeId)); } catch {}
}

function endDrag() {
  if (dragState?.hoverTimer) clearTimeout(dragState.hoverTimer);
  dragState = null;
  document.querySelectorAll('.drag-over,.drop-before,.drop-after,.drop-nest')
    .forEach(r => r.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-nest'));
}

function clearDropIndicators() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-nest')
    .forEach(r => r.classList.remove('drop-before', 'drop-after', 'drop-nest'));
}

function canNest(srcId, srcLevel, tgtNode) {
  if (srcId === tgtNode.id) return false;
  if (srcLevel === LEVEL_SUB && tgtNode.level === LEVEL_TASK) return true;
  if (srcLevel === LEVEL_TASK && tgtNode.level === LEVEL_TASK) {
    const srcIdx = nodes.findIndex(n => n.id === srcId);
    if (srcIdx === -1) return false;
    return !(srcIdx + 1 < nodes.length && nodes[srcIdx + 1].level === LEVEL_SUB);
  }
  return false;
}

function attachDropTarget(el, acceptLevel, onDrop, onFiles) {
  const matchLevel = () => dragState && dragState.level === acceptLevel;
  const matchFiles = e => onFiles && !dragState && Array.from(e.dataTransfer?.types || []).includes('Files');
  el.addEventListener('dragenter', e => { if (matchLevel() || matchFiles(e)) { e.preventDefault(); el.classList.add('drag-over'); } });
  el.addEventListener('dragover', e => {
    if (matchLevel()) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    else if (matchFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drag-over'); }
  });
  el.addEventListener('dragleave', e => { if (e.target !== el) return; el.classList.remove('drag-over'); });
  el.addEventListener('drop', e => {
    if (matchLevel()) {
      e.preventDefault(); e.stopPropagation();
      const id = dragState.nodeId;
      dragState = null;
      el.classList.remove('drag-over');
      onDrop(id);
    } else if (onFiles && e.dataTransfer?.files?.length) {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('drag-over');
      onFiles(e.dataTransfer.files);
    }
  });
}

function attachRowDragEvents(el, node, onFiles) {
  el.addEventListener('dragover', e => {
    const isFileDrop = !dragState && node.level === LEVEL_TASK && onFiles &&
      Array.from(e.dataTransfer?.types || []).includes('Files');
    if (isFileDrop) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drag-over'); return; }
    if (!dragState) return;
    const { nodeId: srcId, level: srcLevel } = dragState;
    const tgtLevel = node.level;
    const valid =
      (srcLevel === LEVEL_TASK && tgtLevel === LEVEL_TASK && srcId !== node.id) ||
      (srcLevel === LEVEL_SUB && tgtLevel === LEVEL_TASK) ||
      (srcLevel === LEVEL_SUB && tgtLevel === LEVEL_SUB && srcId !== node.id);
    if (!valid) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (dragState.hoveredId !== node.id) {
      if (dragState.hoverTimer) { clearTimeout(dragState.hoverTimer); dragState.hoverTimer = null; }
      dragState.hoveredId = node.id;
      dragState.nestReady = false;
      if (canNest(srcId, srcLevel, node)) {
        dragState.hoverTimer = setTimeout(() => {
          if (dragState && dragState.hoveredId === node.id) {
            dragState.nestReady = true;
            dragState.hoverTimer = null;
            clearDropIndicators();
            el.classList.add('drop-nest');
          }
        }, 800);
      }
    }

    clearDropIndicators();
    if (dragState.nestReady && canNest(srcId, srcLevel, node)) {
      el.classList.add('drop-nest');
      dragState.dropPos = null;
    } else {
      const rect = el.getBoundingClientRect();
      const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      dragState.dropPos = pos;
      el.classList.add(pos === 'before' ? 'drop-before' : 'drop-after');
    }
  });

  el.addEventListener('dragleave', e => {
    if (el.contains(e.relatedTarget)) return;
    if (dragState && dragState.hoveredId === node.id) {
      if (dragState.hoverTimer) { clearTimeout(dragState.hoverTimer); dragState.hoverTimer = null; }
      dragState.hoveredId = null;
      dragState.nestReady = false;
      dragState.dropPos = null;
    }
    el.classList.remove('drop-before', 'drop-after', 'drop-nest', 'drag-over');
  });

  el.addEventListener('drop', e => {
    if (!dragState && e.dataTransfer?.files?.length && node.level === LEVEL_TASK && onFiles) {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-nest');
      onFiles(e.dataTransfer.files);
      return;
    }
    if (!dragState) return;
    e.preventDefault(); e.stopPropagation();
    const { nodeId: srcId, level: srcLevel, nestReady, dropPos } = dragState;
    const tgtId = node.id;
    const tgtLevel = node.level;
    dragState = null;
    clearDropIndicators();
    el.classList.remove('drag-over');

    if (nestReady) {
      if (srcLevel === LEVEL_TASK && tgtLevel === LEVEL_TASK) {
        nestTaskUnderTask(srcId, tgtId);
      } else if (srcLevel === LEVEL_SUB && tgtLevel === LEVEL_TASK) {
        pushUndo();
        const tgtNode = nodes.find(n => n.id === tgtId);
        if (tgtNode) tgtNode.collapsed = false;
        moveSubToTask(srcId, tgtId);
      }
    } else if (srcLevel === LEVEL_TASK && tgtLevel === LEVEL_TASK) {
      if (dropPos === 'before') insertTaskBefore(srcId, tgtId);
      else insertTaskAfter(srcId, tgtId);
    } else if (srcLevel === LEVEL_SUB && tgtLevel === LEVEL_TASK) {
      if (dropPos === 'before') promoteSubToTask(srcId, tgtId, 'before');
      else promoteSubToTask(srcId, tgtId, 'after');
    } else if (srcLevel === LEVEL_SUB && tgtLevel === LEVEL_SUB) {
      if (dropPos === 'before') insertSubBefore(srcId, tgtId);
      else insertSubAfter(srcId, tgtId);
    }
    markDirtyTree(); render();
  });
}

// ── File attachments ───────────────────────────────────────────
function attachFilesToTask(files, taskId) {
  const reads = Array.from(files).map(f => new Promise(res => {
    const r = new FileReader();
    r.onload = () => res({ fileName: f.name, dataUrl: r.result, size: f.size });
    r.onerror = () => res(null);
    r.readAsDataURL(f);
  }));
  Promise.all(reads).then(results => {
    const good = results.filter(Boolean);
    if (!good.length) return;
    const taskIdx = nodes.findIndex(n => n.id === taskId);
    if (taskIdx === -1) return;
    pushUndo();
    let ins = taskIdx + 1;
    while (ins < nodes.length && nodes[ins].level === LEVEL_SUB) ins++;
    const subs = good.map(r => ({ id: nextId++, level: LEVEL_SUB, text: r.fileName, isAttachment: true, fileName: r.fileName, dataUrl: r.dataUrl, size: r.size }));
    nodes.splice(ins, 0, ...subs);
    nodes[taskIdx].collapsed = false;
    markDirtyTree();
    render();
  });
}

function attachmentMimeType(node) {
  const dataUrl = node && node.dataUrl;
  if (typeof dataUrl !== 'string') return '';
  const m = dataUrl.match(/^data:([^;,]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function attachmentExtension(node) {
  const fileName = (node && (node.fileName || node.text) || '').toLowerCase();
  const m = fileName.match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : '';
}

function isCsvAttachment(node) {
  const mime = attachmentMimeType(node);
  const ext = attachmentExtension(node);
  return ext === 'csv' || mime === 'text/csv' || mime === 'application/csv';
}

function isPdfAttachment(node) {
  return attachmentMimeType(node) === 'application/pdf' || attachmentExtension(node) === 'pdf';
}

function isImageAttachment(node) {
  const mime = attachmentMimeType(node);
  const ext = attachmentExtension(node);
  return /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(mime) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(ext);
}

function isPreviewableAttachment(node) {
  return isPdfAttachment(node) || isImageAttachment(node) || isCsvAttachment(node);
}

function dataUrlText(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return '';
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    }
    return decodeURIComponent(body.replace(/\+/g, '%20')).replace(/^\uFEFF/, '');
  } catch {
    return '';
  }
}

function csvDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  let lines = 0;
  for (let i = 0; i < text.length && lines < 5; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') i++;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === '\n') {
      lines++;
    } else if (Object.prototype.hasOwnProperty.call(counts, ch)) {
      counts[ch]++;
    }
  }
  return Object.keys(counts).reduce((best, ch) => counts[ch] > counts[best] ? ch : best, ',');
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const delimiter = csvDelimiter(text);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function attachmentPreviewBody(node) {
  const dataUrl = node.dataUrl || '';
  if (isCsvAttachment(node)) {
    const rows = parseCsvRows(dataUrlText(dataUrl));
    const maxRows = 1000;
    const shown = rows.slice(0, maxRows);
    const maxCols = shown.reduce((n, row) => Math.max(n, row.length), 0);
    const header = shown[0] || [];
    const body = shown.slice(1);
    const tableHead = '<tr>' + Array.from({ length: maxCols }, (_, i) => '<th>' + escapeHtml(header[i] || '') + '</th>').join('') + '</tr>';
    const tableBody = body.map(row => '<tr>' + Array.from({ length: maxCols }, (_, i) => '<td>' + escapeHtml(row[i] || '') + '</td>').join('') + '</tr>').join('');
    const note = rows.length > maxRows ? '<div class="apv-note">Showing first ' + maxRows + ' rows of ' + rows.length + '.</div>' : '';
    return '<div class="apv-csv">' + note + '<div class="apv-table-wrap"><table><thead>' + tableHead + '</thead><tbody>' + tableBody + '</tbody></table></div></div>';
  }
  if (isPdfAttachment(node)) {
    return '<iframe class="apv-pdf" src="' + escapeHtml(dataUrl) + '" title="' + escapeHtml(node.fileName || 'PDF preview') + '"></iframe>';
  }
  return '<div class="apv-image-wrap"><img src="' + escapeHtml(dataUrl) + '" alt="' + escapeHtml(node.fileName || 'Attachment preview') + '"></div>';
}

function closeAttachmentPreview() {
  const overlay = document.querySelector('.attachment-preview-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', attachmentPreviewKeydown);
}

function attachmentPreviewKeydown(e) {
  if (e.key === 'Escape') closeAttachmentPreview();
}

function openAttachmentPreview(node) {
  const title = node.fileName || 'Attachment preview';
  const downloadName = node.fileName || 'download';
  closeAttachmentPreview();

  const overlay = document.createElement('div');
  overlay.className = 'attachment-preview-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', title);
  overlay.innerHTML = `
    <button class="attachment-preview-close" type="button" aria-label="Close preview">×</button>
    <div class="attachment-preview-actions">
      <button class="attachment-preview-size" type="button">Full</button>
      <a class="attachment-preview-download" href="${escapeHtml(node.dataUrl || '')}" download="${escapeHtml(downloadName)}">Download</a>
    </div>
    <div class="attachment-preview-stage">
      <div class="attachment-preview-content">${attachmentPreviewBody(node)}</div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAttachmentPreview(); });
  overlay.querySelector('.attachment-preview-close').addEventListener('click', closeAttachmentPreview);
  overlay.querySelector('.attachment-preview-size').addEventListener('click', e => {
    const full = overlay.classList.toggle('is-full');
    e.currentTarget.textContent = full ? 'Fit' : 'Full';
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', attachmentPreviewKeydown);
}

function linkDomain(text) {
  if (!text) return null;
  const t = text.trim();
  if (/\s/.test(t)) return null;
  const hasScheme = /^https?:\/\//i.test(t);
  if (!hasScheme && !/^[\w-]+(\.[\w-]+)+([\/?#].*)?$/i.test(t)) return null;
  try {
    const u = new URL(hasScheme ? t : 'https://' + t);
    return u.hostname.replace(/^www\./i, '');
  } catch { return null; }
}

function addProject() {
  if (!isProjectsNotepad()) return;
  pushUndo();
  viewMode = 'acc';
  const project = {
    id: nextId++,
    level: LEVEL_ACCOUNT,
    text: '',
    status: '',
    collapsed: false,
    collapsedGroups: {}
  };
  nodes.push(project);
  focusedNodeId = project.id;
  editingNodeId = project.id;
  markDirtyTree();
  render();
}

function appendProjectAddRow(gutter, content) {
  const gl = mk('div');
  gl.className = 'gutter-line project-add-gutter';
  gutter.appendChild(gl);

  const row = mk('div');
  row.className = 'row project-add-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'project-add-btn';
  btn.textContent = '+ Project';
  btn.addEventListener('click', addProject);
  row.appendChild(btn);
  content.appendChild(row);
}

// ── Main render ────────────────────────────────────────────────
function render() {
  const gutter = document.getElementById('gutter');
  const content = document.getElementById('content');
  const editor = document.getElementById('editor');
  if (!gutter || !content) return;

  editor.classList.remove('notepad-mode');
  editor.classList.toggle('projects-mode', isProjectsNotepad());
  const rows = searchQuery ? buildSearchRows() : (viewMode === 'status' ? buildStatusRows() : buildRows());
  gutter.innerHTML = '';
  content.innerHTML = '';

  rows.forEach((row, vi) => {
    const gl = mk('div');
    gl.className = 'gutter-line';
    gl.textContent = vi + 1;
    gutter.appendChild(gl);

    const el = mk('div');
    if (row.kind === 'group') {
      renderGroupRow(el, row);
    } else if (row.kind === 'status-group') {
      renderStatusGroupRow(el, row);
    } else {
      renderNodeRow(el, row);
    }
    content.appendChild(el);
  });

  if (isProjectsNotepad() && !searchQuery) appendProjectAddRow(gutter, content);

  const focused = content.querySelector('.row.focused');
  const searchHasFocus = document.activeElement === document.getElementById('search-input');
  if (focused && !editingNodeId && !searchHasFocus) focused.focus();
  syncGutterHeights();
  buildTodoPanel();
}

function syncGutterHeights() {
  const gutter = document.getElementById('gutter');
  const content = document.getElementById('content');
  if (!gutter || !content) return;
  requestAnimationFrame(() => {
    const gl = gutter.children;
    const cr = content.children;
    for (let i = 0; i < cr.length; i++) {
      if (gl[i]) gl[i].style.height = cr[i].offsetHeight + 'px';
    }
  });
}

// ── Group row ──────────────────────────────────────────────────
function renderGroupRow(el, row) {
  el.className = 'row row-group' + (isProjectsNotepad() ? ' project-account-group' : '');
  const indent = isProjectsNotepad() ? 1 : LEVEL_TASK;
  for (let d = 0; d < indent; d++) el.appendChild(mk('span')).className = 'indent';

  const tog = mk('span');
  tog.className = 'toggle ' + (row.collapsed ? 'closed' : 'open');
  tog.textContent = '▾';
  tog.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(row); render(); });
  el.appendChild(tog);

  const icon = mk('span', 'font-size:12px;margin-right:4px;');
  icon.textContent = S_ICON[row.status] || '';
  el.appendChild(icon);

  const lbl = mk('span');
  lbl.className = 'label label-shrink';
  lbl.textContent = S_LABEL[row.status] || row.status;
  el.appendChild(lbl);

  const cnt = mk('span', 'margin-left:6px;');
  cnt.className = 'group-count';
  cnt.textContent = row.count;
  el.appendChild(cnt);

  el.appendChild(mk('span', 'flex:1'));

  el.addEventListener('click', e => e.stopPropagation());
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.shiftKey ? toggleSiblings(row) : toggleCollapse(row);
    render();
  });

  attachDropTarget(el, LEVEL_TASK, taskId => {
    pushUndo();
    const acc = nodes.find(n => n.id === row.accId);
    if (acc) {
      acc.collapsed = false;
      if (!acc.collapsedGroups) acc.collapsedGroups = {};
      acc.collapsedGroups[row.status] = false;
    }
    moveTaskToAccount(taskId, row.accId, row.status);
    markDirtyTree(); render();
  });
}

// ── Status-group row (Status mode only) ───────────────────────
function renderStatusGroupRow(el, row) {
  el.className = 'row row-group' + (isProjectsNotepad() ? ' project-status-group' : '');
  const indent = isProjectsNotepad() ? 0 : LEVEL_ACCOUNT;
  for (let d = 0; d < indent; d++) el.appendChild(mk('span')).className = 'indent';

  const tog = mk('span');
  tog.className = 'toggle ' + (row.collapsed ? 'closed' : 'open');
  tog.textContent = '▾';
  const toggleSG = () => {
    const owner = row.statusState || row.weekNode;
    if (!owner.collapsedStatusGroups) owner.collapsedStatusGroups = {};
    owner.collapsedStatusGroups[row.status] = !owner.collapsedStatusGroups[row.status];
    row.settingsBacked ? markDirtySettings() : markDirtyUI();
    render();
  };
  tog.addEventListener('click', e => { e.stopPropagation(); toggleSG(); });
  el.appendChild(tog);

  const icon = mk('span', 'font-size:12px;margin-right:4px;');
  icon.textContent = S_ICON[row.status] || '';
  el.appendChild(icon);

  const lbl = mk('span');
  lbl.className = 'label label-shrink';
  lbl.textContent = S_LABEL[row.status] || row.status;
  el.appendChild(lbl);

  const cnt = mk('span', 'margin-left:6px;');
  cnt.className = 'group-count';
  cnt.textContent = row.count;
  el.appendChild(cnt);

  el.appendChild(mk('span', 'flex:1'));
  el.addEventListener('click', e => e.stopPropagation());
  el.addEventListener('contextmenu', e => { e.preventDefault(); toggleSG(); });
}

// ── Status rows (Status view mode for main tree) ───────────────
function buildStatusRows() {
  if (isProjectsNotepad()) return buildProjectStatusRows();
  const rows = [];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    if (isAncestorCollapsed(i)) { i++; continue; }

    if (n.level <= LEVEL_MONTH) { rows.push({ kind: 'node', node: n, nodeIdx: i }); i++; continue; }

    if (n.level === LEVEL_WEEK) {
      rows.push({ kind: 'node', node: n, nodeIdx: i });
      i++;
      if (n.collapsed) { while (i < nodes.length && nodes[i].level > LEVEL_WEEK) i++; continue; }

      // Parse week's accounts → tasks grouped by status
      const byStatus = {}; // status → [{ accNode, accIdx, tasks:[{node,nodeIdx,subs}] }]
      let j = i;
      while (j < nodes.length && nodes[j].level > LEVEL_WEEK) {
        if (nodes[j].level === LEVEL_ACCOUNT) {
          const accNode = nodes[j], accIdx = j;
          const tasksByStatus = {};
          j++;
          while (j < nodes.length && nodes[j].level > LEVEL_ACCOUNT) {
            if (nodes[j].level === LEVEL_TASK) {
              const s = nodes[j].status || 'todo';
              if (!tasksByStatus[s]) tasksByStatus[s] = [];
              const t = { node: nodes[j], nodeIdx: j, subs: [] };
              j++;
              while (j < nodes.length && nodes[j].level === LEVEL_SUB) { t.subs.push({ node: nodes[j], nodeIdx: j }); j++; }
              tasksByStatus[s].push(t);
            } else { j++; }
          }
          Object.entries(tasksByStatus).forEach(([s, tasks]) => {
            if (!byStatus[s]) byStatus[s] = [];
            byStatus[s].push({ accNode, accIdx, tasks });
          });
        } else { j++; }
      }

      displayOrder().forEach(status => {
        if (!byStatus[status]) return;
        const accList = byStatus[status];
        const collapsed = !!(n.collapsedStatusGroups?.[status]);
        rows.push({ kind: 'status-group', status, weekNode: n, collapsed, count: accList.reduce((s, a) => s + a.tasks.length, 0) });
        if (collapsed) return;
        accList.forEach(({ accNode, accIdx, tasks }) => {
          rows.push({ kind: 'node', node: accNode, nodeIdx: accIdx, extraIndent: 1 });
          if (!accNode.collapsed) tasks.forEach(({ node: task, nodeIdx, subs }) => {
            rows.push({ kind: 'node', node: task, nodeIdx });
            if (!task.collapsed) subs.forEach(s => rows.push({ kind: 'node', node: s.node, nodeIdx: s.nodeIdx }));
          });
        });
      });

      i = j; continue;
    }

    i++;
  }
  return rows;
}

function buildProjectStatusRows() {
  const rows = [];
  const byStatus = {};
  let i = 0;

  while (i < nodes.length) {
    const project = nodes[i];
    if (project.level !== LEVEL_ACCOUNT) { i++; continue; }
    const projectIdx = i;
    const tasksByStatus = {};
    i++;
    while (i < nodes.length && nodes[i].level > LEVEL_ACCOUNT) {
      if (nodes[i].level === LEVEL_TASK) {
        const status = nodes[i].status || 'todo';
        const task = { node: nodes[i], nodeIdx: i, subs: [] };
        i++;
        while (i < nodes.length && nodes[i].level === LEVEL_SUB) {
          task.subs.push({ node: nodes[i], nodeIdx: i });
          i++;
        }
        if (!tasksByStatus[status]) tasksByStatus[status] = [];
        tasksByStatus[status].push(task);
      } else {
        i++;
      }
    }
    Object.entries(tasksByStatus).forEach(([status, tasks]) => {
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push({ project, projectIdx, tasks });
    });
  }

  const np = notepads.find(n => n.key === PROJECTS_NOTEPAD_KEY);
  if (np && !np.collapsedStatusGroups) np.collapsedStatusGroups = {};
  displayOrder().forEach(status => {
    const projects = byStatus[status];
    if (!projects?.length) return;
    const collapsed = !!np?.collapsedStatusGroups?.[status];
    rows.push({
      kind: 'status-group', status, collapsed,
      count: projects.reduce((sum, p) => sum + p.tasks.length, 0),
      statusState: np, settingsBacked: true
    });
    if (collapsed) return;
    projects.forEach(({ project, projectIdx, tasks }) => {
      rows.push({ kind: 'node', node: project, nodeIdx: projectIdx, extraIndent: 1 });
      if (project.collapsed) return;
      tasks.forEach(({ node, nodeIdx, subs }) => {
        rows.push({ kind: 'node', node, nodeIdx, extraIndent: 1 });
        if (!node.collapsed) subs.forEach(sub => rows.push({ kind: 'node', node: sub.node, nodeIdx: sub.nodeIdx, extraIndent: 1 }));
      });
    });
  });
  return rows;
}

// ── Node row ───────────────────────────────────────────────────
function renderNodeRow(el, row) {
  const node = row.node;
  const ni = row.nodeIdx;
  const isFocused = node.id === focusedNodeId;
  const isEditing = node.id === editingNodeId;

  el.className = 'row level-' + node.level + (isFocused ? ' focused' : '') + (node.expanded || (node.text && node.text.includes('\n')) ? ' expanded' : '');
  el.dataset.nodeId = node.id;
  if (isProjectsNotepad() && row.extraIndent) el.classList.add('project-status-child');
  el.tabIndex = 0;

  const baseIndent = isProjectsNotepad() ? Math.max(0, node.level - LEVEL_ACCOUNT) : node.level;
  const indent = baseIndent + (row.extraIndent || 0);
  for (let d = 0; d < indent; d++) el.appendChild(mk('span')).className = 'indent';
  if (node.level === LEVEL_TASK || node.level === LEVEL_SUB) {
    el.appendChild(mk('span', 'width:15px;display:inline-block;flex-shrink:0;'));
  }

  const kids = hasChildren(ni);
  if (node.level < LEVEL_SUB && kids) {
    const tog = mk('span');
    tog.className = 'toggle ' + (node.collapsed ? 'closed' : 'open');
    tog.textContent = '▾';
    tog.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(row); render(); });
    el.appendChild(tog);
  } else {
    el.appendChild(mk('span')).className = 'toggle-spacer';
  }

  if (node.level === LEVEL_TASK && !isEditing) {
    const a = mk('span', 'flex-shrink:0;width:0;overflow:visible;position:relative;align-self:stretch;');
    a.setAttribute('data-anchor', node.id);
    el.appendChild(a);
  }

  if (isEditing) {
    renderEditInput(el, node, ni);
  } else if (node.level === LEVEL_SUB && node.isAttachment) {
    const a = document.createElement('a');
    a.className = 'label label-flex sub-attach';
    a.href = node.dataUrl;
    if (isPreviewableAttachment(node)) {
      a.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openAttachmentPreview(node);
      });
    } else {
      a.download = node.fileName || 'download';
    }
    a.textContent = '📎 ' + (node.fileName || 'attachment');
    a.title = node.fileName || 'attachment';
    a.addEventListener('click', e => e.stopPropagation());
    el.appendChild(a);
  } else if (node.level === LEVEL_SUB) {
    const domain = linkDomain(node.text);
    if (domain) {
      const a = document.createElement('a');
      a.className = 'label label-flex sub-link';
      a.href = /^https?:\/\//i.test(node.text.trim()) ? node.text.trim() : 'https://' + node.text.trim();
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = domain;
      a.addEventListener('click', e => e.stopPropagation());
      el.appendChild(a);
    } else {
      const lbl = mk('span');
      lbl.className = 'label label-flex';
      lbl.textContent = node.text;
      attachLabelExpand(lbl, node);
      el.appendChild(lbl);
    }
  } else {
    const lc = (node.level >= LEVEL_QUARTER && node.level <= LEVEL_ACCOUNT) ? 'label label-shrink' : 'label label-flex';
    const lbl = mk('span');
    lbl.className = lc;
    lbl.textContent = node.text;
    if (node.level === LEVEL_TASK) attachLabelExpand(lbl, node);
    el.appendChild(lbl);
  }

  if ((node.level === LEVEL_WEEK || node.level === LEVEL_ACCOUNT) && !isEditing) {
    el.appendChild(mk('span', 'width:8px;flex-shrink:0;'));
    const ab = mk('span');
    ab.className = 'add-btn';
    ab.textContent = '+';
    ab.addEventListener('click', e => { e.stopPropagation(); addChild(ni); });
    el.appendChild(ab);

    if (node.level === LEVEL_ACCOUNT) {
      let tc = 0;
      for (let i = ni + 1; i < nodes.length && nodes[i].level > LEVEL_ACCOUNT; i++) {
        if (nodes[i].level === LEVEL_TASK) tc++;
      }
      if (tc) {
        el.appendChild(mk('span', 'width:5px;flex-shrink:0;'));
        const c = mk('span');
        c.className = 'group-count';
        c.textContent = tc;
        el.appendChild(c);
      }
    }
    el.appendChild(mk('span', 'flex:1'));
  }

  if ((node.level === LEVEL_SUB || node.level === LEVEL_TASK || node.level === LEVEL_ACCOUNT) && !isEditing) {
    const dh = mk('span');
    dh.className = 'del-hint';
    dh.textContent = '⌫';
    dh.title = node.level === LEVEL_ACCOUNT
      ? (isProjectsNotepad() ? 'Delete project and entries' : 'Delete account and entries')
      : node.level === LEVEL_TASK ? 'Delete entry' : 'Delete sub-entry';
    dh.addEventListener('click', e => {
      e.stopPropagation();
      pushUndo();
      if (node.level === LEVEL_ACCOUNT) {
        let end = ni + 1;
        while (end < nodes.length && nodes[end].level >= LEVEL_TASK) end++;
        nodes.splice(ni, end - ni);
      } else if (node.level === LEVEL_TASK) {
        let end = ni + 1;
        while (end < nodes.length && nodes[end].level === LEVEL_SUB) end++;
        nodes.splice(ni, end - ni);
      } else {
        nodes.splice(ni, 1);
      }
      markDirtyTree();
      render();
    });
    el.appendChild(dh);
  }

  if ((node.level === LEVEL_TASK || node.level === LEVEL_SUB) && !isEditing) {
    el.draggable = true;
    el.addEventListener('dragstart', e => { e.stopPropagation(); startDrag(e, node.id, node.level); });
    el.addEventListener('dragend', endDrag);
  }

  if (node.level === LEVEL_ACCOUNT && !isEditing) {
    attachDropTarget(el, LEVEL_TASK, taskId => {
      pushUndo();
      node.collapsed = false;
      moveTaskToAccount(taskId, node.id);
      markDirtyTree(); render();
    });
  }

  if ((node.level === LEVEL_TASK || node.level === LEVEL_SUB) && !isEditing) {
    attachRowDragEvents(el, node, node.level === LEVEL_TASK ? files => attachFilesToTask(files, node.id) : null);
  }

  attachNodeEvents(el, node, ni, row, isEditing);
}

function attachLabelExpand(lbl, node) {
  lbl.addEventListener('click', e => {
    e.stopPropagation();
    if (labelClickTimer) { clearTimeout(labelClickTimer); labelClickTimer = null; }
    labelClickTimer = setTimeout(() => {
      labelClickTimer = null;
      const overflow = lbl.scrollWidth > lbl.clientWidth + 1;
      if (!node.expanded && !overflow && !/\n/.test(node.text || '')) return;
      node.expanded = !node.expanded;
      markDirtyUI();
      render();
    }, 220);
  });
}

// ── Edit input ─────────────────────────────────────────────────
function renderEditInput(el, node, ni) {
  const multiline = node.level === LEVEL_TASK || node.level === LEVEL_SUB;
  const inp = document.createElement(multiline ? 'textarea' : 'input');
  inp.className = 'row-edit' + (multiline ? ' row-edit-multi' : '');
  if (!multiline) inp.placeholder = node.level === LEVEL_ACCOUNT
    ? (isProjectsNotepad() ? 'project name…' : 'account name…')
    : 'new entry…';
  inp.value = node.text || '';

  // Account name autocomplete — live names only, Tab inserts first match
  let accNames = [];
  if (node.level === LEVEL_ACCOUNT && !isProjectsNotepad()) {
    accNames = [...new Set(
      nodes.filter(n => n.level === LEVEL_ACCOUNT && n.text && n.id !== node.id).map(n => n.text)
    )];
    const dlId = 'acc-names-dl';
    const dl = document.createElement('datalist');
    dl.id = dlId;
    accNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
    inp.setAttribute('list', dlId);
    el.appendChild(dl);
  }
  if (multiline) {
    inp.rows = 1;
    const autoSize = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
    inp.addEventListener('input', autoSize);
    setTimeout(autoSize, 0);
  }

  const commit = (andCreateSibling = false) => {
    const raw = inp.value;
    const t = multiline ? raw.replace(/\s+$/, '') : raw.trim();
    if (andCreateSibling) {
      pushUndo();
      if (t) { node.text = t; } else if (nodes.length > 1) { nodes.splice(ni, 1); andCreateSibling = false; }
    } else {
      if (t) {
        pushUndo();
        node.text = t;
      } else if (nodes.length > 1) {
        pushUndo();
        nodes.splice(ni, 1);
      }
    }
    editingNodeId = null; focusedNodeId = node.id;
    if (andCreateSibling) {
      const curIdx = nodes.findIndex(n => n.id === node.id);
      let ins = curIdx + 1;
      while (ins < nodes.length && nodes[ins].level > node.level) ins++;
      const nn = { id: nextId++, level: node.level, text: '' };
      if (nn.level === LEVEL_TASK) nn.status = node.status || 'todo';
      nodes.splice(ins, 0, nn);
      focusedNodeId = nn.id; editingNodeId = nn.id;
    }
    markDirtyTree(); render();
  };

  inp.addEventListener('keydown', e => {
    if (e.key === 'Tab' && node.level === LEVEL_ACCOUNT && accNames.length) {
      const q = inp.value.toLowerCase();
      const match = q
        ? (accNames.find(n => n.toLowerCase().startsWith(q)) || accNames.find(n => n.toLowerCase().includes(q)))
        : accNames[0];
      if (match) { e.preventDefault(); inp.value = match; }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      let removedEmpty = false;
      if (!node.text && nodes.length > 1) {
        pushUndo();
        nodes.splice(ni, 1);
        removedEmpty = true;
      }
      editingNodeId = null;
      if (removedEmpty) markDirtyTree();
      render(); e.preventDefault();
    }
  });

  inp.addEventListener('blur', () => {
    if (editingNodeId === node.id) commit();
  });

  el.appendChild(inp);
  if (!multiline) el.appendChild(mk('span', 'flex:1'));
  setTimeout(() => {
    inp.focus();
    const len = inp.value.length;
    try { inp.setSelectionRange(len, len); } catch {}
  }, 10);
}

// ── Node event listeners ───────────────────────────────────────
function isMobileTreeLayout() {
  return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

function getStatusPickerAnchor(rowEl, nodeId) {
  if (isMobileTreeLayout()) return rowEl;
  return rowEl.querySelector('[data-anchor="' + nodeId + '"]');
}

function mobileStatusFromSlide(originalStatus, dx, unlocked) {
  const order = pickerOrder();
  if (!order.length) return originalStatus || 'todo';
  const base = order.indexOf(originalStatus || 'todo');
  const start = base === -1 ? 0 : base;
  const rawSteps = Math.round(dx / 64);
  const steps = unlocked ? rawSteps : 1;
  return order[(start + steps % order.length + order.length) % order.length];
}

function updateMobileStatusPicker(node, rowEl, dx, unlocked) {
  const pending = mobileStatusFromSlide(node.status || 'todo', dx, unlocked);
  const anchor = getStatusPickerAnchor(rowEl, node.id);
  if (picker?.nodeId === node.id) {
    setPickerStatus(pending, false);
  } else {
    openPickerAtStatus(node.id, anchor, true, pending, false);
  }
}

function createSubtaskFromSwipe(node, ni) {
  pushUndo();
  const nn = { id: nextId++, level: LEVEL_SUB, text: '' };
  let ins = ni + 1;
  while (ins < nodes.length && nodes[ins].level === LEVEL_SUB) ins++;
  nodes.splice(ins, 0, nn);
  node.collapsed = false;
  focusedNodeId = nn.id;
  editingNodeId = nn.id;
  markDirtyTree();
  render();
}

function editTaskFromSwipe(node) {
  if (node.isAttachment) return;
  focusedNodeId = node.id;
  editingNodeId = node.id;
  render();
}

function attachNodeEvents(el, node, ni, row, isEditing) {
  el.addEventListener('mouseenter', () => {
    if (focusedNodeId === node.id) return;
    const prev = document.querySelector('#content .row.focused');
    if (prev) prev.classList.remove('focused');
    focusedNodeId = node.id;
    el.classList.add('focused');
    if (!editingNodeId) el.focus();
  });
  el.addEventListener('click', e => { if (e.target.closest('.add-btn')) return; focusedNodeId = node.id; });
  el.addEventListener('dblclick', e => {
    if (e.target.closest('.add-btn')) return;
    if (labelClickTimer) { clearTimeout(labelClickTimer); labelClickTimer = null; }
    if (node.isAttachment) return;
    focusedNodeId = node.id; editingNodeId = node.id; render();
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    focusedNodeId = node.id;
    if (node.level === LEVEL_TASK && !isEditing) {
      const a = getStatusPickerAnchor(el, node.id);
      picker?.nodeId === node.id ? advancePicker() : openPicker(node.id, a, true);
      return;
    }
    e.shiftKey ? toggleSiblings(row) : toggleCollapse(row);
    render();
  });
  el.addEventListener('keydown', e => { if (isEditing) return; handleNodeKeydown(e, node, ni, row); });
  el.addEventListener('focus', () => { focusedNodeId = node.id; });

  // ── Mobile task gestures ──
  if (!isEditing && node.level === LEVEL_TASK && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
    let tStart = null;
    let longTimer = null;
    let slideTimer = null;

    const clearTouchTimers = () => {
      if (longTimer) clearTimeout(longTimer);
      if (slideTimer) clearTimeout(slideTimer);
      longTimer = null;
      slideTimer = null;
    };

    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || e.target.closest('a, .add-btn, .del-hint, .toggle')) {
        tStart = null;
        clearTouchTimers();
        return;
      }
      const t = e.touches[0];
      tStart = {
        x: t.clientX,
        y: t.clientY,
        time: Date.now(),
        mode: 'tap',
        statusUnlocked: false,
        lastDx: 0,
        moved: false
      };
      focusedNodeId = node.id;
      longTimer = setTimeout(() => {
        if (!tStart || tStart.moved || tStart.mode !== 'tap') return;
        tStart.mode = 'edit';
        editTaskFromSwipe(node);
      }, 1000);
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if (!tStart || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tStart.x;
      const dy = t.clientY - tStart.y;
      tStart.lastDx = dx;

      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        tStart.moved = true;
        if (longTimer) { clearTimeout(longTimer); longTimer = null; }
      }
      if (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx)) return;

      if ((tStart.mode === 'status' || dx > 45) && Math.abs(dy) < 42) {
        e.preventDefault();
        if (tStart.mode !== 'status') {
          tStart.mode = 'status';
          updateMobileStatusPicker(node, el, dx, false);
          slideTimer = setTimeout(() => {
            if (!tStart || tStart.mode !== 'status') return;
            tStart.statusUnlocked = true;
            updateMobileStatusPicker(node, el, tStart.lastDx, true);
          }, 500);
        } else {
          updateMobileStatusPicker(node, el, dx, tStart.statusUnlocked);
        }
      } else if (dx < -45 && Math.abs(dy) < 42 && tStart.mode !== 'status') {
        e.preventDefault();
        tStart.mode = 'subtask';
      }
    }, { passive: false });

    el.addEventListener('touchend', e => {
      if (!tStart || e.changedTouches.length !== 1) {
        tStart = null;
        clearTouchTimers();
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - tStart.x;
      const dy = t.clientY - tStart.y;
      const mode = tStart.mode;
      const wasMoved = tStart.moved;
      tStart = null;
      clearTouchTimers();

      if (mode === 'edit') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (mode === 'status' || (dx > 55 && Math.abs(dy) < 42)) {
        e.preventDefault();
        e.stopPropagation();
        if (!picker || picker.nodeId !== node.id) updateMobileStatusPicker(node, el, dx, false);
        commitPicker();
        return;
      }
      if (mode === 'subtask' || (dx < -55 && Math.abs(dy) < 42)) {
        e.preventDefault();
        e.stopPropagation();
        createSubtaskFromSwipe(node, ni);
        return;
      }
      if (!wasMoved && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapse(row);
      }
    });

    el.addEventListener('touchcancel', () => {
      tStart = null;
      clearTouchTimers();
      if (picker?.nodeId === node.id) dismissPicker();
    });
  }
}

function handleNodeKeydown(e, node, ni, row) {
  const cr = buildRows();
  const cv = cr.findIndex(r => r.kind === 'node' && r.node.id === node.id);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    for (let k = cv + 1; k < cr.length; k++) { if (cr[k].kind === 'node') { focusedNodeId = cr[k].node.id; break; } }
    render();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    for (let k = cv - 1; k >= 0; k--) { if (cr[k].kind === 'node') { focusedNodeId = cr[k].node.id; break; } }
    render();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (node.level < LEVEL_ACCOUNT) return;
    pushUndo();
    if (node.level === LEVEL_ACCOUNT) {
      // add task child at end of account
      const nn = { id: nextId++, level: LEVEL_TASK, text: '', status: 'todo' };
      let ins = ni + 1;
      while (ins < nodes.length && nodes[ins].level >= LEVEL_TASK) ins++;
      nodes.splice(ins, 0, nn);
      node.collapsed = false;
      focusedNodeId = nn.id; editingNodeId = nn.id;
    } else if (node.level === LEVEL_TASK) {
      if (e.shiftKey) {
        // add sub-entry at end of this task's subs
        const nn = { id: nextId++, level: LEVEL_SUB, text: '' };
        let ins = ni + 1;
        while (ins < nodes.length && nodes[ins].level === LEVEL_SUB) ins++;
        nodes.splice(ins, 0, nn);
        node.collapsed = false;
        focusedNodeId = nn.id; editingNodeId = nn.id;
      } else {
        // add sibling task after this task and its subs
        const nn = { id: nextId++, level: LEVEL_TASK, text: '', status: 'todo' };
        let ins = ni + 1;
        while (ins < nodes.length && nodes[ins].level === LEVEL_SUB) ins++;
        nodes.splice(ins, 0, nn);
        focusedNodeId = nn.id; editingNodeId = nn.id;
      }
    } else {
      // level 6: add sibling sub-entry
      const nn = { id: nextId++, level: LEVEL_SUB, text: '' };
      nodes.splice(ni + 1, 0, nn);
      focusedNodeId = nn.id; editingNodeId = nn.id;
    }
    markDirtyTree(); render();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && document.getElementById('left-wrap')?.matches(':hover') && nodes.length > 1 && (node.level === LEVEL_SUB || node.level === LEVEL_TASK || node.level === LEVEL_ACCOUNT)) {
    e.preventDefault();
    pushUndo();
    if (node.level === LEVEL_ACCOUNT) {
      let end = ni + 1;
      while (end < nodes.length && nodes[end].level >= LEVEL_TASK) end++;
      nodes.splice(ni, end - ni);
    } else if (node.level === LEVEL_TASK) {
      let end = ni + 1;
      while (end < nodes.length && nodes[end].level === LEVEL_SUB) end++;
      nodes.splice(ni, end - ni);
    } else {
      nodes.splice(ni, 1);
    }
    markDirtyTree();
    const cr2 = buildRows();
    for (let k = cv - 1; k >= 0; k--) { if (cr2[k]?.kind === 'node') { focusedNodeId = cr2[k].node.id; break; } }
    render();
  } else if (e.key === 'F2') {
    e.preventDefault();
    editingNodeId = node.id; render();
  }
}

// ── Notebook switching ─────────────────────────────────────────
function notebookKeys() {
  return [null, ...notepads.map(n => n.key)];
}

function cycleNotebook(dir) {
  const keys = notebookKeys();
  if (keys.length < 2) return;
  const idx = keys.indexOf(activeNotepad);
  const next = keys[(idx + dir + keys.length) % keys.length];
  switchNotebook(next);
}

let searchQuery = '';
let preSearchCollapsed = null;
let viewMode = 'acc'; // 'acc' | 'status'

// Horizontal 2-finger swipe over the To-Do panel
//   plain swipe  → cycle notebooks
//   Shift+swipe  → toggle acc/status view (animates only the active view label)
// After a switch fires, lock until the gesture goes idle (~180ms with no wheel
// events) — prevents long swipes / trackpad inertia from triggering a 2nd switch.
let _swipeAccum = 0;
let _shiftSwipeAccum = 0;
let _swipeLocked = false;
let _swipeIdleTimer = null;

function _armSwipeLock() {
  _swipeLocked = true;
  _swipeAccum = 0;
  _shiftSwipeAccum = 0;
  if (_swipeIdleTimer) clearTimeout(_swipeIdleTimer);
  _swipeIdleTimer = setTimeout(() => { _swipeLocked = false; }, 180);
}

function toggleViewMode() {
  const mc = document.getElementById('content');
  if (mc) mc.style.opacity = '0';
  setTimeout(() => {
    viewMode = viewMode === 'acc' ? 'status' : 'acc';
    render();
    if (mc) { mc.style.transition = 'none'; mc.style.opacity = '0'; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mc) { mc.style.transition = ''; mc.style.opacity = ''; }
    }));
  }, 300);
}

window.addEventListener('wheel', e => {
  const rightWrap = document.getElementById('right-wrap');
  if (!rightWrap || !rightWrap.contains(e.target)) return;
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
  if (_swipeLocked) {
    // Keep extending the idle window while the gesture/inertia keeps firing.
    if (_swipeIdleTimer) clearTimeout(_swipeIdleTimer);
    _swipeIdleTimer = setTimeout(() => { _swipeLocked = false; }, 180);
    return;
  }
  if (e.shiftKey) {
    _shiftSwipeAccum += e.deltaX;
    if (Math.abs(_shiftSwipeAccum) >= 60) {
      toggleViewMode();
      _armSwipeLock();
    }
  } else {
    _swipeAccum += e.deltaX;
    if (Math.abs(_swipeAccum) >= 60) {
      cycleNotebook(_swipeAccum > 0 ? 1 : -1);
      _armSwipeLock();
    }
  }
}, { passive: true });

function switchNotebook(key) {
  if (key === activeNotepad) return;

  const doSwitch = () => {
    // Save current nodes + statuses back to their home
    if (activeNotepad === null) {
      mainNodes = nodes;
      mainStatuses = serializeStatuses();
    } else {
      const np = notepads.find(n => n.key === activeNotepad);
      if (np) { np.nodes = nodes; np.statuses = serializeStatuses(); }
    }

    // Load the new notebook
    activeNotepad = key;
    if (key === null) {
      nodes = mainNodes;
      applyStatuses(mainStatuses.length ? mainStatuses : serializeStatuses());
    } else {
      const np = notepads.find(n => n.key === key);
      nodes = np ? (np.nodes || []) : [];
      const sts = np?.statuses;
      applyStatuses(sts?.length ? sts : (mainStatuses.length ? mainStatuses.slice() : serializeStatuses()));
    }
    nextId = nodes.length ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
    focusedNodeId = nodes[0]?.id || null;
    searchQuery = ''; preSearchCollapsed = null;
    const _si = document.getElementById('search-input');
    if (_si) _si.value = '';
    applyActiveTheme();
    if (!isProjectsNotepad()) checkAndCreateCurrentWeek();
    render();
    // Fade in: set opacity 0 instantly (no transition), then let transition animate to 1
    const mc2 = document.getElementById('content');
    const tc2 = document.getElementById('todo-content');
    if (mc2) { mc2.style.transition = 'none'; mc2.style.opacity = '0'; }
    if (tc2) { tc2.style.transition = 'none'; tc2.style.opacity = '0'; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mc2) { mc2.style.transition = ''; mc2.style.opacity = ''; }
      if (tc2) { tc2.style.transition = ''; tc2.style.opacity = ''; }
    }));
  };

  // Fade out both panels, then switch
  const tc = document.getElementById('todo-content');
  const mc = document.getElementById('content');
  if (mc) mc.style.opacity = '0';
  if (tc) tc.style.opacity = '0';
  setTimeout(doSwitch, 300);
}

// ── Right panel tabs ───────────────────────────────────────────
function buildRightTabs() {
  const nbLeft = document.querySelector('#notebook-bar .nb-left');
  const nbRight = document.querySelector('#notebook-bar .nb-right');
  if (!nbLeft || !nbRight) return;

  nbLeft.innerHTML = '';
  nbRight.innerHTML = '';

  // Right half: View toggle — labels on sides, knob in middle
  const vs = document.createElement('div');
  vs.className = 'view-switch' + (viewMode === 'status' ? ' right' : '');

  const lblAcc = document.createElement('span');
  lblAcc.className = 'view-label' + (viewMode !== 'status' ? ' active' : '');
  lblAcc.textContent = 'Acc';

  const tog = document.createElement('div');
  tog.className = 'view-toggle';
  const knob = document.createElement('div');
  knob.className = 'view-knob';
  tog.appendChild(knob);

  const lblStatus = document.createElement('span');
  lblStatus.className = 'view-label' + (viewMode === 'status' ? ' active' : '');
  lblStatus.textContent = 'Status';

  const setView = (isStatus) => {
    viewMode = isStatus ? 'status' : 'acc';
    vs.classList.toggle('right', isStatus);
    lblAcc.classList.toggle('active', !isStatus);
    lblStatus.classList.toggle('active', isStatus);
    render();
  };
  // Any click anywhere on the switch area toggles between the two states
  vs.addEventListener('click', () => setView(!vs.classList.contains('right')));

  vs.appendChild(lblAcc);
  vs.appendChild(tog);
  vs.appendChild(lblStatus);
  nbRight.appendChild(vs);

  // Left half: notebook tabs — clicking the area cycles; clicking a tab icon navigates directly
  nbLeft.addEventListener('click', () => cycleNotebook(1));

  const mainTab = document.createElement('span');
  mainTab.className = 'right-tab-np' + (activeNotepad === null ? ' active' : '');
  mainTab.textContent = '📋';
  mainTab.title = 'Main notebook';
  mainTab.addEventListener('click', e => { e.stopPropagation(); switchNotebook(null); });
  nbLeft.appendChild(mainTab);

  notepads.forEach(np => {
    const tab = document.createElement('span');
    tab.className = 'right-tab-np' + (activeNotepad === np.key ? ' active' : '');
    tab.textContent = np.emoji || '📝';
    tab.title = np.name || np.key;
    tab.addEventListener('click', e => { e.stopPropagation(); switchNotebook(np.key); });
    nbLeft.appendChild(tab);
  });
}

// ── Search helpers ─────────────────────────────────────────────
function _snapNodeCollapse() {
  const snap = {};
  nodes.forEach(n => {
    snap[n.id] = { collapsed: !!n.collapsed, collapsedGroups: n.collapsedGroups ? JSON.parse(JSON.stringify(n.collapsedGroups)) : undefined };
  });
  return snap;
}

function _restoreNodeCollapse(snap) {
  nodes.forEach(n => {
    if (snap[n.id] !== undefined) {
      n.collapsed = snap[n.id].collapsed;
      if (snap[n.id].collapsedGroups) n.collapsedGroups = JSON.parse(JSON.stringify(snap[n.id].collapsedGroups));
      else delete n.collapsedGroups;
    }
  });
}

// ── Search rows (main tree filtered view) ─────────────────────
function buildSearchRows() {
  const q = searchQuery.toLowerCase();
  const rows = [];

  // Accounts whose name matches — their tasks are all included
  const matchingAccIds = new Set();
  nodes.forEach(n => {
    if (n.level === LEVEL_ACCOUNT && n.text.toLowerCase().includes(q)) matchingAccIds.add(n.id);
  });

  // Collect matching task IDs:
  //   • task text matches
  //   • task lives under a matching account
  //   • a sub-entry text matches (parent task is added)
  const matchingTaskIds = new Set();
  let curAccId = null;
  nodes.forEach((n, i) => {
    if (n.level === LEVEL_ACCOUNT) { curAccId = n.id; }
    else if (n.level < LEVEL_ACCOUNT) { curAccId = null; }

    if (n.level === LEVEL_TASK) {
      if (n.text.toLowerCase().includes(q) || (curAccId && matchingAccIds.has(curAccId)))
        matchingTaskIds.add(n.id);
    } else if (n.level === LEVEL_SUB && n.text.toLowerCase().includes(q)) {
      for (let j = i - 1; j >= 0; j--) {
        if (nodes[j].level === LEVEL_TASK) { matchingTaskIds.add(nodes[j].id); break; }
        if (nodes[j].level < LEVEL_TASK) break;
      }
    }
  });

  // Does the subtree below idx (strictly deeper than maxLevel) contain a matching task or account?
  function subtreeHasMatch(idx, maxLevel) {
    for (let j = idx + 1; j < nodes.length; j++) {
      if (nodes[j].level <= maxLevel) break;
      if (nodes[j].level === LEVEL_ACCOUNT && matchingAccIds.has(nodes[j].id)) return true;
      if (nodes[j].level === LEVEL_TASK && matchingTaskIds.has(nodes[j].id)) return true;
    }
    return false;
  }

  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];

    if (n.level <= LEVEL_WEEK) {
      if (subtreeHasMatch(i, n.level)) rows.push({ kind: 'node', node: n, nodeIdx: i });
      i++; continue;
    }

    if (n.level === LEVEL_ACCOUNT) {
      const accMatches = matchingAccIds.has(n.id);
      if (accMatches || subtreeHasMatch(i, LEVEL_ACCOUNT)) {
        rows.push({ kind: 'node', node: n, nodeIdx: i });
        i++;
        // If the account itself matched, include all its tasks and subs
        if (accMatches) {
          while (i < nodes.length && nodes[i].level >= LEVEL_TASK) {
            rows.push({ kind: 'node', node: nodes[i], nodeIdx: i });
            i++;
          }
          continue;
        }
      } else {
        i++;
      }
      continue;
    }

    if (n.level === LEVEL_TASK) {
      if (matchingTaskIds.has(n.id)) {
        rows.push({ kind: 'node', node: n, nodeIdx: i });
        i++;
        while (i < nodes.length && nodes[i].level === LEVEL_SUB) {
          if (nodes[i].text.toLowerCase().includes(q))
            rows.push({ kind: 'node', node: nodes[i], nodeIdx: i });
          i++;
        }
      } else {
        i++;
        while (i < nodes.length && nodes[i].level === LEVEL_SUB) i++;
      }
      continue;
    }

    i++;
  }
  return rows;
}

// ── Search bar init (called once on app start) ─────────────────
let _searchBarInited = false;
function initSearchBar() {
  if (_searchBarInited) return;
  _searchBarInited = true;
  const inp = document.getElementById('search-input');
  if (!inp) return;
  inp.addEventListener('mousedown', e => e.stopPropagation());
  inp.addEventListener('input', e => {
    const val = e.target.value;
    if (!searchQuery && val) preSearchCollapsed = _snapNodeCollapse();
    searchQuery = val;
    if (!searchQuery && preSearchCollapsed !== null) {
      _restoreNodeCollapse(preSearchCollapsed);
      preSearchCollapsed = null;
    }
    render();
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      inp.value = '';
      searchQuery = '';
      if (preSearchCollapsed !== null) {
        _restoreNodeCollapse(preSearchCollapsed);
        preSearchCollapsed = null;
      }
      render();
    }
  });
}

// ── To-Do panel ────────────────────────────────────────────────
function revealTodoInMain(taskId) {
  const taskIdx = nodes.findIndex(n => n.id === taskId && n.level === LEVEL_TASK);
  if (taskIdx === -1) return;

  if (searchQuery) {
    const inp = document.getElementById('search-input');
    if (inp) inp.value = '';
    searchQuery = '';
    if (preSearchCollapsed !== null) {
      _restoreNodeCollapse(preSearchCollapsed);
      preSearchCollapsed = null;
    }
  }

  viewMode = 'acc';
  let parentLevel = LEVEL_ACCOUNT;
  let account = null;
  for (let i = taskIdx - 1; i >= 0 && parentLevel >= LEVEL_YEAR; i--) {
    const node = nodes[i];
    if (node.level !== parentLevel) continue;
    node.collapsed = false;
    if (node.level === LEVEL_ACCOUNT) account = node;
    parentLevel--;
  }

  if (account) {
    if (!account.collapsedGroups) account.collapsedGroups = {};
    displayOrder().forEach(status => { account.collapsedGroups[status] = status !== 'todo'; });
    account.collapsedGroups.todo = false;
  }

  focusedNodeId = taskId;
  editingNodeId = null;
  dismissPicker();
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.body.classList.add('mobile-view-tree');
    document.body.classList.remove('mobile-view-todo');
    document.getElementById('mt-tree')?.classList.add('active');
    document.getElementById('mt-todo')?.classList.remove('active');
  }
  markDirtyUI();
  render();

  requestAnimationFrame(() => {
    const target = document.querySelector(`#content .row[data-node-id="${taskId}"]`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (target) {
      target.classList.add('todo-reveal-flash');
      target.addEventListener('animationend', () => target.classList.remove('todo-reveal-flash'), { once: true });
    }
  });
}

function buildTodoPanel() {
  initSearchBar();
  buildRightTabs();
  const el = document.getElementById('todo-content');
  const prevScrollTop = el.scrollTop;
  el.innerHTML = '';

  const projectsMode = isProjectsNotepad();
  const weeks = [];
  let curWeek = projectsMode ? { label: 'Projects', accs: [] } : null;
  let curAcc = null, curItems = [];

  nodes.forEach(n => {
    if (!projectsMode && n.level === LEVEL_WEEK) {
      if (curWeek) { if (curAcc && curItems.length) curWeek.accs.push({ acc: curAcc, items: [...curItems] }); weeks.push(curWeek); }
      curWeek = { label: n.text, accs: [] }; curAcc = null; curItems = [];
    }
    if (n.level === LEVEL_ACCOUNT) {
      if (curAcc && curItems.length && curWeek) curWeek.accs.push({ acc: curAcc, items: [...curItems] });
      curAcc = n; curItems = [];
    }
    if (n.level === LEVEL_TASK && n.status === 'todo' && curAcc) curItems.push(n);
  });
  if (curWeek) {
    if (curAcc && curItems.length) curWeek.accs.push({ acc: curAcc, items: [...curItems] });
    if (curWeek.accs.length) weeks.push(curWeek);
  }

  const withTodos = weeks.filter(w => w.accs.length > 0);
  if (!withTodos.length) {
    const e = document.createElement('div');
    e.style.cssText = 'color:#3a4050;font-size:11px;padding:12px;font-style:italic;';
    e.textContent = 'No to-do items';
    el.appendChild(e);
    return;
  }

  const sections = [];
  if (projectsMode) {
    sections.push({ label: 'Projects', weeks: withTodos, key: 'sec_projects' });
  } else {
    const current = withTodos[withTodos.length - 1];
    const previous = withTodos.length > 1 ? withTodos[withTodos.length - 2] : null;
    const older = withTodos.length > 2 ? withTodos.slice(0, withTodos.length - 2) : [];
    if (older.length) sections.push({ label: 'Older', weeks: older, key: 'sec_older' });
    if (previous) sections.push({ label: 'Previous week', weeks: [previous], key: 'sec_prev' });
    sections.push({ label: 'Current week', weeks: [current], key: 'sec_cur' });
  }

  sections.forEach((sec, si) => {
    const isCol = !!todoCollapsed[sec.key];

    const shdr = mk('div', 'height:20px;display:flex;align-items:center;padding:0 8px;cursor:pointer;user-select:none;' + (si > 0 ? 'border-top:1px solid #1a1f27;margin-top:2px;' : ''));
    const stog = document.createElement('span');
    stog.className = 'todo-acc-toggle ' + (isCol ? 'closed' : 'open');
    stog.textContent = '▾';
    shdr.appendChild(stog);

    const slbl = mk('span', 'font-size:var(--fs-week);color:#88c0d0;font-weight:bold;');
    slbl.textContent = sec.label;
    shdr.appendChild(slbl);

    const stotal = sec.weeks.reduce((s, w) => s + w.accs.reduce((a, ac) => a + ac.items.length, 0), 0);
    const scnt = document.createElement('span');
    scnt.className = 'todo-count';
    scnt.textContent = stotal;
    shdr.appendChild(scnt);

    const toggleSection = () => { todoCollapsed[sec.key] = !todoCollapsed[sec.key]; markDirtyUI(); buildTodoPanel(); };
    shdr.addEventListener('click', toggleSection);
    shdr.addEventListener('contextmenu', e => { e.preventDefault(); toggleSection(); });
    el.appendChild(shdr);
    if (isCol) return;

    sec.weeks.forEach(week => {
      if (sec.key === 'sec_older') {
        const is = theme.indentSize || 18;
        const wlbl = mk('div', 'height:18px;display:flex;align-items:center;padding:0 8px 0 ' + (2 * is) + 'px;font-size:var(--fs-week);color:#4a5570;user-select:none;');
        wlbl.textContent = week.label;
        el.appendChild(wlbl);
      }

      week.accs.forEach(({ acc, items }) => {
        const key = 'a' + acc.id;
        const isColA = !!todoCollapsed[key];

        const hdr = document.createElement('div');
        hdr.className = 'todo-acc-header';
        const is = theme.indentSize || 18;
        hdr.style.paddingLeft = projectsMode ? '8px' : (3 * is - 10) + 'px';

        const tog = document.createElement('span');
        tog.className = 'todo-acc-toggle ' + (isColA ? 'closed' : 'open');
        tog.textContent = '▾';
        hdr.appendChild(tog);

        const lbl = document.createElement('span');
        lbl.className = 'todo-acc-label';
        lbl.textContent = acc.text;
        hdr.appendChild(lbl);

        const cnt = document.createElement('span');
        cnt.className = 'todo-count';
        cnt.textContent = items.length;
        hdr.appendChild(cnt);

        const toggleAcc = () => { todoCollapsed[key] = !todoCollapsed[key]; markDirtyUI(); buildTodoPanel(); };
        hdr.addEventListener('click', toggleAcc);
        hdr.addEventListener('contextmenu', e => { e.preventDefault(); toggleAcc(); });
        el.appendChild(hdr);

        if (!isColA) items.forEach(t => {
          const row = document.createElement('div');
          row.className = 'todo-item';
          const is = theme.indentSize || 18;
          row.style.paddingLeft = projectsMode ? (is + 23) + 'px' : (4 * is - 10 + 15) + 'px';

          const txt = document.createElement('span');
          txt.className = 'todo-item-text';
          txt.textContent = t.text;
          row.appendChild(txt);

          const anchor = document.createElement('span');
          anchor.setAttribute('data-anchor', t.id);
          row.appendChild(anchor);

          row.addEventListener('contextmenu', e => {
            e.preventDefault();
            picker?.nodeId === t.id ? advancePicker() : openPicker(t.id, anchor, false);
          });
          row.addEventListener('click', () => revealTodoInMain(t.id));
          el.appendChild(row);
        });
      });
    });
  });

  const shouldRestoreTodoScroll =
    document.body.classList.contains('mobile-view-todo') ||
    (window.visualViewport && window.visualViewport.height < window.innerHeight);
  if (shouldRestoreTodoScroll) el.scrollTop = prevScrollTop;
}
