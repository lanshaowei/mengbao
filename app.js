// ========================================================================
// 萌宝成长记 - 婴儿养育一体化记录应用（云端版）
// 使用 Supabase 作为云端后端：多用户共享 + 邀请码机制
// ========================================================================

(function () {
  'use strict';

  // ========== Supabase 初始化 ==========
  const SUPABASE_URL = window.SUPABASE_CONFIG?.url;
  const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ========== 本地状态 ==========
  let currentUser = null;     // { id, email }
  let currentFamily = null;   // { id, name, invite_code }
  let currentProfile = null;  // { id, family_id, username, display_name, role }
  let babies = [];            // currentFamily 中的宝宝
  let records = {};           // { [babyId]: { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] } }
  let syncState = 'synced';   // synced | syncing | offline

  // 持久化的活跃宝宝选择
  function getCurrentBabyId() {
    return localStorage.getItem('currentBabyId_' + currentFamily?.id);
  }
  function setCurrentBabyId(id) {
    if (currentFamily) localStorage.setItem('currentBabyId_' + currentFamily.id, id);
  }
  let currentBabyId = null;

  // ========== 工具函数 ==========
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
    if (!birthDate) return '未设置生日';
    const months = ageInMonths(birthDate);
    if (months < 1) return Math.floor((Date.now() - new Date(birthDate).getTime()) / 86400000) + ' 天';
    if (months < 24) return Math.floor(months) + ' 月' + Math.floor((months % 1) * 30) + ' 天';
    const years = Math.floor(months / 12);
    const restMonths = Math.floor(months % 12);
    return years + ' 岁' + (restMonths ? ' ' + restMonths + ' 月' : '');
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
    $('#syncText').textContent = msg || (s === 'synced' ? '✓ 已同步' : s === 'syncing' ? '⟳ 同步中' : '⚠ 离线');
  }

  // ========== 模态框 ==========
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

  // ========== 视图切换 ==========
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

  // ========== 数据层 ==========
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

  // 从云端加载所有数据
  async function loadFamilyData() {
    setSyncState('syncing', '⟳ 加载数据');
    try {
      // 1. 获取 family_id（用 SECURITY DEFINER RPC 绕过 RLS）
      let familyId = currentFamily?.id;
      if (!familyId) {
        const { data: rpcFam, error: rpcErr } = await sb.rpc('get_my_family_id');
        if (rpcErr) throw rpcErr;
        // RPC 返回 [{ get_my_family_id: <uuid> }]
        familyId = rpcFam?.[0]?.get_my_family_id || rpcFam?.get_my_family_id;
        if (!familyId) throw new Error('未关联家庭');
      }

      // 2. 加载 profile（用 maybeSingle 防止 0 行报错）
      const { data: profileData } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
      currentProfile = profileData || { id: currentUser.id, family_id: familyId };

      // 3. 加载 family
      const { data: familyData, error: famErr } = await sb.from('families').select('*').eq('id', familyId).maybeSingle();
      if (famErr) throw famErr;
      currentFamily = familyData || currentFamily || { id: familyId };

      // 4. 加载 babies
      const { data: babyList } = await sb.from('babies').select('*').order('created_at', { ascending: true });
      babies = babyList || [];

      // 5. 加载所有 records
      const { data: recList } = await sb.from('records').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
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
      console.error('加载数据失败', err);
      setSyncState('offline');
      showToast('加载数据失败：' + err.message);
    }
  }

  // 添加宝宝
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
      showToast('添加失败：' + err.message);
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
      showToast('更新失败：' + err.message);
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
      showToast('删除失败：' + err.message);
    }
  }

  // 添加记录（通用）
  async function addRecord(type, data) {
    const baby = getCurrentBaby();
    if (!baby) return;
    setSyncState('syncing');
    try {
      // 本地时间戳
      const localTs = data.type || Date.now();
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
        // vaccine: data 包含 vaccineId
        if (!records[baby.id].vaccine) records[baby.id].vaccine = {};
        records[baby.id].vaccine[data.vaccineId] = rec;
      } else {
        if (!records[baby.id][type]) records[baby.id][type] = [];
        records[baby.id][type].push(rec);
      }
      setSyncState('synced');
    } catch (err) {
      setSyncState('offline');
      showToast('保存失败：' + err.message);
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
      showToast('删除失败：' + err.message);
    }
  }

  // ========== 认证：登录 / 注册 / 加入家庭 ==========
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
    if (!username || !password) return showAuthError('请输入用户名和密码');
    const email = username + '@mengbao.app';
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      // 用户不存在则提示去注册
      return showAuthError('登录失败：' + (error.message.includes('Invalid') ? '用户名或密码错误' : error.message));
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
    if (!familyName || !username || !displayName) return showAuthError('请填写所有字段');
    if (password.length < 6) return showAuthError('密码至少 6 位');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showAuthError('用户名只能包含字母、数字、下划线');
    try {
      const email = username + '@mengbao.app';
      // 1. 注册 auth 用户
      const { data: signData, error: signErr } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username, display_name: displayName } }
      });
      if (signErr) throw signErr;
      // 强制登录一次（即使邮箱确认未关闭也能拿到 session）
      const { data: siData, error: siErr } = await sb.auth.signInWithPassword({ email, password });
      if (siErr) throw siErr;
      currentUser = siData.user;
      // 2. 通过 RPC 创建家庭（SECURITY DEFINER 绕过 RLS 限制）
      const { data: rpcData, error: rpcErr } = await sb.rpc('create_family', {
        p_name: familyName,
        p_user_id: currentUser.id,
        p_display_name: displayName
      });
      if (rpcErr) throw rpcErr;
      if (!rpcData || rpcData.length === 0) throw new Error('创建家庭失败');
      currentFamily = { id: rpcData[0].family_id, name: familyName, invite_code: rpcData[0].invite_code };
      await loadFamilyData();
      showToast('家庭创建成功 🎉 邀请码：' + currentFamily.invite_code);
      onLoginSuccess();
    } catch (err) {
      showAuthError('创建失败：' + err.message);
    }
  }

  async function handleJoinFamily() {
    clearAuthError();
    const code = $('#joinCode').value.trim().toUpperCase();
    const username = $('#joinUsername').value.trim();
    const displayName = $('#joinDisplayName').value.trim() || username;
    const password = $('#joinPassword').value;
    if (!code || !username || !password) return showAuthError('请填写邀请码、用户名、密码');
    if (password.length < 6) return showAuthError('密码至少 6 位');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showAuthError('用户名只能包含字母、数字、下划线');
    try {
      // 1. 查找家庭
      const { data: famData, error: famErr } = await sb.from('families').select('*').eq('invite_code', code).single();
      if (famErr || !famData) return showAuthError('邀请码不正确');
      // 2. 注册 auth 用户
      const email = username + '@mengbao.app';
      const { data: signData, error: signErr } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username, display_name: displayName } }
      });
      if (signErr) {
        if (signErr.message.includes('already registered')) return showAuthError('用户名已被占用，请换一个');
        throw signErr;
      }
      // 强制登录一次（即使邮箱确认未关闭也能拿到 session）
      const { data: siData, error: siErr } = await sb.auth.signInWithPassword({ email, password });
      if (siErr) throw siErr;
      currentUser = siData.user;
      // 3. 通过 RPC 加入家庭
      const { data: joinData, error: joinErr } = await sb.rpc('join_family', {
        p_invite_code: code,
        p_user_id: currentUser.id,
        p_display_name: displayName
      });
      if (joinErr) {
        if (joinErr.message.includes('邀请码')) return showAuthError('邀请码不正确');
        throw joinErr;
      }
      if (!joinData || joinData.length === 0) throw new Error('加入家庭失败');
      currentFamily = { id: joinData[0].family_id, name: '家庭', invite_code: code };
      await loadFamilyData();
      showToast('加入成功 🎉 欢迎来到 ' + famData.name);
      onLoginSuccess();
    } catch (err) {
      showAuthError('加入失败：' + err.message);
    }
  }

  async function handleLogout() {
    if (!confirm('确定要退出登录吗？')) return;
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

  // 注入 SVG 资源
  function setupBabyArt() {
    const logo = document.querySelector('#authLogo');
    if (logo && !logo.innerHTML.trim()) logo.innerHTML = BABY_ART.logo;
    const navLogo = document.querySelector('#currentBabyAvatar');
    if (navLogo && !navLogo.innerHTML.trim()) navLogo.innerHTML = BABY_ART.avatar;
  }

  // 启动时检查登录状态
  async function checkSession() {
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

  // ========== 宝宝管理 ==========
  function openAddBaby() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">添加宝宝</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">宝宝昵称 *</label>
          <input class="form-input" id="babyNameInput" placeholder="例如：小桃" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">性别</label>
            <div class="segmented" data-seg="gender">
              <button class="active" data-val="female">👧 女</button>
              <button data-val="male">👦 男</button>
              <button data-val="other">🌟 其他</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">出生日期 *</label>
            <input class="form-input" type="date" id="babyBirthInput" max="${fmtDateShort(new Date())}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">头像 Emoji</label>
          <input class="form-input" id="babyAvatarInput" placeholder="👶" value="👶" maxlength="4" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
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
      const avatar = modal.querySelector('#babyAvatarInput').value.trim() || '👶';
      const gender = modal.querySelector('[data-seg="gender"] button.active').dataset.val;
      if (!name) return showToast('请输入宝宝昵称');
      if (!birth) return showToast('请选择出生日期');
      await addBaby({ name, birthDate: birth, avatar, gender });
      closeModal();
      showToast('欢迎 ' + avatar + ' ' + name);
      refreshHeader();
      renderDashboard();
    });
  }

  function openBabySwitcher() {
    if (babies.length === 0) return openAddBaby();
    const list = babies.map(b => `
      <div class="baby-item ${b.id === currentBabyId ? 'current' : ''}" data-baby-id="${b.id}">
        <div class="baby-icon">${b.avatar || '👶'}</div>
        <div class="baby-info">
          <div class="baby-name">${escapeHtml(b.name)}</div>
          <div class="baby-age">${ageText(b.birth_date)} · ${b.gender === 'male' ? '男' : b.gender === 'female' ? '女' : ''}</div>
        </div>
        <button data-edit-id="${b.id}" style="font-size:18px;">✏️</button>
        <button data-add-baby style="margin-top:8px;">+ 添加新宝宝</button>
      </div>
    `).join('');

    openModal(`
      <div class="modal-header">
        <span class="modal-title">选择宝宝</span>
        <button class="modal-close" data-action="close">×</button>
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
        <span class="modal-title">编辑宝宝</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">宝宝昵称 *</label>
          <input class="form-input" id="babyNameInput" value="${escapeHtml(baby.name)}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">性别</label>
            <div class="segmented" data-seg="gender">
              <button class="${baby.gender === 'female' ? 'active' : ''}" data-val="female">👧 女</button>
              <button class="${baby.gender === 'male' ? 'active' : ''}" data-val="male">👦 男</button>
              <button class="${baby.gender === 'other' ? 'active' : ''}" data-val="other">🌟 其他</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">出生日期 *</label>
            <input class="form-input" type="date" id="babyBirthInput" value="${baby.birth_date}" max="${fmtDateShort(new Date())}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">头像 Emoji</label>
          <input class="form-input" id="babyAvatarInput" value="${escapeHtml(baby.avatar || '👶')}" maxlength="4" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="delete" style="background:#FFE5E5;color:#FF6B6B;">删除</button>
        <button class="btn-primary" data-action="save">保存</button>
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
        avatar: modal.querySelector('#babyAvatarInput').value.trim() || '👶',
        gender: modal.querySelector('[data-seg="gender"] button.active').dataset.val,
      };
      if (!data.name) return showToast('请输入宝宝昵称');
      await updateBaby(babyId, data);
      closeModal();
      showToast('已更新');
      refreshHeader();
      renderDashboard();
    });
    modal.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('确定要删除 ' + baby.name + ' 及所有数据吗？此操作不可恢复。')) return;
      await deleteBaby(babyId);
      currentBabyId = babies[0]?.id || null;
      if (currentBabyId) setCurrentBabyId(currentBabyId);
      closeModal();
      refreshHeader();
      renderDashboard();
      showToast('已删除');
    });
  }

  function refreshHeader() {
    const baby = getCurrentBaby();
    if (!baby) {
      $('#currentBabyAvatar').innerHTML = BABY_ART.avatar;
      $('#babySubtitle').textContent = '添加宝宝开始记录';
      return;
    }
    $('#currentBabyAvatar').innerHTML = BABY_ART.avatar;
    $('#babySubtitle').textContent = `${baby.name} · ${ageText(baby.birth_date)}`;
    if (currentProfile?.display_name) {
      $('#appTitle').textContent = '萌宝·' + currentProfile.display_name;
    }
  }

  // ========== 仪表板 ==========
  function renderDashboard() {
    if (babies.length === 0) {
      $('#greeting').textContent = '欢迎使用萌宝成长记 👋';
      $('#todayDate').textContent = '';
      $('#quickStats').innerHTML = '';
      $('#dashboardReminders').innerHTML = '<div class="empty-state"><div class="empty-art">' + BABY_ART.emptyBaby + '</div><div class="empty-text">先添加宝宝开始记录</div></div>';
      $('#recentRecords').innerHTML = '';
      return;
    }
    const baby = getCurrentBaby();
    const h = new Date().getHours();
    let greeting = '早上好 ☀️';
    if (h >= 11 && h < 14) greeting = '中午好 🌞';
    else if (h >= 14 && h < 18) greeting = '下午好 🌤️';
    else if (h >= 18 && h < 22) greeting = '晚上好 🌙';
    else if (h >= 22 || h < 6) greeting = '夜深了 🌛';
    $('#greeting').textContent = greeting + '，' + baby.name;
    const week = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
    $('#todayDate').textContent = `${fmtDateShort(new Date())} 周${week}`;

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
      list.innerHTML = '<div class="empty-state"><div class="empty-art">' + BABY_ART.emptyReminder + '</div><div class="empty-text">暂无待办提醒</div></div>';
      $('#reminderBadge').hidden = true;
      return;
    }
    const items = overdue.concat(upcoming.slice(0, 4)).slice(0, 4).map(v => {
      const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
      let meta;
      if (v.completed) meta = '✅ 已接种';
      else if (v.overdue) meta = `逾期 ${-days} 天`;
      else if (days === 0) meta = '⏰ 今天接种';
      else meta = `还有 ${days} 天`;
      const cls = v.completed ? '' : v.overdue ? 'overdue' : (days <= 7 ? 'due' : '');
      return `<div class="reminder-item ${cls}" data-vaccine-id="${v.id}">
        <div class="item-icon">💉</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(v.name)} · ${escapeHtml(v.dose)}</div>
          <div class="item-meta">${fmtDateShort(v.scheduledDate)} · ${meta}</div>
        </div>
        <span class="item-arrow">›</span>
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
      list.innerHTML = '<div class="empty-state"><div class="empty-art">' + BABY_ART.emptyRecord + '</div><div class="empty-text">今天还没有记录<br>使用上方快捷按钮开始记录</div></div>';
      return;
    }
    list.innerHTML = today.map(r => {
      if (r._type === 'feeding') {
        const icon = r.feedingType === 'breast' ? '🤱' : r.feedingType === 'formula' ? '🍼' : '🍚';
        const typeLabel = r.feedingType === 'breast' ? `母乳 · ${r.duration || 0}分钟` : r.feedingType === 'formula' ? `配方奶 · ${r.amount}ml` : `辅食`;
        return `<div class="recent-item">
          <div class="item-icon">${icon}</div>
          <div class="item-body">
            <div class="item-title">${typeLabel}</div>
            <div class="item-meta">${fmtTime(r.time)} · ${memberName(r._createdBy)}</div>
          </div>
        </div>`;
      } else if (r._type === 'diaper') {
        const icon = r.diaperType === 'wet' ? '💧' : r.diaperType === 'dirty' ? '💩' : '🔄';
        const typeLabel = r.diaperType === 'wet' ? '小便' : r.diaperType === 'dirty' ? '大便' : '混合';
        return `<div class="recent-item">
          <div class="item-icon">${icon}</div>
          <div class="item-body">
            <div class="item-title">换尿布 · ${typeLabel}</div>
            <div class="item-meta">${fmtTime(r.time)} · ${memberName(r._createdBy)}</div>
          </div>
        </div>`;
      } else if (r._type === 'sleep') {
        const dur = r.endTime ? Math.round((r.endTime - r.startTime) / 60000) : null;
        return `<div class="recent-item">
          <div class="item-icon">😴</div>
          <div class="item-body">
            <div class="item-title">${dur != null ? `睡了 ${Math.floor(dur/60)}h${dur%60}m` : '入睡中'}</div>
            <div class="item-meta">${fmtTime(r.startTime)} · ${memberName(r._createdBy)}</div>
          </div>
        </div>`;
      }
    }).join('');
  }

  // 简单用户名缓存
  const memberCache = {};
  function memberName(uid) {
    if (!uid) return '';
    if (memberCache[uid]) return memberCache[uid];
    // 默认占位
    memberCache[uid] = '家人';
    // 异步拉取
    sb.from('profiles').select('username, display_name').eq('id', uid).single().then(({ data }) => {
      if (data) memberCache[uid] = data.display_name || data.username;
      // 重新渲染当前视图（仅当 dashboard）
      if ($('#view-dashboard').classList.contains('active')) renderRecentRecords();
    });
    return memberCache[uid];
  }

  // ========== 喂养 ==========
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
          <div style="font-size:12px;color:#888;">母乳计时中 · ${feedingTimerSide === 'left' ? '左侧' : '右侧'}</div>
          <div class="timer-display">${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}</div>
        </div>
        <div class="timer-controls">
          <button class="timer-reset-btn" data-side-switch>换边</button>
          <button class="timer-stop-btn" data-stop>停止</button>
        </div>
      </div>`;
    } else {
      timerHtml = `<div class="timer-bar">
        <div>
          <div style="font-size:12px;color:#888;">母乳计时</div>
          <div class="timer-display" style="font-size:16px;color:#888;">点击开始</div>
        </div>
        <div class="timer-controls">
          <button class="timer-start-btn" data-start-bf="left">左侧开始</button>
          <button class="timer-start-btn" data-start-bf="right">右侧开始</button>
        </div>
      </div>`;
    }

    const listHtml = list.length === 0
      ? '<div class="empty-hint">还没有喂养记录</div>'
      : list.map(r => {
          let typeLabel, icon;
          if (r.feedingType === 'breast') {
            icon = '🤱';
            typeLabel = `母乳 · ${r.duration || 0}分钟 · ${r.side === 'left' ? '左' : r.side === 'right' ? '右' : '双'}`;
          } else if (r.feedingType === 'formula') {
            icon = '🍼';
            typeLabel = `配方奶 · ${r.amount}ml`;
          } else {
            icon = '🍚';
            typeLabel = `辅食 · ${escapeHtml(r.food || '')}`;
          }
          return `<div class="record-card feeding">
            <div class="record-icon">${icon}</div>
            <div class="record-body">
              <div class="record-title">${typeLabel} <span style="font-size:12px;color:#999;font-weight:400;">· ${memberName(r._createdBy)}</span></div>
              <div class="record-meta">${fmtDate(r.time)}</div>
              ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
              <div class="record-actions"><button data-del-feed="${r._id}">删除</button></div>
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
        showToast(`已保存 ${dur} 分钟 · 切换到${feedingTimerSide === 'left' ? '左' : '右'}侧`);
        renderFeeding();
        startTimerTick();
      });
      timerBar.querySelector('[data-stop]').addEventListener('click', () => {
        const dur = Math.floor((Date.now() - feedingTimerStart) / 60000);
        addRecord('feeding', { feedingType: 'breast', time: feedingTimerStart, duration: dur, side: feedingTimerSide, notes: '' });
        clearInterval(feedingTimer);
        feedingTimer = null;
        showToast(`已保存 ${dur} 分钟`);
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
        if (!confirm('确定删除？')) return;
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
        <span class="modal-title">添加喂养记录</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">类型</label>
          <div class="segmented" data-seg="type">
            <button class="active" data-val="breast">🤱 母乳</button>
            <button data-val="formula">🍼 配方奶</button>
            <button data-val="solid">🍚 辅食</button>
          </div>
        </div>
        <div id="feedFields"></div>
        <div class="form-group">
          <label class="form-label">时间</label>
          <input class="form-input" type="datetime-local" id="feedTime" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="feedNotes" placeholder="可选"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
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
          <div class="form-group"><label class="form-label">时长（分钟）</label><input class="form-input" type="number" id="feedDuration" min="1" max="60" value="15" /></div>
          <div class="form-group"><label class="form-label">侧别</label>
            <div class="segmented" data-seg="side"><button class="active" data-val="left">左</button><button data-val="right">右</button><button data-val="both">双</button></div>
          </div></div>`;
        fields.querySelectorAll('[data-seg="side"] button').forEach(b => {
          b.addEventListener('click', () => {
            fields.querySelectorAll('[data-seg="side"] button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
          });
        });
      } else if (currentType === 'formula') {
        fields.innerHTML = `<div class="form-group"><label class="form-label">奶量 (ml)</label><input class="form-input" type="number" id="feedAmount" min="10" max="500" step="10" value="120" /></div>`;
      } else {
        fields.innerHTML = `<div class="form-group"><label class="form-label">食物</label><input class="form-input" id="feedFood" placeholder="米糊、苹果泥" /></div>`;
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
      showToast('已记录');
      if ($('#view-feeding').classList.contains('active')) renderFeeding();
    });
  }

  // ========== 疫苗 ==========
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
        currentVaccineTab === 'upcoming' ? '暂无即将接种 🎉' :
        currentVaccineTab === 'overdue' ? '没有逾期未种 🎉' :
        '还没有完成的接种记录'
      }</div>`;
      return;
    }
    container.innerHTML = filtered.map(v => {
      let timeHtml, cls;
      if (v.completed) {
        cls = 'done';
        timeHtml = `<span class="vaccine-time">✅ ${fmtDateShort(v.completedData.time)}</span>`;
      } else if (v.overdue) {
        cls = 'overdue';
        const days = Math.floor((Date.now() - v.scheduledDate) / (1000 * 60 * 60 * 24));
        timeHtml = `<span class="vaccine-time">逾期 ${days} 天</span>`;
      } else {
        cls = 'upcoming';
        const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
        timeHtml = `<span class="vaccine-time">${days === 0 ? '⏰ 今天' : `${days} 天后 · ${fmtDateShort(v.scheduledDate)}`}</span>`;
      }
      const catBadge = v.category === 'optional' ? '<span style="background:#FFF3E0;color:#F57C00;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px;">自费</span>' : '';
      return `<div class="vaccine-card ${cls}">
        <div class="vaccine-name">${escapeHtml(v.name)}${catBadge}</div>
        <div class="vaccine-dose">${escapeHtml(v.dose)}</div>
        ${timeHtml}
        <div class="vaccine-desc">${escapeHtml(v.description)}</div>
        <div class="vaccine-actions">
          ${!v.completed ? `<button class="vaccine-mark-btn" data-mark="${v.id}">标记已接种</button>` : ''}
          <button class="vaccine-detail-btn" data-detail="${v.id}">查看说明</button>
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
        <span class="modal-title">完成接种 · ${escapeHtml(v.name)}</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">${escapeHtml(v.dose)}</label>
          <p style="color:#888;font-size:13px;">${escapeHtml(v.description)}</p>
        </div>
        <div class="form-group">
          <label class="form-label">接种日期 *</label>
          <input class="form-input" type="date" id="vDate" value="${fmtDateShort(new Date())}" />
        </div>
        <div class="form-group">
          <label class="form-label">接种地点</label>
          <input class="form-input" id="vLocation" placeholder="社区卫生服务中心" />
        </div>
        <div class="form-group">
          <label class="form-label">疫苗批号</label>
          <input class="form-input" id="vBatch" placeholder="可选" />
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="vNotes" placeholder="如：接种后反应等"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">确认</button>
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
      showToast('🎉 已记录');
      renderVaccines();
      renderDashboard();
    });
  }

  function openVaccineDetail(v) {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(v.name)} ${escapeHtml(v.dose)}</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><p style="color:#666;line-height:1.7;">${escapeHtml(v.description)}</p></div>
        <div class="form-group"><label class="form-label">推荐接种时间</label><p style="color:#4A4A4A;font-size:15px;">${fmtDateShort(v.scheduledDate)}</p></div>
        <div class="form-group">
          <label class="form-label">接种提示</label>
          <ul style="padding-left:20px;color:#666;font-size:13px;line-height:1.9;">
            <li>接种前确保宝宝身体健康，无发热等症状</li>
            <li>接种后留观 30 分钟</li>
            <li>接种部位 24 小时内避免沾水</li>
            <li>注意观察是否有发热、红肿等不良反应</li>
            <li>按时完成后续剂次</li>
          </ul>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">关闭</button>
        ${!v.completed ? `<button class="btn-primary" data-action="mark">标记已接种</button>` : ''}
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
        <span class="modal-title">💉 国家免疫规划疫苗</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <p style="color:#666;line-height:1.7;margin-bottom:12px;">国家免疫规划疫苗由政府免费提供，按时接种可有效预防多种婴幼儿传染病。</p>
        <p style="color:#666;line-height:1.7;margin-bottom:12px;"><strong>自费疫苗</strong>为推荐但非强制的疫苗，可在医生建议下选择接种。</p>
        <p style="color:#888;font-size:12px;background:#FFF5F7;padding:10px;border-radius:8px;">⚠️ 本应用仅供参考。具体接种程序以当地疾控中心和儿童预防接种证为准。</p>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">了解</button>
      </div>
    `);
    $('#modalContainer').querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  // ========== 尿布 ==========
  function renderDiapers() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.diaper || []).slice().sort((a, b) => (b.time || 0) - (a.time || 0));
    const container = $('#diaperList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">还没有尿布记录</div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const icon = r.diaperType === 'wet' ? '💧' : r.diaperType === 'dirty' ? '💩' : '🔄';
      const typeLabel = r.diaperType === 'wet' ? '小便' : r.diaperType === 'dirty' ? '大便' : '混合';
      return `<div class="record-card diaper">
        <div class="record-icon">${icon}</div>
        <div class="record-body">
          <div class="record-title">换尿布 · ${typeLabel} <span style="font-size:12px;color:#999;font-weight:400;">· ${memberName(r._createdBy)}</span></div>
          <div class="record-meta">${fmtDate(r.time)}</div>
          ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
          <div class="record-actions"><button data-del="${r._id}">删除</button></div>
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('删除？')) return;
      await deleteRecord(btn.dataset.del, 'diaper');
      renderDiapers();
    }));
  }

  function openDiaperModal() {
    if (babies.length === 0) return openAddBaby();
    openModal(`
      <div class="modal-header">
        <span class="modal-title">换尿布</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">类型</label>
          <div class="form-row">
            <button class="btn-secondary" data-type="wet" style="padding:14px;">💧 小便</button>
            <button class="btn-secondary" data-type="dirty" style="padding:14px;">💩 大便</button>
            <button class="btn-secondary" data-type="mixed" style="padding:14px;">🔄 混合</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">时间</label>
          <input class="form-input" type="datetime-local" id="diaperTime" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="diaperNotes" placeholder="如：稀便、颜色等"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
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
      showToast('已记录');
      renderDiapers();
    });
  }

  // ========== 睡眠 ==========
  function renderSleep() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.sleep || []).slice().sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    const container = $('#sleepList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">还没有睡眠记录</div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const ongoing = !r.endTime;
      const dur = r.endTime ? Math.round((r.endTime - r.startTime) / 60000) : null;
      const q = r.quality ? ' · ' + (r.quality === 'good' ? '😊' : r.quality === 'normal' ? '😐' : '😣') : '';
      return `<div class="record-card sleep">
        <div class="record-icon">${ongoing ? '💤' : '😴'}</div>
        <div class="record-body">
          <div class="record-title">${ongoing ? '正在入睡' : `睡了 ${Math.floor(dur/60)}h${dur%60}m`}${q} <span style="font-size:12px;color:#999;font-weight:400;">· ${memberName(r._createdBy)}</span></div>
          <div class="record-meta">${fmtDate(r.startTime)}${r.endTime ? ' ~ ' + fmtDate(r.endTime) : ''}</div>
          ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
          <div class="record-actions">
            ${ongoing ? `<button data-end="${r._id}" style="color:#66BB6A;">结束睡眠</button>` : ''}
            <button data-del="${r._id}">删除</button>
          </div>
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('删除？')) return;
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
      if (!confirm('宝宝正在入睡中，要结束这次睡眠吗？')) return;
      sb.from('records').update({ data: { ...ongoing, endTime: Date.now() }, updated_at: new Date().toISOString() }).eq('id', ongoing._id).then(() => {
        ongoing.endTime = Date.now();
        renderSleep();
        showToast('睡眠已结束');
      });
      return;
    }
    openModal(`
      <div class="modal-header">
        <span class="modal-title">添加睡眠</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">开始时间</label>
          <input class="form-input" type="datetime-local" id="sleepStart" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">结束时间</label>
          <input class="form-input" type="datetime-local" id="sleepEnd" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">睡眠质量</label>
          <div class="segmented" data-seg="quality">
            <button data-val="good">😊</button>
            <button class="active" data-val="normal">😐</button>
            <button data-val="poor">😣</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="sleepNotes" placeholder="如：夜醒2次"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-secondary" data-action="ongoing">仅开始</button>
        <button class="btn-primary" data-action="save">保存</button>
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
      showToast('已开始睡眠');
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
      showToast('已记录');
      renderSleep();
    });
  }

  // ========== 成长 ==========
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
        <div class="growth-stat-card"><div class="growth-stat-value">${last.weight ? last.weight.toFixed(2) : '--'}<span style="font-size:12px;color:#999;">kg</span></div><div class="growth-stat-label">最近体重</div></div>
        <div class="growth-stat-card"><div class="growth-stat-value">${last.height ? last.height.toFixed(1) : '--'}<span style="font-size:12px;color:#999;">cm</span></div><div class="growth-stat-label">最近身高</div></div>
        <div class="growth-stat-card"><div class="growth-stat-value">${last.headCircumference ? last.headCircumference.toFixed(1) : '--'}<span style="font-size:12px;color:#999;">cm</span></div><div class="growth-stat-label">最近头围</div></div>
      </div>`;
    }
    const tabs = `<div class="growth-tabs">
      <button class="growth-tab ${growthChartType === 'weight' ? 'active' : ''}" data-gt="weight">体重 kg</button>
      <button class="growth-tab ${growthChartType === 'height' ? 'active' : ''}" data-gt="height">身高 cm</button>
      <button class="growth-tab ${growthChartType === 'head' ? 'active' : ''}" data-gt="head">头围 cm</button>
    </div>`;
    const chartHtml = `<div class="chart-container"><canvas id="growthCanvas"></canvas></div>`;
    const listHtml = list.length === 0
      ? '<div class="empty-hint">还没有测量数据</div>'
      : list.slice().reverse().map(r => {
        const items = [];
        if (r.weight) items.push(`体重 <strong>${r.weight.toFixed(2)}</strong> kg`);
        if (r.height) items.push(`身高 <strong>${r.height.toFixed(1)}</strong> cm`);
        if (r.headCircumference) items.push(`头围 <strong>${r.headCircumference.toFixed(1)}</strong> cm`);
        return `<div class="record-card growth">
          <div class="record-icon">📏</div>
          <div class="record-body">
            <div class="record-title">${fmtDateShort(r.date)}</div>
            <div class="record-meta">${items.join(' · ')}</div>
            ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
            <div class="record-actions"><button data-del="${r._id}">删除</button></div>
          </div>
        </div>`;
      }).join('');
    container.innerHTML = summaryHtml + tabs + chartHtml + listHtml;
    container.querySelectorAll('[data-gt]').forEach(btn => btn.addEventListener('click', () => { growthChartType = btn.dataset.gt; renderGrowth(); }));
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('删除？')) return;
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
      ctx.fillText('暂无该类型数据', W/2, H/2); return;
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
    const label = growthChartType === 'weight' ? '体重 (kg)' : growthChartType === 'height' ? '身高 (cm)' : '头围 (cm)';
    ctx.fillText(label, padding.left, padding.top - 6);
  }

  function openGrowthModal() {
    if (babies.length === 0) return openAddBaby();
    openModal(`
      <div class="modal-header">
        <span class="modal-title">添加生长测量</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">测量日期</label>
          <input class="form-input" type="date" id="growthDate" value="${fmtDateShort(new Date())}" />
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">体重 (kg)</label><input class="form-input" type="number" step="0.01" id="growthWeight" placeholder="6.5" /></div>
          <div class="form-group"><label class="form-label">身高 (cm)</label><input class="form-input" type="number" step="0.1" id="growthHeight" placeholder="65" /></div>
        </div>
        <div class="form-group"><label class="form-label">头围 (cm)</label><input class="form-input" type="number" step="0.1" id="growthHead" placeholder="可选" /></div>
        <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="growthNotes" placeholder="可选"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const w = parseFloat(modal.querySelector('#growthWeight').value);
      const h = parseFloat(modal.querySelector('#growthHeight').value);
      const head = parseFloat(modal.querySelector('#growthHead').value);
      const date = new Date(modal.querySelector('#growthDate').value).getTime();
      if (!w && !h && !head) return showToast('请至少填写一项');
      await addRecord('growth', {
        date,
        weight: w || null,
        height: h || null,
        headCircumference: head || null,
        notes: modal.querySelector('#growthNotes').value.trim()
      });
      closeModal();
      showToast('已记录');
      renderGrowth();
    });
  }

  // ========== 里程碑 ==========
  function renderMilestones() {
    const baby = getCurrentBaby();
    if (!baby) return;
    const rec = records[baby.id] || {};
    const list = (rec.milestone || []).slice().sort((a, b) => (b.date || 0) - (a.date || 0));
    const container = $('#milestoneList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">还没有里程碑记录<br>记录宝宝成长的每一个"第一次"吧 ⭐</div>';
      return;
    }
    container.innerHTML = list.map(r => `
      <div class="milestone-card">
        ${r.photo ? `<img src="${r.photo}" alt="" />` : `<div class="milestone-image">${r.icon || '⭐'}</div>`}
        <div class="milestone-body">
          <div class="milestone-title">${r.icon || '⭐'} ${escapeHtml(r.title)} <span style="font-size:12px;color:#999;font-weight:400;">· ${memberName(r._createdBy)}</span></div>
          <div class="milestone-date">${fmtDateShort(r.date)} · 当时 ${ageText(baby.birth_date)}</div>
          ${r.description ? `<div class="milestone-desc">${escapeHtml(r.description)}</div>` : ''}
          <div class="record-actions" style="margin-top:8px;"><button data-del="${r._id}">删除</button></div>
        </div>
      </div>
    `).join('');
    container.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('删除？')) return;
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
        <span class="modal-title">⭐ 添加里程碑</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">常见里程碑</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${presetHtml}</div>
        </div>
        <div class="form-group"><label class="form-label">标题 *</label><input class="form-input" id="msTitle" placeholder="如：第一次叫妈妈" /></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">图标 Emoji</label><input class="form-input" id="msIcon" value="⭐" maxlength="4" /></div>
          <div class="form-group"><label class="form-label">日期</label><input class="form-input" type="date" id="msDate" value="${fmtDateShort(new Date())}" /></div>
        </div>
        <div class="form-group">
          <label class="form-label">照片</label>
          <input type="file" id="msPhoto" accept="image/*" style="font-size:13px;" />
          <div id="msPhotoPreview" style="margin-top:8px;"></div>
        </div>
        <div class="form-group"><label class="form-label">描述</label><textarea class="form-textarea" id="msDesc" placeholder="记录这个特别的瞬间..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
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
      if (!title) return showToast('请输入标题');
      await addRecord('milestone', {
        title,
        icon: modal.querySelector('#msIcon').value || '⭐',
        date: new Date(modal.querySelector('#msDate').value).getTime(),
        description: modal.querySelector('#msDesc').value.trim(),
        photo: photoData
      });
      closeModal();
      showToast('⭐ 已记录');
      renderMilestones();
    });
  }

  // ========== 家庭 / 设置面板 ==========
  async function openFamilyModal() {
    let members = [];
    try {
      const { data } = await sb.from('profiles').select('*').eq('family_id', currentFamily.id);
      members = data || [];
    } catch (err) { console.error(err); }

    openModal(`
      <div class="modal-header">
        <span class="modal-title">👨‍👩‍👧 家庭</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="family-info-card">
          <div class="family-name">${escapeHtml(currentFamily.name)}</div>
          <div class="family-invite">
            <span class="invite-label">邀请码</span>
            <span class="invite-code" id="inviteCode">${currentFamily.invite_code || '----'}</span>
            <button class="btn-secondary" data-copy-code style="padding:4px 10px;font-size:12px;">复制</button>
          </div>
          <p class="family-hint">把邀请码告诉家人，让他们在「加入家庭」处输入</p>
        </div>
        <div class="family-section">
          <h4 class="family-section-title">家庭成员 (${members.length})</h4>
          <div class="family-members">
            ${members.map(m => `
              <div class="member-item">
                <div class="member-avatar">${m.role === 'admin' ? '👑' : '👤'}</div>
                <div class="member-info">
                  <div class="member-name">${escapeHtml(m.display_name || m.username)}</div>
                  <div class="member-meta">@${escapeHtml(m.username)} · ${m.role === 'admin' ? '管理员' : '成员'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="family-section">
          <button class="btn-secondary" data-action="logout" style="width:100%;padding:12px;color:#FF6B6B;">退出登录</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">完成</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-copy-code]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentFamily.invite_code);
        showToast('已复制邀请码');
      } catch {
        showToast('复制失败：' + currentFamily.invite_code);
      }
    });
    modal.querySelector('[data-action="logout"]').addEventListener('click', () => { closeModal(); handleLogout(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  function openSettingsModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">⚙️ 设置</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <div class="settings-section-title">当前用户</div>
          <div class="settings-card">
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">@${escapeHtml(currentProfile?.username || '')}</span>
              <span class="settings-item-value">${escapeHtml(currentProfile?.display_name || '')}</span>
            </div>
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">家庭</span>
              <span class="settings-item-value">${escapeHtml(currentFamily?.name || '')}</span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">数据</div>
          <div class="settings-card">
            <div class="settings-item" data-action="reminder">
              <span class="settings-item-label">🔔 浏览器通知</span>
              <span class="settings-item-value" id="notifStatus">${Notification.permission === 'granted' ? '已开启' : '未开启'}</span>
              <span class="settings-item-arrow">›</span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">关于</div>
          <div class="settings-card">
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">萌宝成长记 v2.0</span>
              <span class="settings-item-value">云端版</span>
            </div>
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">数据存储</span>
              <span class="settings-item-value">Supabase 云端</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">完成</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="reminder"]').addEventListener('click', async () => {
      if (!('Notification' in window)) return showToast('当前浏览器不支持通知');
      const perm = await Notification.requestPermission();
      modal.querySelector('#notifStatus').textContent = perm === 'granted' ? '已开启' : '未开启';
    });
  }

  function openNotificationsPanel() {
    const upcoming = computeVaccineSchedule().filter(v => !v.completed).sort((a, b) => a.scheduledDate - b.scheduledDate).slice(0, 20);
    openModal(`
      <div class="modal-header">
        <span class="modal-title">🔔 接种提醒</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        ${upcoming.length === 0 ? '<div class="empty-hint">所有疫苗都已完成 🎉</div>' :
          upcoming.map(v => {
            const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
            const cls = v.overdue ? 'overdue' : days <= 7 ? 'due' : '';
            let meta;
            if (v.overdue) meta = `逾期 ${-days} 天`;
            else if (days === 0) meta = '⏰ 今天接种';
            else meta = `还有 ${days} 天 · ${fmtDateShort(v.scheduledDate)}`;
            return `<div class="reminder-item ${cls}">
              <div class="item-icon">💉</div>
              <div class="item-body">
                <div class="item-title">${escapeHtml(v.name)} · ${escapeHtml(v.dose)}</div>
                <div class="item-meta">${meta}</div>
              </div>
            </div>`;
          }).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">关闭</button>
      </div>
    `);
    $('#modalContainer').querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  // ========== 快捷操作 ==========
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
        <span class="modal-title">💊 用药记录</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">药品名称 *</label><input class="form-input" id="medName" placeholder="如：泰诺林" /></div>
        <div class="form-group"><label class="form-label">剂量</label><input class="form-input" id="medDose" placeholder="如：1.5ml" /></div>
        <div class="form-group"><label class="form-label">服用时间</label><input class="form-input" type="datetime-local" id="medTime" value="${datetimeLocalValue()}" /></div>
        <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="medNotes" placeholder="如：退烧用、体温38.5℃等"></textarea></div>
        <div class="form-group"><p style="color:#888;font-size:12px;background:#FFF8E1;padding:10px;border-radius:8px;">⚠️ 用药前请仔细阅读说明书或遵医嘱。</p></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const name = modal.querySelector('#medName').value.trim();
      if (!name) return showToast('请输入药品名称');
      await addRecord('milestone', {
        title: '用药: ' + name,
        icon: '💊',
        date: new Date(modal.querySelector('#medTime').value).getTime(),
        description: (modal.querySelector('#medDose').value.trim() ? '剂量：' + modal.querySelector('#medDose').value.trim() + '\n' : '') + modal.querySelector('#medNotes').value.trim()
      });
      closeModal();
      showToast('已记录');
    });
  }

  // ========== 初始化 ==========
  function init() {
    // 登录 tabs
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

    // 底部导航
    $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

    // 头部
    $('#babySwitcherBtn').addEventListener('click', openBabySwitcher);
    $('#familyBtn').addEventListener('click', openFamilyModal);
    $('#settingsBtn').addEventListener('click', openSettingsModal);
    $('#notificationsBtn').addEventListener('click', openNotificationsPanel);

    // 添加按钮
    $('#addFeedingBtn').addEventListener('click', openFeedingModal);
    $('#addDiaperBtn').addEventListener('click', openDiaperModal);
    $('#addSleepBtn').addEventListener('click', openSleepModal);
    $('#addGrowthBtn').addEventListener('click', openGrowthModal);
    $('#addMilestoneBtn').addEventListener('click', openMilestoneModal);
    $('#vaccineInfoBtn').addEventListener('click', openVaccineInfoModal);

    // 疫苗 tabs
    $$('[data-vaccine-tab]').forEach(btn => btn.addEventListener('click', () => renderVaccines(btn.dataset.vaccineTab)));

    // 快捷操作
    $$('[data-quick]').forEach(btn => btn.addEventListener('click', () => openQuickAction(btn.dataset.quick)));

    // 启动检查
    checkSession();
    setupBabyArt();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();