// ========================================================================
// 钀屽疂鎴愰暱璁?- 濠村効鍏昏偛涓€浣撳寲璁板綍搴旂敤锛堜簯绔増锛?// 浣跨敤 Supabase 浣滀负浜戠鍚庣锛氬鐢ㄦ埛鍏变韩 + 閭€璇风爜鏈哄埗
// ========================================================================

(function () {
  'use strict';

  // ========== Supabase 鍒濆鍖?==========
  const SUPABASE_URL = window.SUPABASE_CONFIG?.url;
  const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ========== 鏈湴鐘舵€?==========
  let currentUser = null;     // { id, email }
  let currentFamily = null;   // { id, name, invite_code }
  let currentProfile = null;  // { id, family_id, username, display_name, role }
  let babies = [];            // currentFamily 涓殑瀹濆疂
  let records = {};           // { [babyId]: { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] } }
  let syncState = 'synced';   // synced | syncing | offline

  // 鎸佷箙鍖栫殑娲昏穬瀹濆疂閫夋嫨
  function getCurrentBabyId() {
    return localStorage.getItem('currentBabyId_' + currentFamily?.id);
  }
  function setCurrentBabyId(id) {
    if (currentFamily) localStorage.setItem('currentBabyId_' + currentFamily.id, id);
  }
  let currentBabyId = null;

  // ========== 宸ュ叿鍑芥暟 ==========
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function $ (sel) { return document.querySelector(sel); }
  function $$ (sel) { return document.querySelectorAll(sel); }

  function fmtDate(d) {
    const dt = new Date(d);
    const pad = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  function fmtDateShort(d) {
    const dt = new Date(d);
    const pad = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  }
  function fmtTime(d) {
    const dt = new Date(d);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  function ageInMonths(birthDate) {
    if (!birthDate) return 0;
    return (Date.now() - new Date(birthDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  }
  function ageText(birthDate) {
    if (!birthDate) return '鏈缃敓鏃?;
    const months = ageInMonths(birthDate);
    if (months < 1) return Math.floor((Date.now() - new Date(birthDate).getTime()) / 86400000) + ' 澶?;
    if (months < 24) return Math.floor(months) + ' 鏈? + Math.floor((months % 1) * 30) + ' 澶?;
    const years = Math.floor(months / 12);
    const restMonths = Math.floor(months % 12);
    return years + ' 宀? + (restMonths ? ' ' + restMonths + ' 鏈? : '');
  }
  function todayStart() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }
  function isToday(ts) { return ts >= todayStart(); }
  function datetimeLocalValue() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function showToast(msg, duration = 2000) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.hidden = true, duration);
  }
  function setSyncState(s, msg) {
    syncState = s;
    const el = $('#syncIndicator');
    if (!el) return;
    el.hidden = false;
    el.className = 'sync-indicator ' + s;
    $('#syncText').textContent = msg || (s === 'synced' ? '鉁?宸插悓姝? : s === 'syncing' ? '鉄?鍚屾涓? : '鈿?绂荤嚎');
  }

  // ========== 妯℃€佹 ==========
  function openModal(html, opts = {}) {
    const container = $('#modalContainer');
    container.innerHTML = `<div class="modal-overlay" data-mask><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    if (!opts.persist) {
      container.querySelector('[data-mask]').addEventListener('click', e => {
        if (e.target.matches('[data-mask]')) closeModal();
      });
    }
  }
  function closeModal() { $('#modalContainer').innerHTML = ''; }

  // ========== 瑙嗗浘鍒囨崲 ==========
  function switchView(viewName) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = $('#view-' + viewName);
    if (view) view.classList.add('active');
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onViewEnter(viewName);
  }
  function onViewEnter(viewName) {
    switch (viewName) {
      case 'dashboard': renderDashboard(); break;
      case 'feeding': renderFeeding(); break;
      case 'vaccines': renderVaccines('upcoming'); break;
      case 'diapers': renderDiapers(); break;
      case 'sleep': renderSleep(); break;
      case 'growth': renderGrowth(); break;
      case 'milestones': renderMilestones(); break;
    }
  }

  // ========== 鏁版嵁灞?==========
  function getCurrentBaby() {
    currentBabyId = getCurrentBabyId() || babies[0]?.id;
    return babies.find(b => b.id === currentBabyId) || babies[0];
  }
  function getCurrentRecords() {
    const baby = getCurrentBaby();
    if (!baby) return null;
    if (!records[baby.id]) {
      records[baby.id] = { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] };
    }
    return records[baby.id];
  }

  // 浠庝簯绔姞杞芥墍鏈夋暟鎹?  async function loadFamilyData() {
    setSyncState('syncing', '鉄?鍔犺浇鏁版嵁');
    try {
      // 鍔犺浇 profile
      const { data: profileData } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
      currentProfile = profileData;

      // 鍔犺浇 family
      const { data: familyData } = await sb.from('families').select('*').eq('id', currentProfile.family_id).single();
      currentFamily = familyData;

      // 鍔犺浇 babies
      const { data: babyList } = await sb.from('babies').select('*').order('created_at', { ascending: true });
      babies = babyList || [];

      // 鍔犺浇鎵€鏈?records
      const { data: recList } = await sb.from('records').select('*').eq('family_id', currentFamily.id).order('created_at', { ascending: false });
      records = {};
      babies.forEach(b => {
        records[b.id] = { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] };
      });
      (recList || []).forEach(r => {
        if (!records[r.baby_id]) records[r.baby_id] = { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] };
        const rec = { ...r.data, _id: r.id, _createdAt: r.created_at, _createdBy: r.created_by, _updatedAt: r.updated_at };
        if (r.type === 'vaccine') {
          records[r.baby_id].vaccine[r.data.vaccineId] = rec;
        } else if (records[r.baby_id][r.type]) {
          records[r.baby_id][r.type].push(rec);
        }
      });

      setSyncState('synced');
    } catch (err) {
      console.error('鍔犺浇鏁版嵁澶辫触', err);
      setSyncState('offline');
      showToast('鍔犺浇鏁版嵁澶辫触锛? + err.message);
    }
  }

  // 娣诲姞瀹濆疂
  async function addBaby(data) {
    setSyncState('syncing');
    try {
      const { data: row, error } = await sb.from('babies').insert({
        family_id: currentFamily.id,
        name: data.name,
        birth_date: data.birthDate,
        gender: data.gender,
        avatar: data.avatar,
        created_by: currentUser.id
      }).select().single();
      if (error) throw error;
      babies.push(row);
      records[row.id] = { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] };
      setSyncState('synced');
      return row;
    } catch (err) {
      setSyncState('offline');
      showToast('娣诲姞澶辫触锛? + err.message);
      throw err;
    }
  }

  async function updateBaby(babyId, data) {
    setSyncState('syncing');
    try {
      const { error } = await sb.from('babies').update({
        name: data.name,
        birth_date: data.birthDate,
        gender: data.gender,
        avatar: data.avatar,
        updated_at: new Date().toISOString()
      }).eq('id', babyId);
      if (error) throw error;
      const b = babies.find(x => x.id === babyId);
      if (b) Object.assign(b, { name: data.name, birth_date: data.birthDate, gender: data.gender, avatar: data.avatar });
      setSyncState('synced');
    } catch (err) {
      setSyncState('offline');
      showToast('鏇存柊澶辫触锛? + err.message);
    }
  }

  async function deleteBaby(babyId) {
    setSyncState('syncing');
    try {
      const { error } = await sb.from('babies').delete().eq('id', babyId);
      if (error) throw error;
      babies = babies.filter(b => b.id !== babyId);
      delete records[babyId];
      setSyncState('synced');
    } catch (err) {
      setSyncState('offline');
      showToast('鍒犻櫎澶辫触锛? + err.message);
    }
  }

  // 娣诲姞璁板綍锛堥€氱敤锛?  async function addRecord(type, data) {
    const baby = getCurrentBaby();
    if (!baby) return;
    setSyncState('syncing');
    try {
      // 鏈湴鏃堕棿鎴?      const localTs = data.type || Date.now();
      const insertData = {
        family_id: currentFamily.id,
        baby_id: baby.id,
        type: type,
        data: { ...data, time: localTs, id: uid() }, // keep local id for ref
        created_by: currentUser.id
      };
      const { data: row, error } = await sb.from('records').insert(insertData).select().single();
      if (error) throw error;
      const rec = { ...data, _id: row.id, _createdAt: row.created_at, _createdBy: row.created_by, _updatedAt: row.updated_at };
      if (type === 'vaccine') {
        // vaccine: data 鍖呭惈 vaccineId
        if (!records[baby.id].vaccine) records[baby.id].vaccine = {};
        records[baby.id].vaccine[data.vaccineId] = rec;
      } else {
        if (!records[baby.id][type]) records[baby.id][type] = [];
        records[baby.id][type].push(rec);
      }
      setSyncState('synced');
    } catch (err) {
      setSyncState('offline');
      showToast('淇濆瓨澶辫触锛? + err.message);
    }
  }

  async function deleteRecord(recordId, type, vaccineId) {
    const baby = getCurrentBaby();
    if (!baby) return;
    setSyncState('syncing');
    try {
      const { error } = await sb.from('records').delete().eq('id', recordId);
      if (error) throw error;
      if (type === 'vaccine') {
        delete records[baby.id].vaccine[vaccineId];
      } else {
        records[baby.id][type] = records[baby.id][type].filter(r => r._id !== recordId);
      }
      setSyncState('synced');
    } catch (err) {
      setSyncState('offline');
      showToast('鍒犻櫎澶辫触锛? + err.message);
    }
  }

  // ========== 璁よ瘉锛氱櫥褰?/ 娉ㄥ唽 / 鍔犲叆瀹跺涵 ==========
  function showAuthError(msg) {
    const el = $('#authError');
    el.textContent = msg;
    el.hidden = false;
  }
  function clearAuthError() { $('#authError').hidden = true; }

  async function handleLogin() {
    clearAuthError();
    const username = $('#loginUsername').value.trim();
    const password = $('#loginPassword').value;
    if (!username || !password) return showAuthError('璇疯緭鍏ョ敤鎴峰悕鍜屽瘑鐮?);
    const email = username + '@mengbao.app';
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      // 鐢ㄦ埛涓嶅瓨鍦ㄥ垯鎻愮ず鍘绘敞鍐?      return showAuthError('鐧诲綍澶辫触锛? + (error.message.includes('Invalid') ? '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' : error.message));
    }
    currentUser = data.user;
    await loadFamilyData();
    onLoginSuccess();
  }

  async function handleCreateFamily() {
    clearAuthError();
    const familyName = $('#createFamilyName').value.trim();
    const username = $('#createUsername').value.trim();
    const displayName = $('#createDisplayName').value.trim();
    const password = $('#createPassword').value;
    if (!familyName || !username || !displayName) return showAuthError('璇峰～鍐欐墍鏈夊瓧娈?);
    if (password.length < 6) return showAuthError('瀵嗙爜鑷冲皯 6 浣?);
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showAuthError('鐢ㄦ埛鍚嶅彧鑳藉寘鍚瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎');
    try {
      const email = username + '@mengbao.app';
      // 1. 娉ㄥ唽 auth 鐢ㄦ埛
      const { data: signData, error: signErr } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username, display_name: displayName } }
      });
      if (signErr) throw signErr;
      currentUser = signData.user;
      // 2. 鍒涘缓 family
      const { data: famData, error: famErr } = await sb.from('families').insert({
        name: familyName,
        created_by: currentUser.id
      }).select().single();
      if (famErr) throw famErr;
      currentFamily = famData;
      // 3. 鎶?admin 鏍囪涓虹鐞嗗憳
      const { error: profErr } = await sb.from('profiles').update({
        family_id: famData.id,
        role: 'admin',
        display_name: displayName
      }).eq('id', currentUser.id);
      if (profErr) throw profErr;
      await loadFamilyData();
      showToast('瀹跺涵鍒涘缓鎴愬姛 馃帀 閭€璇风爜锛? + famData.invite_code);
      onLoginSuccess();
    } catch (err) {
      showAuthError('鍒涘缓澶辫触锛? + err.message);
    }
  }

  async function handleJoinFamily() {
    clearAuthError();
    const code = $('#joinCode').value.trim().toUpperCase();
    const username = $('#joinUsername').value.trim();
    const displayName = $('#joinDisplayName').value.trim() || username;
    const password = $('#joinPassword').value;
    if (!code || !username || !password) return showAuthError('璇峰～鍐欓個璇风爜銆佺敤鎴峰悕銆佸瘑鐮?);
    if (password.length < 6) return showAuthError('瀵嗙爜鑷冲皯 6 浣?);
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showAuthError('鐢ㄦ埛鍚嶅彧鑳藉寘鍚瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎');
    try {
      // 1. 鏌ユ壘瀹跺涵
      const { data: famData, error: famErr } = await sb.from('families').select('*').eq('invite_code', code).single();
      if (famErr || !famData) return showAuthError('閭€璇风爜涓嶆纭?);
      // 2. 娉ㄥ唽 auth 鐢ㄦ埛
      const email = username + '@mengbao.app';
      const { data: signData, error: signErr } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username, display_name: displayName } }
      });
      if (signErr) {
        if (signErr.message.includes('already registered')) return showAuthError('鐢ㄦ埛鍚嶅凡琚崰鐢紝璇锋崲涓€涓?);
        throw signErr;
      }
      currentUser = signData.user;
      currentFamily = famData;
      // 3. 鍔犲叆瀹跺涵
      const { error: profErr } = await sb.from('profiles').update({
        family_id: famData.id,
        role: 'member',
        display_name: displayName
      }).eq('id', currentUser.id);
      if (profErr) throw profErr;
      await loadFamilyData();
      showToast('鍔犲叆鎴愬姛 馃帀 娆㈣繋鏉ュ埌 ' + famData.name);
      onLoginSuccess();
    } catch (err) {
      showAuthError('鍔犲叆澶辫触锛? + err.message);
    }
  }

  async function handleLogout() {
    if (!confirm('纭畾瑕侀€€鍑虹櫥褰曞悧锛?)) return;
    await sb.auth.signOut();
    currentUser = null;
    currentFamily = null;
    currentProfile = null;
    babies = [];
    records = {};
    $('#app').hidden = true;
    $('#appHeader').hidden = true;
    $('#bottomNav').hidden = true;
    $('#authScreen').hidden = false;
    showAuthScreen();
  }

  function onLoginSuccess() {
    $('#authScreen').hidden = true;
    $('#app').hidden = false;
    $('#appHeader').hidden = false;
    $('#bottomNav').hidden = false;
    refreshHeader();
    switchView('dashboard');
  }

  function showAuthScreen() {
    $$('.auth-tab').forEach(t => t.classList.remove('active'));
    $$('.auth-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.auth-tab[data-auth-tab="login"]').classList.add('active');
    document.querySelector('.auth-panel[data-auth-panel="login"]').classList.add('active');
    clearAuthError();
  }

  // 鍚姩鏃舵鏌ョ櫥褰曠姸鎬?  async function checkSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadFamilyData();
      if (currentFamily) {
        onLoginSuccess();
        return;
      }
    }
    $('#authScreen').hidden = false;
  }

  // ========== 瀹濆疂绠＄悊 ==========
  function openAddBaby() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">娣诲姞瀹濆疂</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">瀹濆疂鏄电О *</label>
          <input class="form-input" id="babyNameInput" placeholder="渚嬪锛氬皬妗? />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">鎬у埆</label>
            <div class="segmented" data-seg="gender">
              <button class="active" data-val="female">馃懅 濂?/button>
              <button data-val="male">馃懄 鐢?/button>
              <button data-val="other">馃専 鍏朵粬</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">鍑虹敓鏃ユ湡 *</label>
            <input class="form-input" type="date" id="babyBirthInput" max="${fmtDateShort(new Date())}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">澶村儚 Emoji</label>
          <input class="form-input" id="babyAvatarInput" placeholder="馃懚" value="馃懚" maxlength="4" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelectorAll('[data-seg="gender"] button').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('[data-seg="gender"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const name = modal.querySelector('#babyNameInput').value.trim();
      const birth = modal.querySelector('#babyBirthInput').value;
      const avatar = modal.querySelector('#babyAvatarInput').value.trim() || '馃懚';
      const gender = modal.querySelector('[data-seg="gender"] button.active').dataset.val;
      if (!name) return showToast('璇疯緭鍏ュ疂瀹濇樀绉?);
      if (!birth) return showToast('璇烽€夋嫨鍑虹敓鏃ユ湡');
      await addBaby({ name, birthDate: birth, avatar, gender });
      closeModal();
      showToast('娆㈣繋 ' + avatar + ' ' + name);
      refreshHeader();
      renderDashboard();
    });
  }

  function openBabySwitcher() {
    if (babies.length === 0) return openAddBaby();
    const list = babies.map(b => `
      <div class="baby-item ${b.id === currentBabyId ? 'current' : ''}" data-baby-id="${b.id}">
        <div class="baby-icon">${b.avatar || '馃懚'}</div>
        <div class="baby-info">
          <div class="baby-name">${escapeHtml(b.name)}</div>
          <div class="baby-age">${ageText(b.birth_date)} 路 ${b.gender === 'male' ? '鐢? : b.gender === 'female' ? '濂? : ''}</div>
        </div>
        <button data-edit-id="${b.id}" style="font-size:18px;">鉁忥笍</button>
        <button data-add-baby style="margin-top:8px;">+ 娣诲姞鏂板疂瀹?/button>
      </div>
    `).join('');

    openModal(`
      <div class="modal-header">
        <span class="modal-title">閫夋嫨瀹濆疂</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="baby-list">${list}</div>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelectorAll('[data-baby-id]').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('[data-edit-id]')) return;
        currentBabyId = item.dataset.babyId;
        setCurrentBabyId(currentBabyId);
        closeModal();
        refreshHeader();
        renderDashboard();
      });
    });
    modal.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openEditBaby(btn.dataset.editId); });
    });
    modal.querySelector('[data-add-baby]').addEventListener('click', () => { closeModal(); openAddBaby(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  function openEditBaby(babyId) {
    const baby = babies.find(b => b.id === babyId);
    if (!baby) return;
    openModal(`
      <div class="modal-header">
        <span class="modal-title">缂栬緫瀹濆疂</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">瀹濆疂鏄电О *</label>
          <input class="form-input" id="babyNameInput" value="${escapeHtml(baby.name)}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">鎬у埆</label>
            <div class="segmented" data-seg="gender">
              <button class="${baby.gender === 'female' ? 'active' : ''}" data-val="female">馃懅 濂?/button>
              <button class="${baby.gender === 'male' ? 'active' : ''}" data-val="male">馃懄 鐢?/button>
              <button class="${baby.gender === 'other' ? 'active' : ''}" data-val="other">馃専 鍏朵粬</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">鍑虹敓鏃ユ湡 *</label>
            <input class="form-input" type="date" id="babyBirthInput" value="${baby.birth_date}" max="${fmtDateShort(new Date())}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">澶村儚 Emoji</label>
          <input class="form-input" id="babyAvatarInput" value="${escapeHtml(baby.avatar || '馃懚')}" maxlength="4" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="delete" style="background:#FFE5E5;color:#FF6B6B;">鍒犻櫎</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelectorAll('[data-seg="gender"] button').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('[data-seg="gender"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const data = {
        name: modal.querySelector('#babyNameInput').value.trim(),
        birthDate: modal.querySelector('#babyBirthInput').value,
        avatar: modal.querySelector('#babyAvatarInput').value.trim() || '馃懚',
        gender: modal.querySelector('[data-seg="gender"] button.active').dataset.val,
      };
      if (!data.name) return showToast('璇疯緭鍏ュ疂瀹濇樀绉?);
      await updateBaby(babyId, data);
      closeModal();
      showToast('宸叉洿鏂?);
      refreshHeader();
      renderDashboard();
    });
    modal.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('纭畾瑕佸垹闄?' + baby.name + ' 鍙婃墍鏈夋暟鎹悧锛熸鎿嶄綔涓嶅彲鎭㈠銆?)) return;
      await deleteBaby(babyId);
      currentBabyId = babies[0]?.id || null;
      if (currentBabyId) setCurrentBabyId(currentBabyId);
      closeModal();
      refreshHeader();
      renderDashboard();
      showToast('宸插垹闄?);
    });
  }

  function refreshHeader() {
    const baby = getCurrentBaby();
    if (!baby) {
      $('#currentBabyAvatar').textContent = '馃懚';
      $('#babySubtitle').textContent = '娣诲姞瀹濆疂寮€濮嬭褰?;
      return;
    }
    $('#currentBabyAvatar').textContent = baby.avatar || '馃懚';
    $('#babySubtitle').textContent = `${baby.name} 路 ${ageText(baby.birth_date)}`;
    if (currentProfile?.display_name) {
      $('#appTitle').textContent = '钀屽疂路' + currentProfile.display_name;
    }
  }

  // ========== 浠〃鏉?==========
  function renderDashboard() {
    if (babies.length === 0) {
      $('#greeting').textContent = '娆㈣繋浣跨敤钀屽疂鎴愰暱璁?馃憢';
      $('#todayDate').textContent = '';
      $('#quickStats').innerHTML = '';
      $('#dashboardReminders').innerHTML = '<div class="empty-hint">鍏堟坊鍔犲疂瀹濆紑濮嬭褰?/div>';
      $('#recentRecords').innerHTML = '';
      return;
    }
    const baby = getCurrentBaby();
    const h = new Date().getHours();
    let greeting = '鏃╀笂濂?鈽€锔?;
    if (h >= 11 && h < 14) greeting = '涓崍濂?馃尀';
    else if (h >= 14 && h < 18) greeting = '涓嬪崍濂?馃尋锔?;
    else if (h >= 18 && h < 22) greeting = '鏅氫笂濂?馃寵';
    else if (h >= 22 || h < 6) greeting = '澶滄繁浜?馃寷';
    $('#greeting').textContent = greeting + '锛? + baby.name;
    const week = ['鏃?, '涓€', '浜?, '涓?, '鍥?, '浜?, '鍏?][new Date().getDay()];
    $('#todayDate').textContent = `${fmtDateShort(new Date())} 鍛?{week}`;

    const rec = records[baby.id] || {};
    const ts = todayStart();
    const todayFeedings = (rec.feeding || []).filter(r => (r.time || 0) >= ttsOfBaby(baby, ts));
    const todayDiapers = (rec.diaper || []).filter(r => (r.time || 0) >= ts);
    const todaySleeps = (rec.sleep || []).filter(r => (r.startTime || 0) >= ts);
    let sleepMin = 0;
    todaySleeps.forEach(s => {
      if (s.endTime) sleepMin += (s.endTime - s.startTime) / 60000;
      else if (s.startTime > ts) sleepMin += (Date.now() - s.startTime) / 60000;
    });
    const upcomingVaccines = computeVaccineSchedule().filter(v => !v.completed && !v.overdue).length;
    const overdueVaccines = computeVaccineSchedule().filter(v => v.overdue).length;

    $('#statFeeding').textContent = todayFeedings.length;
    $('#statDiaper').textContent = todayDiapers.length;
    $('#statSleep').textContent = Math.floor(sleepMin / 60) + 'h' + Math.floor(sleepMin % 60) + 'm';
    $('#statVaccine').textContent = upcomingVaccines + overdueVaccines;

    renderDashboardReminders();
    renderRecentRecords();
  }

  function ttsOfBaby(baby, ts) {
    return ts; // simplified
  }

  function renderDashboardReminders() {
    const upcoming = computeVaccineSchedule().filter(v => !v.completed).sort((a, b) => a.scheduledDate - b.scheduledDate).slice(0, 4);
    const overdue = upcoming.filter(v => v.overdue);
    const list = $('#dashboardReminders');
    if (overdue.length + upcoming.length === 0) {
      list.innerHTML = '<div class="empty-hint">鏆傛棤寰呭姙鎻愰啋</div>';
      $('#reminderBadge').hidden = true;
      return;
    }
    const items = overdue.concat(upcoming.slice(0, 4)).slice(0, 4).map(v => {
      const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
      let meta;
      if (v.completed) meta = '鉁?宸叉帴绉?;
      else if (v.overdue) meta = `閫炬湡 ${-days} 澶ー;
      else if (days === 0) meta = '鈴?浠婂ぉ鎺ョ';
      else meta = `杩樻湁 ${days} 澶ー;
      const cls = v.completed ? '' : v.overdue ? 'overdue' : (days <= 7 ? 'due' : '');
      return `<div class="reminder-item ${cls}" data-vaccine-id="${v.id}">
        <div class="item-icon">馃拤</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(v.name)} 路 ${escapeHtml(v.dose)}</div>
          <div class="item-meta">${fmtDateShort(v.scheduledDate)} 路 ${meta}</div>
        </div>
        <span class="item-arrow">鈥?/span>
      </div>`;
    }).join('');
    list.innerHTML = items;
    list.querySelectorAll('[data-vaccine-id]').forEach(item => item.addEventListener('click', () => switchView('vaccines')));
    const pending = overdue.length + upcoming.filter(v => !v.completed).length;
    if (pending > 0) { $('#reminderBadge').textContent = pending; $('#reminderBadge').hidden = false; }
    else $('#reminderBadge').hidden = true;
  }

  function renderRecentRecords() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const ts = todayStart();
    const all = [];
    (rec.feeding || []).forEach(r => all.push({ ...r, _type: 'feeding' }));
    (rec.diaper || []).forEach(r => all.push({ ...r, _type: 'diaper' }));
    (rec.sleep || []).forEach(r => all.push({ ...r, _type: 'sleep' }));
    const today = all.filter(r => (r.time || r.startTime) >= ts).sort((a, b) => (b.time || b.startTime) - (a.time || a.startTime)).slice(0, 6);

    const list = $('#recentRecords');
    if (today.length === 0) {
      list.innerHTML = '<div class="empty-hint">浠婂ぉ杩樻病鏈夎褰?/div>';
      return;
    }
    list.innerHTML = today.map(r => {
      if (r._type === 'feeding') {
        const icon = r.feedingType === 'breast' ? '馃け' : r.feedingType === 'formula' ? '馃嵓' : '馃崥';
        const typeLabel = r.feedingType === 'breast' ? `姣嶄钩 路 ${r.duration || 0}鍒嗛挓` : r.feedingType === 'formula' ? `閰嶆柟濂?路 ${r.amount}ml` : `杈呴`;
        return `<div class="recent-item">
          <div class="item-icon">${icon}</div>
          <div class="item-body">
            <div class="item-title">${typeLabel}</div>
            <div class="item-meta">${fmtTime(r.time)} 路 ${memberName(r._createdBy)}</div>
          </div>
        </div>`;
      } else if (r._type === 'diaper') {
        const icon = r.diaperType === 'wet' ? '馃挧' : r.diaperType === 'dirty' ? '馃挬' : '馃攧';
        const typeLabel = r.diaperType === 'wet' ? '灏忎究' : r.diaperType === 'dirty' ? '澶т究' : '娣峰悎';
        return `<div class="recent-item">
          <div class="item-icon">${icon}</div>
          <div class="item-body">
            <div class="item-title">鎹㈠翱甯?路 ${typeLabel}</div>
            <div class="item-meta">${fmtTime(r.time)} 路 ${memberName(r._createdBy)}</div>
          </div>
        </div>`;
      } else if (r._type === 'sleep') {
        const dur = r.endTime ? Math.round((r.endTime - r.startTime) / 60000) : null;
        return `<div class="recent-item">
          <div class="item-icon">馃槾</div>
          <div class="item-body">
            <div class="item-title">${dur != null ? `鐫′簡 ${Math.floor(dur/60)}h${dur%60}m` : '鍏ョ潯涓?}</div>
            <div class="item-meta">${fmtTime(r.startTime)} 路 ${memberName(r._createdBy)}</div>
          </div>
        </div>`;
      }
    }).join('');
  }

  // 绠€鍗曠敤鎴峰悕缂撳瓨
  const memberCache = {};
  function memberName(uid) {
    if (!uid) return '';
    if (memberCache[uid]) return memberCache[uid];
    // 榛樿鍗犱綅
    memberCache[uid] = '瀹朵汉';
    // 寮傛鎷夊彇
    sb.from('profiles').select('username, display_name').eq('id', uid).single().then(({ data }) => {
      if (data) memberCache[uid] = data.display_name || data.username;
      // 閲嶆柊娓叉煋褰撳墠瑙嗗浘锛堜粎褰?dashboard锛?      if ($('#view-dashboard').classList.contains('active')) renderRecentRecords();
    });
    return memberCache[uid];
  }

  // ========== 鍠傚吇 ==========
  let feedingTimer = null;
  let feedingTimerStart = 0;
  let feedingTimerSide = 'left';
  let timerTickInterval = null;

  function startTimerTick() {
    clearInterval(timerTickInterval);
    timerTickInterval = setInterval(() => {
      const display = document.querySelector('.timer-display');
      if (!display || !feedingTimer) { clearInterval(timerTickInterval); return; }
      const elapsed = Math.floor((Date.now() - feedingTimerStart) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      display.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }, 1000);
  }

  function renderFeeding() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.feeding || []).slice().sort((a, b) => (b.time || 0) - (a.time || 0));
    const container = $('#feedingList');

    let timerHtml = '';
    if (feedingTimer) {
      const elapsed = Math.floor((Date.now() - feedingTimerStart) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      timerHtml = `<div class="timer-bar">
        <div>
          <div style="font-size:12px;color:#888;">姣嶄钩璁℃椂涓?路 ${feedingTimerSide === 'left' ? '宸︿晶' : '鍙充晶'}</div>
          <div class="timer-display">${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}</div>
        </div>
        <div class="timer-controls">
          <button class="timer-reset-btn" data-side-switch>鎹㈣竟</button>
          <button class="timer-stop-btn" data-stop>鍋滄</button>
        </div>
      </div>`;
    } else {
      timerHtml = `<div class="timer-bar">
        <div>
          <div style="font-size:12px;color:#888;">姣嶄钩璁℃椂</div>
          <div class="timer-display" style="font-size:16px;color:#888;">鐐瑰嚮寮€濮?/div>
        </div>
        <div class="timer-controls">
          <button class="timer-start-btn" data-start-bf="left">宸︿晶寮€濮?/button>
          <button class="timer-start-btn" data-start-bf="right">鍙充晶寮€濮?/button>
        </div>
      </div>`;
    }

    const listHtml = list.length === 0
      ? '<div class="empty-hint">杩樻病鏈夊杺鍏昏褰?/div>'
      : list.map(r => {
          let typeLabel, icon;
          if (r.feedingType === 'breast') {
            icon = '馃け';
            typeLabel = `姣嶄钩 路 ${r.duration || 0}鍒嗛挓 路 ${r.side === 'left' ? '宸? : r.side === 'right' ? '鍙? : '鍙?}`;
          } else if (r.feedingType === 'formula') {
            icon = '馃嵓';
            typeLabel = `閰嶆柟濂?路 ${r.amount}ml`;
          } else {
            icon = '馃崥';
            typeLabel = `杈呴 路 ${escapeHtml(r.food || '')}`;
          }
          return `<div class="record-card feeding">
            <div class="record-icon">${icon}</div>
            <div class="record-body">
              <div class="record-title">${typeLabel} <span style="font-size:12px;color:#999;font-weight:400;">路 ${memberName(r._createdBy)}</span></div>
              <div class="record-meta">${fmtDate(r.time)}</div>
              ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
              <div class="record-actions"><button data-del-feed="${r._id}">鍒犻櫎</button></div>
            </div>
          </div>`;
        }).join('');

    container.innerHTML = timerHtml + listHtml;
    const timerBar = container.querySelector('.timer-bar');
    if (feedingTimer) {
      timerBar.querySelector('[data-side-switch]').addEventListener('click', () => {
        const dur = Math.floor((Date.now() - feedingTimerStart) / 60000);
        addRecord('feeding', { feedingType: 'breast', time: feedingTimerStart, duration: dur, side: feedingTimerSide, notes: '' });
        feedingTimerSide = feedingTimerSide === 'left' ? 'right' : 'left';
        feedingTimerStart = Date.now();
        showToast(`宸蹭繚瀛?${dur} 鍒嗛挓 路 鍒囨崲鍒?{feedingTimerSide === 'left' ? '宸? : '鍙?}渚);
        renderFeeding();
        startTimerTick();
      });
      timerBar.querySelector('[data-stop]').addEventListener('click', () => {
        const dur = Math.floor((Date.now() - feedingTimerStart) / 60000);
        addRecord('feeding', { feedingType: 'breast', time: feedingTimerStart, duration: dur, side: feedingTimerSide, notes: '' });
        clearInterval(feedingTimer);
        feedingTimer = null;
        showToast(`宸蹭繚瀛?${dur} 鍒嗛挓`);
        renderFeeding();
      });
    } else {
      timerBar.querySelectorAll('[data-start-bf]').forEach(btn => {
        btn.addEventListener('click', () => {
          feedingTimer = true;
          feedingTimerStart = Date.now();
          feedingTimerSide = btn.dataset.startBf;
          renderFeeding();
          startTimerTick();
        });
      });
    }
    container.querySelectorAll('[data-del-feed]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('纭畾鍒犻櫎锛?)) return;
        await deleteRecord(btn.dataset.delFeed, 'feeding');
        renderFeeding();
      });
    });
  }

  function openFeedingModal() {
    if (babies.length === 0) return openAddBaby();
    let currentType = 'breast';
    openModal(`
      <div class="modal-header">
        <span class="modal-title">娣诲姞鍠傚吇璁板綍</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">绫诲瀷</label>
          <div class="segmented" data-seg="type">
            <button class="active" data-val="breast">馃け 姣嶄钩</button>
            <button data-val="formula">馃嵓 閰嶆柟濂?/button>
            <button data-val="solid">馃崥 杈呴</button>
          </div>
        </div>
        <div id="feedFields"></div>
        <div class="form-group">
          <label class="form-label">鏃堕棿</label>
          <input class="form-input" type="datetime-local" id="feedTime" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">澶囨敞</label>
          <textarea class="form-textarea" id="feedNotes" placeholder="鍙€?></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelectorAll('[data-seg="type"] button').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('[data-seg="type"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentType = btn.dataset.val;
        renderFeedFields();
      });
    });
    function renderFeedFields() {
      const fields = modal.querySelector('#feedFields');
      if (currentType === 'breast') {
        fields.innerHTML = `<div class="form-row">
          <div class="form-group"><label class="form-label">鏃堕暱锛堝垎閽燂級</label><input class="form-input" type="number" id="feedDuration" min="1" max="60" value="15" /></div>
          <div class="form-group"><label class="form-label">渚у埆</label>
            <div class="segmented" data-seg="side"><button class="active" data-val="left">宸?/button><button data-val="right">鍙?/button><button data-val="both">鍙?/button></div>
          </div></div>`;
        fields.querySelectorAll('[data-seg="side"] button').forEach(b => {
          b.addEventListener('click', () => {
            fields.querySelectorAll('[data-seg="side"] button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
          });
        });
      } else if (currentType === 'formula') {
        fields.innerHTML = `<div class="form-group"><label class="form-label">濂堕噺 (ml)</label><input class="form-input" type="number" id="feedAmount" min="10" max="500" step="10" value="120" /></div>`;
      } else {
        fields.innerHTML = `<div class="form-group"><label class="form-label">椋熺墿</label><input class="form-input" id="feedFood" placeholder="绫崇硦銆佽嫻鏋滄偿" /></div>`;
      }
    }
    renderFeedFields();
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const time = new Date(modal.querySelector('#feedTime').value).getTime();
      const notes = modal.querySelector('#feedNotes').value.trim();
      const data = { feedingType: currentType, time, notes };
      if (currentType === 'breast') {
        data.duration = parseInt(modal.querySelector('#feedDuration').value) || 0;
        data.side = modal.querySelector('[data-seg="side"] button.active').dataset.val;
      } else if (currentType === 'formula') {
        data.amount = parseInt(modal.querySelector('#feedAmount').value) || 0;
      } else {
        data.food = modal.querySelector('#feedFood').value.trim();
      }
      await addRecord('feeding', data);
      closeModal();
      showToast('宸茶褰?);
      if ($('#view-feeding').classList.contains('active')) renderFeeding();
    });
  }

  // ========== 鐤嫍 ==========
  function computeVaccineSchedule() {
    const baby = getCurrentBaby();
    if (!baby) return [];
    const rec = records[baby.id] || {};
    const birth = new Date(baby.birth_date);
    return window.VACCINE_SCHEDULE.map(v => {
      const scheduled = new Date(birth);
      scheduled.setMonth(scheduled.getMonth() + v.monthsFromBirth);
      const completed = rec.vaccine ? rec.vaccine[v.id] : null;
      const scheduledDate = scheduled.getTime();
      const daysUntil = Math.ceil((scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        ...v,
        scheduledDate,
        overdue: !completed && scheduledDate < Date.now(),
        completed: !!completed,
        completedData: completed,
        daysUntil
      };
    });
  }

  let currentVaccineTab = 'upcoming';

  function renderVaccines(tab) {
    if (tab) currentVaccineTab = tab;
    const all = computeVaccineSchedule();
    let filtered;
    if (currentVaccineTab === 'upcoming') filtered = all.filter(v => !v.completed && !v.overdue).sort((a, b) => a.scheduledDate - b.scheduledDate);
    else if (currentVaccineTab === 'overdue') filtered = all.filter(v => v.overdue).sort((a, b) => a.scheduledDate - b.scheduledDate);
    else filtered = all.filter(v => v.completed).sort((a, b) => (b.completedData?.time || 0) - (a.completedData?.time || 0));

    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-vaccine-tab="${currentVaccineTab}"]`)?.classList.add('active');

    const container = $('#vaccineList');
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-hint">${
        currentVaccineTab === 'upcoming' ? '鏆傛棤鍗冲皢鎺ョ 馃帀' :
        currentVaccineTab === 'overdue' ? '娌℃湁閫炬湡鏈 馃帀' :
        '杩樻病鏈夊畬鎴愮殑鎺ョ璁板綍'
      }</div>`;
      return;
    }
    container.innerHTML = filtered.map(v => {
      let timeHtml, cls;
      if (v.completed) {
        cls = 'done';
        timeHtml = `<span class="vaccine-time">鉁?${fmtDateShort(v.completedData.time)}</span>`;
      } else if (v.overdue) {
        cls = 'overdue';
        const days = Math.floor((Date.now() - v.scheduledDate) / (1000 * 60 * 60 * 24));
        timeHtml = `<span class="vaccine-time">閫炬湡 ${days} 澶?/span>`;
      } else {
        cls = 'upcoming';
        const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
        timeHtml = `<span class="vaccine-time">${days === 0 ? '鈴?浠婂ぉ' : `${days} 澶╁悗 路 ${fmtDateShort(v.scheduledDate)}`}</span>`;
      }
      const catBadge = v.category === 'optional' ? '<span style="background:#FFF3E0;color:#F57C00;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px;">鑷垂</span>' : '';
      return `<div class="vaccine-card ${cls}">
        <div class="vaccine-name">${escapeHtml(v.name)}${catBadge}</div>
        <div class="vaccine-dose">${escapeHtml(v.dose)}</div>
        ${timeHtml}
        <div class="vaccine-desc">${escapeHtml(v.description)}</div>
        <div class="vaccine-actions">
          ${!v.completed ? `<button class="vaccine-mark-btn" data-mark="${v.id}">鏍囪宸叉帴绉?/button>` : ''}
          <button class="vaccine-detail-btn" data-detail="${v.id}">鏌ョ湅璇存槑</button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-mark]').forEach(btn => btn.addEventListener('click', () => openVaccineMarkModal(btn.dataset.mark)));
    container.querySelectorAll('[data-detail]').forEach(btn => btn.addEventListener('click', () => {
      const v = all.find(x => x.id === btn.dataset.detail);
      if (v) openVaccineDetail(v);
    }));
  }

  function openVaccineMarkModal(vaccineId) {
    const v = window.VACCINE_SCHEDULE.find(x => x.id === vaccineId);
    if (!v) return;
    openModal(`
      <div class="modal-header">
        <span class="modal-title">瀹屾垚鎺ョ 路 ${escapeHtml(v.name)}</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">${escapeHtml(v.dose)}</label>
          <p style="color:#888;font-size:13px;">${escapeHtml(v.description)}</p>
        </div>
        <div class="form-group">
          <label class="form-label">鎺ョ鏃ユ湡 *</label>
          <input class="form-input" type="date" id="vDate" value="${fmtDateShort(new Date())}" />
        </div>
        <div class="form-group">
          <label class="form-label">鎺ョ鍦扮偣</label>
          <input class="form-input" id="vLocation" placeholder="绀惧尯鍗敓鏈嶅姟涓績" />
        </div>
        <div class="form-group">
          <label class="form-label">鐤嫍鎵瑰彿</label>
          <input class="form-input" id="vBatch" placeholder="鍙€? />
        </div>
        <div class="form-group">
          <label class="form-label">澶囨敞</label>
          <textarea class="form-textarea" id="vNotes" placeholder="濡傦細鎺ョ鍚庡弽搴旂瓑"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">纭</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      await addRecord('vaccine', {
        vaccineId,
        time: new Date(modal.querySelector('#vDate').value).getTime(),
        location: modal.querySelector('#vLocation').value.trim(),
        batch: modal.querySelector('#vBatch').value.trim(),
        notes: modal.querySelector('#vNotes').value.trim()
      });
      closeModal();
      showToast('馃帀 宸茶褰?);
      renderVaccines();
      renderDashboard();
    });
  }

  function openVaccineDetail(v) {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(v.name)} ${escapeHtml(v.dose)}</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><p style="color:#666;line-height:1.7;">${escapeHtml(v.description)}</p></div>
        <div class="form-group"><label class="form-label">鎺ㄨ崘鎺ョ鏃堕棿</label><p style="color:#4A4A4A;font-size:15px;">${fmtDateShort(v.scheduledDate)}</p></div>
        <div class="form-group">
          <label class="form-label">鎺ョ鎻愮ず</label>
          <ul style="padding-left:20px;color:#666;font-size:13px;line-height:1.9;">
            <li>鎺ョ鍓嶇‘淇濆疂瀹濊韩浣撳仴搴凤紝鏃犲彂鐑瓑鐥囩姸</li>
            <li>鎺ョ鍚庣暀瑙?30 鍒嗛挓</li>
            <li>鎺ョ閮ㄤ綅 24 灏忔椂鍐呴伩鍏嶆簿姘?/li>
            <li>娉ㄦ剰瑙傚療鏄惁鏈夊彂鐑€佺孩鑲跨瓑涓嶈壇鍙嶅簲</li>
            <li>鎸夋椂瀹屾垚鍚庣画鍓傛</li>
          </ul>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍏抽棴</button>
        ${!v.completed ? `<button class="btn-primary" data-action="mark">鏍囪宸叉帴绉?/button>` : ''}
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    const markBtn = modal.querySelector('[data-action="mark"]');
    if (markBtn) markBtn.addEventListener('click', () => { closeModal(); openVaccineMarkModal(v.id); });
  }

  function openVaccineInfoModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">馃拤 鍥藉鍏嶇柅瑙勫垝鐤嫍</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <p style="color:#666;line-height:1.7;margin-bottom:12px;">鍥藉鍏嶇柅瑙勫垝鐤嫍鐢辨斂搴滃厤璐规彁渚涳紝鎸夋椂鎺ョ鍙湁鏁堥闃插绉嶅┐骞煎効浼犳煋鐥呫€?/p>
        <p style="color:#666;line-height:1.7;margin-bottom:12px;"><strong>鑷垂鐤嫍</strong>涓烘帹鑽愪絾闈炲己鍒剁殑鐤嫍锛屽彲鍦ㄥ尰鐢熷缓璁笅閫夋嫨鎺ョ銆?/p>
        <p style="color:#888;font-size:12px;background:#FFF5F7;padding:10px;border-radius:8px;">鈿狅笍 鏈簲鐢ㄤ粎渚涘弬鑰冦€傚叿浣撴帴绉嶇▼搴忎互褰撳湴鐤炬帶涓績鍜屽効绔ラ闃叉帴绉嶈瘉涓哄噯銆?/p>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">浜嗚В</button>
      </div>
    `);
    $('#modalContainer').querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  // ========== 灏垮竷 ==========
  function renderDiapers() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.diaper || []).slice().sort((a, b) => (b.time || 0) - (a.time || 0));
    const container = $('#diaperList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">杩樻病鏈夊翱甯冭褰?/div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const icon = r.diaperType === 'wet' ? '馃挧' : r.diaperType === 'dirty' ? '馃挬' : '馃攧';
      const typeLabel = r.diaperType === 'wet' ? '灏忎究' : r.diaperType === 'dirty' ? '澶т究' : '娣峰悎';
      return `<div class="record-card diaper">
        <div class="record-icon">${icon}</div>
        <div class="record-body">
          <div class="record-title">鎹㈠翱甯?路 ${typeLabel} <span style="font-size:12px;color:#999;font-weight:400;">路 ${memberName(r._createdBy)}</span></div>
          <div class="record-meta">${fmtDate(r.time)}</div>
          ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
          <div class="record-actions"><button data-del="${r._id}">鍒犻櫎</button></div>
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('鍒犻櫎锛?)) return;
      await deleteRecord(btn.dataset.del, 'diaper');
      renderDiapers();
    }));
  }

  function openDiaperModal() {
    if (babies.length === 0) return openAddBaby();
    openModal(`
      <div class="modal-header">
        <span class="modal-title">鎹㈠翱甯?/span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">绫诲瀷</label>
          <div class="form-row">
            <button class="btn-secondary" data-type="wet" style="padding:14px;">馃挧 灏忎究</button>
            <button class="btn-secondary" data-type="dirty" style="padding:14px;">馃挬 澶т究</button>
            <button class="btn-secondary" data-type="mixed" style="padding:14px;">馃攧 娣峰悎</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">鏃堕棿</label>
          <input class="form-input" type="datetime-local" id="diaperTime" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">澶囨敞</label>
          <textarea class="form-textarea" id="diaperNotes" placeholder="濡傦細绋€渚裤€侀鑹茬瓑"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    let selectedType = 'wet';
    modal.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('[data-type]').forEach(b => { b.style.background = ''; b.style.color = ''; });
        btn.style.background = '#FFB7C5';
        btn.style.color = 'white';
        selectedType = btn.dataset.type;
      });
    });
    modal.querySelector('[data-type="wet"]').click();
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      await addRecord('diaper', {
        diaperType: selectedType,
        time: new Date(modal.querySelector('#diaperTime').value).getTime(),
        notes: modal.querySelector('#diaperNotes').value.trim()
      });
      closeModal();
      showToast('宸茶褰?);
      renderDiapers();
    });
  }

  // ========== 鐫＄湢 ==========
  function renderSleep() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.sleep || []).slice().sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    const container = $('#sleepList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">杩樻病鏈夌潯鐪犺褰?/div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const ongoing = !r.endTime;
      const dur = r.endTime ? Math.round((r.endTime - r.startTime) / 60000) : null;
      const q = r.quality ? ' 路 ' + (r.quality === 'good' ? '馃槉' : r.quality === 'normal' ? '馃槓' : '馃槪') : '';
      return `<div class="record-card sleep">
        <div class="record-icon">${ongoing ? '馃挙' : '馃槾'}</div>
        <div class="record-body">
          <div class="record-title">${ongoing ? '姝ｅ湪鍏ョ潯' : `鐫′簡 ${Math.floor(dur/60)}h${dur%60}m`}${q} <span style="font-size:12px;color:#999;font-weight:400;">路 ${memberName(r._createdBy)}</span></div>
          <div class="record-meta">${fmtDate(r.startTime)}${r.endTime ? ' ~ ' + fmtDate(r.endTime) : ''}</div>
          ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
          <div class="record-actions">
            ${ongoing ? `<button data-end="${r._id}" style="color:#66BB6A;">缁撴潫鐫＄湢</button>` : ''}
            <button data-del="${r._id}">鍒犻櫎</button>
          </div>
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('鍒犻櫎锛?)) return;
      await deleteRecord(btn.dataset.del, 'sleep');
      renderSleep();
    }));
    container.querySelectorAll('[data-end]').forEach(btn => btn.addEventListener('click', async () => {
      const baby = getCurrentBaby();
      const rec = records[baby.id];
      const s = rec.sleep.find(x => x._id === btn.dataset.end);
      if (s) {
        await sb.from('records').update({ data: { ...s, endTime: Date.now() }, updated_at: new Date().toISOString() }).eq('id', s._id);
        s.endTime = Date.now();
      }
      renderSleep();
    }));
  }

  function openSleepModal() {
    if (babies.length === 0) return openAddBaby();
    const baby = getCurrentBaby();
    const rec = records[baby.id] || {};
    const ongoing = rec.sleep.find(s => !s.endTime);
    if (ongoing) {
      if (!confirm('瀹濆疂姝ｅ湪鍏ョ潯涓紝瑕佺粨鏉熻繖娆＄潯鐪犲悧锛?)) return;
      sb.from('records').update({ data: { ...ongoing, endTime: Date.now() }, updated_at: new Date().toISOString() }).eq('id', ongoing._id).then(() => {
        ongoing.endTime = Date.now();
        renderSleep();
        showToast('鐫＄湢宸茬粨鏉?);
      });
      return;
    }
    openModal(`
      <div class="modal-header">
        <span class="modal-title">娣诲姞鐫＄湢</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">寮€濮嬫椂闂?/label>
          <input class="form-input" type="datetime-local" id="sleepStart" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">缁撴潫鏃堕棿</label>
          <input class="form-input" type="datetime-local" id="sleepEnd" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">鐫＄湢璐ㄩ噺</label>
          <div class="segmented" data-seg="quality">
            <button data-val="good">馃槉</button>
            <button class="active" data-val="normal">馃槓</button>
            <button data-val="poor">馃槪</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">澶囨敞</label>
          <textarea class="form-textarea" id="sleepNotes" placeholder="濡傦細澶滈啋2娆?></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-secondary" data-action="ongoing">浠呭紑濮?/button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelectorAll('[data-seg="quality"] button').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('[data-seg="quality"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="ongoing"]').addEventListener('click', async () => {
      await addRecord('sleep', {
        startTime: new Date(modal.querySelector('#sleepStart').value).getTime(),
        endTime: null,
        quality: modal.querySelector('[data-seg="quality"] button.active').dataset.val,
        notes: modal.querySelector('#sleepNotes').value.trim()
      });
      closeModal();
      showToast('宸插紑濮嬬潯鐪?);
      renderSleep();
    });
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      await addRecord('sleep', {
        startTime: new Date(modal.querySelector('#sleepStart').value).getTime(),
        endTime: new Date(modal.querySelector('#sleepEnd').value).getTime(),
        quality: modal.querySelector('[data-seg="quality"] button.active').dataset.val,
        notes: modal.querySelector('#sleepNotes').value.trim()
      });
      closeModal();
      showToast('宸茶褰?);
      renderSleep();
    });
  }

  // ========== 鎴愰暱 ==========
  let growthChartType = 'weight';

  function renderGrowth() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.growth || []).slice().sort((a, b) => (a.date || 0) - (b.date || 0));
    const container = $('#growthContent');
    let summaryHtml = '';
    if (list.length > 0) {
      const last = list[list.length - 1];
      summaryHtml = `<div class="growth-stats">
        <div class="growth-stat-card"><div class="growth-stat-value">${last.weight ? last.weight.toFixed(2) : '--'}<span style="font-size:12px;color:#999;">kg</span></div><div class="growth-stat-label">鏈€杩戜綋閲?/div></div>
        <div class="growth-stat-card"><div class="growth-stat-value">${last.height ? last.height.toFixed(1) : '--'}<span style="font-size:12px;color:#999;">cm</span></div><div class="growth-stat-label">鏈€杩戣韩楂?/div></div>
        <div class="growth-stat-card"><div class="growth-stat-value">${last.headCircumference ? last.headCircumference.toFixed(1) : '--'}<span style="font-size:12px;color:#999;">cm</span></div><div class="growth-stat-label">鏈€杩戝ご鍥?/div></div>
      </div>`;
    }
    const tabs = `<div class="growth-tabs">
      <button class="growth-tab ${growthChartType === 'weight' ? 'active' : ''}" data-gt="weight">浣撻噸 kg</button>
      <button class="growth-tab ${growthChartType === 'height' ? 'active' : ''}" data-gt="height">韬珮 cm</button>
      <button class="growth-tab ${growthChartType === 'head' ? 'active' : ''}" data-gt="head">澶村洿 cm</button>
    </div>`;
    const chartHtml = `<div class="chart-container"><canvas id="growthCanvas"></canvas></div>`;
    const listHtml = list.length === 0
      ? '<div class="empty-hint">杩樻病鏈夋祴閲忔暟鎹?/div>'
      : list.slice().reverse().map(r => {
        const items = [];
        if (r.weight) items.push(`浣撻噸 <strong>${r.weight.toFixed(2)}</strong> kg`);
        if (r.height) items.push(`韬珮 <strong>${r.height.toFixed(1)}</strong> cm`);
        if (r.headCircumference) items.push(`澶村洿 <strong>${r.headCircumference.toFixed(1)}</strong> cm`);
        return `<div class="record-card growth">
          <div class="record-icon">馃搹</div>
          <div class="record-body">
            <div class="record-title">${fmtDateShort(r.date)}</div>
            <div class="record-meta">${items.join(' 路 ')}</div>
            ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
            <div class="record-actions"><button data-del="${r._id}">鍒犻櫎</button></div>
          </div>
        </div>`;
      }).join('');
    container.innerHTML = summaryHtml + tabs + chartHtml + listHtml;
    container.querySelectorAll('[data-gt]').forEach(btn => btn.addEventListener('click', () => { growthChartType = btn.dataset.gt; renderGrowth(); }));
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('鍒犻櫎锛?)) return;
      await deleteRecord(btn.dataset.del, 'growth');
      renderGrowth();
    }));
    if (list.length > 0) drawGrowthChart(list);
  }

  function drawGrowthChart(list) {
    const canvas = $('#growthCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;
    const data = list.map(r => ({
      x: r.date,
      y: growthChartType === 'weight' ? r.weight : growthChartType === 'height' ? r.height : r.headCircumference
    })).filter(d => d.y != null);
    if (data.length === 0) {
      ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('鏆傛棤璇ョ被鍨嬫暟鎹?, W/2, H/2); return;
    }
    const minX = data[0].x;
    const maxX = data[data.length-1].x;
    const rangeX = Math.max(maxX - minX, 86400000);
    const ys = data.map(d => d.y);
    const minY = Math.min(...ys) * 0.95;
    const maxY = Math.max(...ys) * 1.05;
    ctx.strokeStyle = '#F0F0F0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH * i / 4);
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
    }
    ctx.fillStyle = '#999'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = minY + (maxY - minY) * (1 - i / 4);
      const y = padding.top + (chartH * i / 4);
      ctx.fillText(v.toFixed(1), padding.left - 6, y + 4);
    }
    ctx.textAlign = 'center';
    const xLabelCount = Math.min(data.length, 4);
    for (let i = 0; i < xLabelCount; i++) {
      const idx = Math.floor(i * (data.length - 1) / Math.max(xLabelCount - 1, 1));
      const x = padding.left + ((data[idx].x - minX) / rangeX) * chartW;
      const lbl = fmtDateShort(data[idx].x).slice(5);
      ctx.fillText(lbl, x, H - padding.bottom + 18);
    }
    ctx.strokeStyle = '#FFB7C5'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + ((d.x - minX) / rangeX) * chartW;
      const y = padding.top + (1 - (d.y - minY) / (maxY - minY)) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
    grad.addColorStop(0, 'rgba(255,183,197,0.3)'); grad.addColorStop(1, 'rgba(255,183,197,0.02)');
    ctx.fillStyle = grad;
    ctx.lineTo(padding.left + ((data[data.length-1].x - minX) / rangeX) * chartW, H - padding.bottom);
    ctx.lineTo(padding.left, H - padding.bottom); ctx.closePath(); ctx.fill();
    data.forEach(d => {
      const x = padding.left + ((d.x - minX) / rangeX) * chartW;
      const y = padding.top + (1 - (d.y - minY) / (maxY - minY)) * chartH;
      ctx.fillStyle = '#FF99AD';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#4A4A4A'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
    const label = growthChartType === 'weight' ? '浣撻噸 (kg)' : growthChartType === 'height' ? '韬珮 (cm)' : '澶村洿 (cm)';
    ctx.fillText(label, padding.left, padding.top - 6);
  }

  function openGrowthModal() {
    if (babies.length === 0) return openAddBaby();
    openModal(`
      <div class="modal-header">
        <span class="modal-title">娣诲姞鐢熼暱娴嬮噺</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">娴嬮噺鏃ユ湡</label>
          <input class="form-input" type="date" id="growthDate" value="${fmtDateShort(new Date())}" />
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">浣撻噸 (kg)</label><input class="form-input" type="number" step="0.01" id="growthWeight" placeholder="6.5" /></div>
          <div class="form-group"><label class="form-label">韬珮 (cm)</label><input class="form-input" type="number" step="0.1" id="growthHeight" placeholder="65" /></div>
        </div>
        <div class="form-group"><label class="form-label">澶村洿 (cm)</label><input class="form-input" type="number" step="0.1" id="growthHead" placeholder="鍙€? /></div>
        <div class="form-group"><label class="form-label">澶囨敞</label><textarea class="form-textarea" id="growthNotes" placeholder="鍙€?></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const w = parseFloat(modal.querySelector('#growthWeight').value);
      const h = parseFloat(modal.querySelector('#growthHeight').value);
      const head = parseFloat(modal.querySelector('#growthHead').value);
      const date = new Date(modal.querySelector('#growthDate').value).getTime();
      if (!w && !h && !head) return showToast('璇疯嚦灏戝～鍐欎竴椤?);
      await addRecord('growth', {
        date,
        weight: w || null,
        height: h || null,
        headCircumference: head || null,
        notes: modal.querySelector('#growthNotes').value.trim()
      });
      closeModal();
      showToast('宸茶褰?);
      renderGrowth();
    });
  }

  // ========== 閲岀▼纰?==========
  function renderMilestones() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.milestone || []).slice().sort((a, b) => (b.date || 0) - (a.date || 0));
    const container = $('#milestoneList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">杩樻病鏈夐噷绋嬬璁板綍<br>璁板綍瀹濆疂鎴愰暱鐨勬瘡涓€涓?绗竴娆?鍚?猸?/div>';
      return;
    }
    container.innerHTML = list.map(r => `
      <div class="milestone-card">
        ${r.photo ? `<img src="${r.photo}" alt="" />` : `<div class="milestone-image">${r.icon || '猸?}</div>`}
        <div class="milestone-body">
          <div class="milestone-title">${r.icon || '猸?} ${escapeHtml(r.title)} <span style="font-size:12px;color:#999;font-weight:400;">路 ${memberName(r._createdBy)}</span></div>
          <div class="milestone-date">${fmtDateShort(r.date)} 路 褰撴椂 ${ageText(baby.birth_date)}</div>
          ${r.description ? `<div class="milestone-desc">${escapeHtml(r.description)}</div>` : ''}
          <div class="record-actions" style="margin-top:8px;"><button data-del="${r._id}">鍒犻櫎</button></div>
        </div>
      </div>
    `).join('');
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('鍒犻櫎锛?)) return;
      await deleteRecord(btn.dataset.del, 'milestone');
      renderMilestones();
    }));
  }

  function openMilestoneModal() {
    if (babies.length === 0) return openAddBaby();
    const presets = window.MILESTONE_PRESETS;
    const presetHtml = presets.map((p, i) => `<button class="btn-secondary" data-preset="${i}" style="padding:10px;font-size:13px;">${p.icon} ${escapeHtml(p.title)}</button>`).join('');
    openModal(`
      <div class="modal-header">
        <span class="modal-title">猸?娣诲姞閲岀▼纰?/span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">甯歌閲岀▼纰?/label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${presetHtml}</div>
        </div>
        <div class="form-group"><label class="form-label">鏍囬 *</label><input class="form-input" id="msTitle" placeholder="濡傦細绗竴娆″彨濡堝" /></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">鍥炬爣 Emoji</label><input class="form-input" id="msIcon" value="猸? maxlength="4" /></div>
          <div class="form-group"><label class="form-label">鏃ユ湡</label><input class="form-input" type="date" id="msDate" value="${fmtDateShort(new Date())}" /></div>
        </div>
        <div class="form-group">
          <label class="form-label">鐓х墖</label>
          <input type="file" id="msPhoto" accept="image/*" style="font-size:13px;" />
          <div id="msPhotoPreview" style="margin-top:8px;"></div>
        </div>
        <div class="form-group"><label class="form-label">鎻忚堪</label><textarea class="form-textarea" id="msDesc" placeholder="璁板綍杩欎釜鐗瑰埆鐨勭灛闂?.."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    let photoData = null;
    modal.querySelector('#msPhoto').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        photoData = ev.target.result;
        modal.querySelector('#msPhotoPreview').innerHTML = `<img src="${photoData}" style="max-width:100%;max-height:150px;border-radius:8px;" />`;
      };
      reader.readAsDataURL(file);
    });
    modal.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = presets[parseInt(btn.dataset.preset)];
        modal.querySelector('#msTitle').value = p.title;
        modal.querySelector('#msIcon').value = p.icon;
      });
    });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const title = modal.querySelector('#msTitle').value.trim();
      if (!title) return showToast('璇疯緭鍏ユ爣棰?);
      await addRecord('milestone', {
        title,
        icon: modal.querySelector('#msIcon').value || '猸?,
        date: new Date(modal.querySelector('#msDate').value).getTime(),
        description: modal.querySelector('#msDesc').value.trim(),
        photo: photoData
      });
      closeModal();
      showToast('猸?宸茶褰?);
      renderMilestones();
    });
  }

  // ========== 瀹跺涵 / 璁剧疆闈㈡澘 ==========
  async function openFamilyModal() {
    let members = [];
    try {
      const { data } = await sb.from('profiles').select('*').eq('family_id', currentFamily.id);
      members = data || [];
    } catch (err) { console.error(err); }

    openModal(`
      <div class="modal-header">
        <span class="modal-title">馃懆鈥嶐煈┾€嶐煈?瀹跺涵</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="family-info-card">
          <div class="family-name">${escapeHtml(currentFamily.name)}</div>
          <div class="family-invite">
            <span class="invite-label">閭€璇风爜</span>
            <span class="invite-code" id="inviteCode">${currentFamily.invite_code || '----'}</span>
            <button class="btn-secondary" data-copy-code style="padding:4px 10px;font-size:12px;">澶嶅埗</button>
          </div>
          <p class="family-hint">鎶婇個璇风爜鍛婅瘔瀹朵汉锛岃浠栦滑鍦ㄣ€屽姞鍏ュ搴€嶅杈撳叆</p>
        </div>
        <div class="family-section">
          <h4 class="family-section-title">瀹跺涵鎴愬憳 (${members.length})</h4>
          <div class="family-members">
            ${members.map(m => `
              <div class="member-item">
                <div class="member-avatar">${m.role === 'admin' ? '馃憫' : '馃懁'}</div>
                <div class="member-info">
                  <div class="member-name">${escapeHtml(m.display_name || m.username)}</div>
                  <div class="member-meta">@${escapeHtml(m.username)} 路 ${m.role === 'admin' ? '绠＄悊鍛? : '鎴愬憳'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="family-section">
          <button class="btn-secondary" data-action="logout" style="width:100%;padding:12px;color:#FF6B6B;">閫€鍑虹櫥褰?/button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">瀹屾垚</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-copy-code]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentFamily.invite_code);
        showToast('宸插鍒堕個璇风爜');
      } catch {
        showToast('澶嶅埗澶辫触锛? + currentFamily.invite_code);
      }
    });
    modal.querySelector('[data-action="logout"]').addEventListener('click', () => { closeModal(); handleLogout(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  function openSettingsModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">鈿欙笍 璁剧疆</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <div class="settings-section-title">褰撳墠鐢ㄦ埛</div>
          <div class="settings-card">
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">@${escapeHtml(currentProfile?.username || '')}</span>
              <span class="settings-item-value">${escapeHtml(currentProfile?.display_name || '')}</span>
            </div>
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">瀹跺涵</span>
              <span class="settings-item-value">${escapeHtml(currentFamily?.name || '')}</span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">鏁版嵁</div>
          <div class="settings-card">
            <div class="settings-item" data-action="reminder">
              <span class="settings-item-label">馃敂 娴忚鍣ㄩ€氱煡</span>
              <span class="settings-item-value" id="notifStatus">${Notification.permission === 'granted' ? '宸插紑鍚? : '鏈紑鍚?}</span>
              <span class="settings-item-arrow">鈥?/span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">鍏充簬</div>
          <div class="settings-card">
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">钀屽疂鎴愰暱璁?v2.0</span>
              <span class="settings-item-value">浜戠鐗?/span>
            </div>
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">鏁版嵁瀛樺偍</span>
              <span class="settings-item-value">Supabase 浜戠</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">瀹屾垚</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="reminder"]').addEventListener('click', async () => {
      if (!('Notification' in window)) return showToast('褰撳墠娴忚鍣ㄤ笉鏀寔閫氱煡');
      const perm = await Notification.requestPermission();
      modal.querySelector('#notifStatus').textContent = perm === 'granted' ? '宸插紑鍚? : '鏈紑鍚?;
    });
  }

  function openNotificationsPanel() {
    const upcoming = computeVaccineSchedule().filter(v => !v.completed).sort((a, b) => a.scheduledDate - b.scheduledDate).slice(0, 20);
    openModal(`
      <div class="modal-header">
        <span class="modal-title">馃敂 鎺ョ鎻愰啋</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        ${upcoming.length === 0 ? '<div class="empty-hint">鎵€鏈夌柅鑻楅兘宸插畬鎴?馃帀</div>' :
          upcoming.map(v => {
            const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
            const cls = v.overdue ? 'overdue' : days <= 7 ? 'due' : '';
            let meta;
            if (v.overdue) meta = `閫炬湡 ${-days} 澶ー;
            else if (days === 0) meta = '鈴?浠婂ぉ鎺ョ';
            else meta = `杩樻湁 ${days} 澶?路 ${fmtDateShort(v.scheduledDate)}`;
            return `<div class="reminder-item ${cls}">
              <div class="item-icon">馃拤</div>
              <div class="item-body">
                <div class="item-title">${escapeHtml(v.name)} 路 ${escapeHtml(v.dose)}</div>
                <div class="item-meta">${meta}</div>
              </div>
            </div>`;
          }).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">鍏抽棴</button>
      </div>
    `);
    $('#modalContainer').querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  // ========== 蹇嵎鎿嶄綔 ==========
  function openQuickAction(type) {
    if (babies.length === 0) return openAddBaby();
    switch (type) {
      case 'feeding': openFeedingModal(); break;
      case 'diaper': openDiaperModal(); break;
      case 'sleep': openSleepModal(); break;
      case 'medicine': openMedicineModal(); break;
      case 'growth': openGrowthModal(); break;
      case 'milestone': openMilestoneModal(); break;
    }
  }

  function openMedicineModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">馃拪 鐢ㄨ嵂璁板綍</span>
        <button class="modal-close" data-action="close">脳</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">鑽搧鍚嶇О *</label><input class="form-input" id="medName" placeholder="濡傦細娉拌鏋? /></div>
        <div class="form-group"><label class="form-label">鍓傞噺</label><input class="form-input" id="medDose" placeholder="濡傦細1.5ml" /></div>
        <div class="form-group"><label class="form-label">鏈嶇敤鏃堕棿</label><input class="form-input" type="datetime-local" id="medTime" value="${datetimeLocalValue()}" /></div>
        <div class="form-group"><label class="form-label">澶囨敞</label><textarea class="form-textarea" id="medNotes" placeholder="濡傦細閫€鐑х敤銆佷綋娓?8.5鈩冪瓑"></textarea></div>
        <div class="form-group"><p style="color:#888;font-size:12px;background:#FFF8E1;padding:10px;border-radius:8px;">鈿狅笍 鐢ㄨ嵂鍓嶈浠旂粏闃呰璇存槑涔︽垨閬靛尰鍢便€?/p></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">鍙栨秷</button>
        <button class="btn-primary" data-action="save">淇濆瓨</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const name = modal.querySelector('#medName').value.trim();
      if (!name) return showToast('璇疯緭鍏ヨ嵂鍝佸悕绉?);
      await addRecord('milestone', {
        title: '鐢ㄨ嵂: ' + name,
        icon: '馃拪',
        date: new Date(modal.querySelector('#medTime').value).getTime(),
        description: (modal.querySelector('#medDose').value.trim() ? '鍓傞噺锛? + modal.querySelector('#medDose').value.trim() + '\n' : '') + modal.querySelector('#medNotes').value.trim()
      });
      closeModal();
      showToast('宸茶褰?);
    });
  }

  // ========== 鍒濆鍖?==========
  function init() {
    // 鐧诲綍 tabs
    $$('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        $$('.auth-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.auth-panel[data-auth-panel="${tab.dataset.authTab}"]`).classList.add('active');
        clearAuthError();
      });
    });
    $('#loginBtn').addEventListener('click', handleLogin);
    $('#joinBtn').addEventListener('click', handleJoinFamily);
    $('#createBtn').addEventListener('click', handleCreateFamily);

    // 搴曢儴瀵艰埅
    $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

    // 澶撮儴
    $('#babySwitcherBtn').addEventListener('click', openBabySwitcher);
    $('#familyBtn').addEventListener('click', openFamilyModal);
    $('#settingsBtn').addEventListener('click', openSettingsModal);
    $('#notificationsBtn').addEventListener('click', openNotificationsPanel);

    // 娣诲姞鎸夐挳
    $('#addFeedingBtn').addEventListener('click', openFeedingModal);
    $('#addDiaperBtn').addEventListener('click', openDiaperModal);
    $('#addSleepBtn').addEventListener('click', openSleepModal);
    $('#addGrowthBtn').addEventListener('click', openGrowthModal);
    $('#addMilestoneBtn').addEventListener('click', openMilestoneModal);
    $('#vaccineInfoBtn').addEventListener('click', openVaccineInfoModal);

    // 鐤嫍 tabs
    $$('[data-vaccine-tab]').forEach(btn => btn.addEventListener('click', () => renderVaccines(btn.dataset.vaccineTab)));

    // 蹇嵎鎿嶄綔
    $$('[data-quick]').forEach(btn => btn.addEventListener('click', () => openQuickAction(btn.dataset.quick)));

    // 鍚姩妫€鏌?    checkSession();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
