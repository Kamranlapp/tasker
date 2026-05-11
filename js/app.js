// ── Login ──────────────────────────────────────────────────────
const wordInputs = Array.from(document.querySelectorAll('.word-input'));

wordInputs.forEach((inp, i) => {
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === '\t') {
      e.preventDefault();
      const next = wordInputs[i + 1];
      if (next) next.focus(); else doLogin();
    }
  });
  inp.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').trim();
    const parts = text.split(/\s+/);
    if (parts.length >= 2) {
      parts.slice(0, 6).forEach((w, j) => { if (wordInputs[i + j]) wordInputs[i + j].value = w; });
    } else {
      inp.value = text;
    }
  });
});

document.getElementById('login-btn').addEventListener('click', doLogin);

async function doLogin() {
  const words = wordInputs.map(i => i.value.trim().toLowerCase()).filter(Boolean);
  if (words.length !== 6) { showLoginError('Please enter all 6 words.'); return; }
  const phrase = words.join(' ');
  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<span class="login-spinner"></span>Signing in…';
  btn.disabled = true;
  wordInputs.forEach(i => i.classList.remove('error'));
  try {
    const users = await sb.get('users', `?seed_phrase=eq.${encodeURIComponent(phrase)}&select=id,seed_phrase,display_name,role`);
    if (!users.length) {
      wordInputs.forEach(i => i.classList.add('error'));
      showLoginError('Phrase not recognised. Check spelling and try again.');
      btn.innerHTML = 'Sign in'; btn.disabled = false;
      return;
    }
    currentUser = users[0];
    localStorage.setItem('session_user_id', currentUser.id);
    localStorage.setItem('session_phrase', phrase);
    await registerSession();
    await loadUserData();
    showApp();
  } catch (e) {
    showLoginError('Error: ' + e.message);
    console.error('Login error:', e);
    btn.innerHTML = 'Sign in'; btn.disabled = false;
  }
}

function showLoginError(msg) {
  document.getElementById('login-error').textContent = msg;
}

async function tryAutoLogin() {
  const uid = localStorage.getItem('session_user_id');
  const phrase = localStorage.getItem('session_phrase');
  if (!uid || !phrase) return false;
  try {
    const users = await sb.get('users', `?id=eq.${uid}&seed_phrase=eq.${encodeURIComponent(phrase)}&select=id,seed_phrase,display_name,role`);
    if (!users.length) return false;
    currentUser = users[0];
    await registerSession();
    await loadUserData();
    showApp();
    return true;
  } catch { return false; }
}

// ── Screen management ──────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('open');
  render();
  maybeShowHints();
}

function showLogin() {
  currentUser = null;
  localStorage.removeItem('session_user_id');
  localStorage.removeItem('session_phrase');
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  document.getElementById('app').classList.remove('open');
  document.getElementById('settings-screen').classList.remove('open');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-btn').innerHTML = 'Sign in';
  document.getElementById('login-btn').disabled = false;
  wordInputs.forEach(i => { i.value = ''; i.classList.remove('error'); });
  document.getElementById('login-error').textContent = '';
}

// ── Global event listeners ─────────────────────────────────────
document.getElementById('settings-back').addEventListener('click', closeSettings);
document.getElementById('save-exit-btn').addEventListener('click', () => { closeSettings(); showSavedToast(); });
document.getElementById('settings-btn').addEventListener('click', openSettings);

document.getElementById('copy-seed-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentUser.seed_phrase);
  const btn = document.getElementById('copy-seed-btn');
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy phrase', 1500);
});

document.getElementById('logout-other-btn').addEventListener('click', async () => {
  try {
    const token = getDeviceToken();
    await sb.query('sessions', 'DELETE', null, `?user_id=eq.${currentUser.id}&device_token=neq.${token}`);
    const btn = document.getElementById('logout-other-btn');
    btn.textContent = 'Done ✓';
    setTimeout(() => btn.textContent = 'Logout other sessions', 2000);
  } catch (e) {
    console.error('Failed to logout other sessions:', e);
  }
});

let logoutTimer = null;
document.getElementById('logout-btn').addEventListener('click', () => {
  const btn = document.getElementById('logout-btn');
  if (logoutTimer) {
    clearInterval(logoutTimer); logoutTimer = null;
    btn.textContent = 'Log out'; btn.className = '';
    return;
  }
  let count = 5;
  btn.textContent = `Stay logged in (${count}s)`;
  btn.className = 'abort';
  logoutTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(logoutTimer); logoutTimer = null;
      showLogin();
    } else {
      btn.textContent = `Stay logged in (${count}s)`;
    }
  }, 1000);
});

function showSavedToast() {
  let toast = document.getElementById('saved-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'saved-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = 'Saved';
  toast.classList.remove('fade-out');
  void toast.offsetWidth;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('transitionend', () => toast.classList.remove('visible', 'fade-out'), { once: true });
  }, 500);
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); redo(); }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); showAllHints(); }
  if (e.key === 'Escape') {
    dismissPicker();
    if (document.getElementById('settings-screen').classList.contains('open')) {
      closeSettings();
      showSavedToast();
    }
  }
});

document.addEventListener('mousedown', e => {
  if (!picker || e.button !== 0) return;
  if (e.target.closest('.status-picker,.todo-picker')) return;
  dismissPicker();
}, true);

window.addEventListener('dragover', e => { if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) e.preventDefault(); });

// ── Mobile tabs ────────────────────────────────────────────────
(function initMobileTabs(){
  const mq = window.matchMedia('(max-width: 768px)');
  const tabTree = document.getElementById('mt-tree');
  const tabTodo = document.getElementById('mt-todo');
  const body = document.body;

  function setView(v){
    body.classList.toggle('mobile-view-tree', v === 'tree');
    body.classList.toggle('mobile-view-todo', v === 'todo');
    tabTree.classList.toggle('active', v === 'tree');
    tabTodo.classList.toggle('active', v === 'todo');
  }
  function applyMQ(){
    if (mq.matches) {
      if (!body.classList.contains('mobile-view-tree') && !body.classList.contains('mobile-view-todo')) {
        setView('tree');
      }
    } else {
      body.classList.remove('mobile-view-tree', 'mobile-view-todo');
    }
  }
  tabTree.addEventListener('click', () => setView('tree'));
  tabTodo.addEventListener('click', () => setView('todo'));
  mq.addEventListener('change', applyMQ);
  applyMQ();
})();

// ── Boot ───────────────────────────────────────────────────────
(async () => {
  const ok = await tryAutoLogin();
  if (!ok) document.getElementById('login-screen').style.display = 'flex';
})();
