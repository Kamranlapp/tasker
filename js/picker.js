// ── Status Picker ──────────────────────────────────────────────
function dismissPicker() {
  if (!picker) return;
  clearTimeout(picker.commitTimer);
  picker.el.remove();
  picker = null;
}

function commitPicker() {
  if (!picker) return;
  const { nodeId, pendingStatus, originalStatus } = picker;
  if (picker.commitTimer) clearTimeout(picker.commitTimer);
  picker.el.remove();
  picker = null;
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  if (pendingStatus !== originalStatus) {
    pushUndo();
    node.status = pendingStatus;
    markDirtyTree();
  }
  render();
  buildTodoPanel();
}

function openPicker(nodeId, anchorEl, isMain) {
  if (picker?.nodeId === nodeId) { advancePicker(); return; }
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const order = pickerOrder();
  const idx = order.indexOf(node.status || 'todo');
  const pendingStatus = order[((idx === -1 ? 0 : idx) + 1) % order.length];
  openPickerAtStatus(nodeId, anchorEl, isMain, pendingStatus, true);
}

function openPickerAtStatus(nodeId, anchorEl, isMain, pendingStatus, autoCommit) {
  if (picker) dismissPicker();
  const node = nodes.find(n => n.id === nodeId);
  if (!node || !anchorEl) return;
  const originalStatus = node.status || 'todo';
  const el = buildPickerEl(pendingStatus, isMain);
  anchorEl.appendChild(el);
  picker = {
    nodeId,
    originalStatus,
    pendingStatus,
    el,
    commitTimer: autoCommit ? setTimeout(commitPicker, COMMIT_DELAY) : null,
    isMain
  };
}

function setPickerStatus(pendingStatus, autoCommit) {
  if (!picker) return;
  if (picker.commitTimer) clearTimeout(picker.commitTimer);
  picker.pendingStatus = pendingStatus;
  const order = pickerOrder();
  const cls = picker.isMain ? 'sp-option' : 'tp-option';
  const selCls = picker.isMain ? 'sp-selected' : 'tp-selected';
  picker.el.querySelectorAll('.' + cls).forEach((o, i) => o.classList.toggle(selCls, order[i] === picker.pendingStatus));
  picker.commitTimer = autoCommit ? setTimeout(commitPicker, COMMIT_DELAY) : null;
}

function advancePicker() {
  if (!picker) return;
  const order = pickerOrder();
  const idx = order.indexOf(picker.pendingStatus);
  setPickerStatus(order[((idx === -1 ? 0 : idx) + 1) % order.length], true);
}

function buildPickerEl(pending, isMain) {
  const w = document.createElement('div');
  w.className = isMain ? 'status-picker' : 'todo-picker';
  const optCls = isMain ? 'sp-option' : 'tp-option';
  const selCls = isMain ? 'sp-selected' : 'tp-selected';
  pickerOrder().forEach(s => {
    const o = document.createElement('span');
    o.className = optCls + (s === pending ? ' ' + selCls : '');
    o.textContent = S_ICON[s];
    o.title = S_LABEL[s];
    w.appendChild(o);
  });
  return w;
}
