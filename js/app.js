// ── Login ──────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', doLogin);

function authRedirectTo() {
  return window.location.origin + window.location.pathname;
}

async function doLogin() {
  const btn = document.getElementById('login-btn');
  if (!navigator.onLine) {
    showLoginError('You are offline. Connect once to sign in and enable offline access.');
    return;
  }
  if (!supabaseAuth) {
    showLoginError('Google sign-in could not load. Check your connection and try again.');
    return;
  }
  btn.innerHTML = '<span class="login-spinner"></span>Opening Google…';
  btn.disabled = true;
  try {
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectTo(),
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
  } catch (e) {
    showLoginError('Error: ' + e.message);
    console.error('Login error:', e);
    btn.innerHTML = '<span class="google-mark">G</span>Continue with Google';
    btn.disabled = false;
  }
}

function showLoginError(msg) {
  document.getElementById('login-error').textContent = msg;
}

async function tryAutoLogin() {
  if (!supabaseAuth) return false;
  try {
    const { data, error } = await supabaseAuth.auth.getSession();
    if (error) throw error;
    const authUser = data?.session?.user;
    if (!authUser) return false;
    setOfflineAuthUser(authUser);
    try {
      const ok = await loadAppUserFromGoogle(authUser);
      if (!ok) return false;
      await registerSession();
    } catch (e) {
      if (!currentUser) {
        const cachedUser = await cachedAppUser(authUser);
        if (!cachedUser) throw e;
        currentUser = cachedUser;
        console.warn('Using cached account while offline.');
      } else {
        console.warn('Session registration will retry when the connection returns.', e);
      }
    }
    await loadUserData();
    showApp();
    return true;
  } catch (e) {
    console.error('Auto login failed:', e);
    if (!navigator.onLine) showLoginError('No offline session is available. Connect once to sign in.');
    return false;
  }
}

async function loadAppUserFromGoogle(authUser) {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) {
    showLoginError('Google did not provide an email address.');
    return false;
  }

  let users = await sb.get('users', `?auth_user_id=eq.${authUser.id}&select=id,email,auth_user_id,display_name,role`);
  if (!users.length) {
    users = await sb.get('users', `?email=eq.${encodeURIComponent(email)}&select=id,email,auth_user_id,display_name,role`);
  }
  if (!users.length) {
    await supabaseAuth.auth.signOut();
    showLoginError(`No Task Tracker account is linked to ${email}.`);
    return false;
  }

  const user = users[0];
  if (user.auth_user_id && user.auth_user_id !== authUser.id) {
    await supabaseAuth.auth.signOut();
    showLoginError('This app account is already linked to another Google login.');
    return false;
  }
  if (!user.auth_user_id) {
    const linked = await sb.query('rpc/tasker_link_google_user', 'POST', { target_user_id: user.id });
    if (!linked.length) {
      await supabaseAuth.auth.signOut();
      showLoginError('This Google login could not be linked to the app account.');
      return false;
    }
    currentUser = linked[0];
    return true;
  }
  currentUser = user;
  return true;
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
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (weekCheckTimer) { clearInterval(weekCheckTimer); weekCheckTimer = null; }
  document.getElementById('app').classList.remove('open');
  document.getElementById('settings-screen').classList.remove('open');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-btn').innerHTML = '<span class="google-mark">G</span>Continue with Google';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-error').textContent = '';
}

async function logoutCurrentUser() {
  try {
    await flushSave();
    if (supabaseAuth) await supabaseAuth.auth.signOut();
  } catch (e) {
    console.error('Logout failed:', e);
  }
  showLogin();
}

// ── Global event listeners ─────────────────────────────────────
document.getElementById('settings-back').addEventListener('click', closeSettings);
document.getElementById('save-exit-btn').addEventListener('click', () => { closeSettings(); showSavedToast(); });
document.getElementById('settings-btn').addEventListener('click', openSettings);

document.getElementById('copy-seed-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentUser.email || '');
  const btn = document.getElementById('copy-seed-btn');
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy email', 1500);
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
      logoutCurrentUser();
    } else {
      btn.textContent = `Stay logged in (${count}s)`;
    }
  }, 1000);
});

function showSavedToast(message = 'Saved') {
  let toast = document.getElementById('saved-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'saved-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
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
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js?v=208');
    } catch (e) {
      console.warn('Service worker registration failed:', e);
    }
  }
  const ok = await tryAutoLogin();
  if (!ok) document.getElementById('login-screen').style.display = 'flex';
})();
