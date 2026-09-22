// ========================================================================
// 萌宝成长记 - 婴儿养育一体化记录应用
// 数据存储：所有数据存储在浏览器 localStorage（隐私保护，不上传服务器）
// ========================================================================

(function() {
  'use strict';

  // ========== 存储层 ==========
  const STORAGE_KEY = 'babycare_data_v1';

  const defaultData = () => ({
    babies: [],
    currentBabyId: null,
    records: {},     // { [babyId]: { feeding, diaper, sleep, growth, vaccine, milestone } }
    reminders: {},   // { [babyId]: [reminder] }
    settings: {
      units: 'metric',     // metric / imperial
      notifications: false
    }
  });

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      return Object.assign(defaultData(), JSON.parse(raw));
    } catch (e) {
      console.error('加载数据失败', e);
      return defaultData();
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('保存数据失败', e);
      showToast('保存失败：' + e.message);
    }
  }

  let state = loadData();

  // ========== 工具函数 ==========
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

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
    const birth = new Date(birthDate);
    const now = new Date();
    return (now - birth) / (1000 * 60 * 60 * 24 * 30.44);
  }

  function ageText(birthDate) {
    if (!birthDate) return '未设置生日';
    const months = ageInMonths(birthDate);
    if (months < 1) {
      const days = Math.floor((new Date() - new Date(birthDate)) / (1000 * 60 * 60 * 24));
      return `${days} 天`;
    }
    if (months < 24) return `${Math.floor(months)} 月${Math.floor((months % 1) * 30)} 天`;
    const years = Math.floor(months / 12);
    const restMonths = Math.floor(months % 12);
    return `${years} 岁${restMonths ? ' ' + restMonths + ' 月' : ''}`;
  }

  function todayStart() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }

  function isToday(ts) {
    return ts >= todayStart();
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function showToast(msg, duration = 2000) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.hidden = true, duration);
  }

  function getCurrentBaby() {
    if (!state.currentBabyId) return null;
    return state.babies.find(b => b.id === state.currentBabyId);
  }

  function getCurrentRecords() {
    const baby = getCurrentBaby();
    if (!baby) return null;
    if (!state.records[baby.id]) {
      state.records[baby.id] = {
        feeding: [], diaper: [], sleep: [], growth: [],
        vaccine: {}, milestone: []
      };
    }
    return state.records[baby.id];
  }

  // ========== 模态框 ==========
  function openModal(html, opts = {}) {
    const container = $('#modalContainer');
    container.innerHTML = `
      <div class="modal-overlay" data-mask>
        <div class="modal" role="dialog" aria-modal="true">
          ${html}
        </div>
      </div>`;
    // 点击遮罩关闭
    container.querySelector('[data-mask]').addEventListener('click', e => {
      if (e.target.matches('[data-mask]') && !opts.persist) closeModal();
    });
  }

  function closeModal() {
    $('#modalContainer').innerHTML = '';
  }

  // ========== 视图切换 ==========
  function switchView(viewName) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = $('#view-' + viewName);
    if (view) view.classList.add('active');
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');
    // 滚动到顶
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 渲染对应视图
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

  // ========== 宝宝管理 ==========
  function ensureBaby() {
    if (state.babies.length === 0) {
      // 第一次访问，引导添加宝宝
      promptAddBaby(true);
      return false;
    }
    if (!state.currentBabyId) {
      state.currentBabyId = state.babies[0].id;
      saveData();
    }
    return true;
  }

  function promptAddBaby(isFirst = false) {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">${isFirst ? '欢迎使用萌宝成长记' : '添加宝宝'}</span>
        ${!isFirst ? '<button class="modal-close" data-action="close">×</button>' : ''}
      </div>
      <div class="modal-body">
        <p style="color:#888;margin-bottom:16px;font-size:13px;">添加宝宝信息，开启养育记录之旅</p>
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
        ${!isFirst ? '<button class="btn-secondary" data-action="close">取消</button>' : ''}
        <button class="btn-primary" data-action="save">${isFirst ? '开始记录' : '保存'}</button>
      </div>
    `, { persist: isFirst });

    const container = $('#modalContainer');
    container.querySelectorAll('[data-seg="gender"] button').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-seg="gender"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const closeBtn = container.querySelector('[data-action="close"]');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    container.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      const name = container.querySelector('#babyNameInput').value.trim();
      const birth = container.querySelector('#babyBirthInput').value;
      const avatar = container.querySelector('#babyAvatarInput').value.trim() || '👶';
      const gender = container.querySelector('[data-seg="gender"] button.active').dataset.val;
      if (!name) return showToast('请输入宝宝昵称');
      if (!birth) return showToast('请选择出生日期');

      const baby = { id: uid(), name, birthDate: birth, gender, avatar, createdAt: Date.now() };
      state.babies.push(baby);
      state.currentBabyId = baby.id;
      state.records[baby.id] = { feeding: [], diaper: [], sleep: [], growth: [], vaccine: {}, milestone: [] };
      saveData();
      closeModal();
      showToast('欢迎 ' + avatar + ' ' + name);
      refreshHeader();
      renderDashboard();
    });
  }

  function openBabySwitcher() {
    if (state.babies.length === 0) {
      promptAddBaby();
      return;
    }
    const list = state.babies.map(b => `
      <div class="baby-item ${b.id === state.currentBabyId ? 'current' : ''}" data-baby-id="${b.id}">
        <div class="baby-icon">${b.avatar || '👶'}</div>
        <div class="baby-info">
          <div class="baby-name">${escapeHtml(b.name)}</div>
          <div class="baby-age">${ageText(b.birthDate)} · ${b.gender === 'male' ? '男' : b.gender === 'female' ? '女' : ''}</div>
        </div>
        <button class="record-actions" data-edit-id="${b.id}" style="font-size:18px;">✏️</button>
      </div>
    `).join('');

    openModal(`
      <div class="modal-header">
        <span class="modal-title">选择宝宝</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="baby-list">${list}</div>
        <button class="baby-add-btn" data-action="add">+ 添加新宝宝</button>
      </div>
    `);

    document.querySelectorAll('[data-baby-id]').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.matches('[data-edit-id]')) return;
        const id = item.dataset.babyId;
        state.currentBabyId = id;
        saveData();
        closeModal();
        refreshHeader();
        renderDashboard();
      });
    });
    document.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        editBaby(btn.dataset.editId);
      });
    });
    document.querySelector('[data-action="add"]').addEventListener('click', () => {
      closeModal();
      promptAddBaby();
    });
    document.querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  function editBaby(babyId) {
    const baby = state.babies.find(b => b.id === babyId);
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
            <input class="form-input" type="date" id="babyBirthInput" value="${baby.birthDate}" max="${fmtDateShort(new Date())}" />
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
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      baby.name = modal.querySelector('#babyNameInput').value.trim();
      baby.birthDate = modal.querySelector('#babyBirthInput').value;
      baby.avatar = modal.querySelector('#babyAvatarInput').value.trim() || '👶';
      baby.gender = modal.querySelector('[data-seg="gender"] button.active').dataset.val;
      saveData();
      closeModal();
      refreshHeader();
      showToast('已更新');
      renderDashboard();
    });
    modal.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`确定要删除 ${baby.name} 的所有数据吗？此操作不可恢复。`)) return;
      state.babies = state.babies.filter(b => b.id !== baby.id);
      delete state.records[baby.id];
      delete state.reminders[baby.id];
      if (state.currentBabyId === baby.id) {
        state.currentBabyId = state.babies[0]?.id || null;
      }
      saveData();
      closeModal();
      if (state.babies.length === 0) {
        promptAddBaby(true);
      } else {
        refreshHeader();
        renderDashboard();
      }
      showToast('已删除');
    });
  }

  function refreshHeader() {
    const baby = getCurrentBaby();
    if (!baby) {
      $('#currentBabyAvatar').textContent = '👶';
      $('#babySubtitle').textContent = '添加宝宝开始记录';
      return;
    }
    $('#currentBabyAvatar').textContent = baby.avatar || '👶';
    $('#babySubtitle').textContent = `${baby.name} · ${ageText(baby.birthDate)}`;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ========== 仪表板 ==========
  function renderDashboard() {
    const baby = getCurrentBaby();
    if (!baby) return;

    // 问候语
    const h = new Date().getHours();
    let greeting = '早上好 ☀️';
    if (h >= 11 && h < 14) greeting = '中午好 🌞';
    else if (h >= 14 && h < 18) greeting = '下午好 🌤️';
    else if (h >= 18 && h < 22) greeting = '晚上好 🌙';
    else if (h >= 22 || h < 6) greeting = '夜深了 🌛';

    $('#greeting').textContent = greeting + '，' + baby.name;
    const week = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
    $('#todayDate').textContent = `${fmtDateShort(new Date())} 周${week}`;

    // 统计
    const records = getCurrentRecords();
    const ts = todayStart();
    const todayFeedings = records.feeding.filter(r => r.time >= ts);
    const todayDiapers = records.diaper.filter(r => r.time >= ts);
    const todaySleeps = records.sleep.filter(r => r.startTime >= ts);
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

    // 提醒列表
    renderDashboardReminders();
    // 近期记录
    renderRecentRecords();
  }

  function renderDashboardReminders() {
    const upcoming = computeVaccineSchedule()
      .filter(v => !v.completed)
      .sort((a, b) => a.scheduledDate - b.scheduledDate)
      .slice(0, 3);

    const overdue = upcoming.filter(v => v.overdue);

    const list = $('#dashboardReminders');
    if (overdue.length + upcoming.length === 0) {
      list.innerHTML = '<div class="empty-hint">暂无待办提醒</div>';
      $('#reminderBadge').hidden = true;
      return;
    }
    const items = overdue.concat(upcoming.slice(0, 3)).slice(0, 4).map(v => {
      const days = Math.ceil((v.scheduledDate - Date.now()) / (1000 * 60 * 60 * 24));
      let meta;
      if (v.completed) {
        meta = '✅ 已接种';
      } else if (v.overdue) {
        meta = `逾期 ${-days} 天`;
      } else if (days === 0) {
        meta = '⏰ 今天接种';
      } else {
        meta = `还有 ${days} 天`;
      }
      const cls = v.completed ? '' : v.overdue ? 'overdue' : (days <= 7 ? 'due' : '');
      return `
        <div class="reminder-item ${cls}" data-vaccine-id="${v.id}">
          <div class="item-icon">💉</div>
          <div class="item-body">
            <div class="item-title">${escapeHtml(v.name)} · ${escapeHtml(v.dose)}</div>
            <div class="item-meta">${fmtDateShort(v.scheduledDate)} · ${meta}</div>
          </div>
          <span class="item-arrow">›</span>
        </div>`;
    }).join('');
    list.innerHTML = items;

    list.querySelectorAll('[data-vaccine-id]').forEach(item => {
      item.addEventListener('click', () => switchView('vaccines'));
    });

    const pending = overdue.length + upcoming.filter(v => !v.completed).length;
    if (pending > 0) {
      $('#reminderBadge').textContent = pending;
      $('#reminderBadge').hidden = false;
    } else {
      $('#reminderBadge').hidden = true;
    }
  }

  function renderRecentRecords() {
    const records = getCurrentRecords();
    const ts = todayStart();
    const all = [];
    records.feeding.forEach(r => all.push({ ...r, _type: 'feeding' }));
    records.diaper.forEach(r => all.push({ ...r, _type: 'diaper' }));
    records.sleep.forEach(r => all.push({ ...r, _type: 'sleep' }));
    const today = all.filter(r => (r.time || r.startTime) >= ts)
      .sort((a, b) => (b.time || b.startTime) - (a.time || a.startTime))
      .slice(0, 6);

    const list = $('#recentRecords');
    if (today.length === 0) {
      list.innerHTML = '<div class="empty-hint">今天还没有记录，使用上方快捷按钮开始记录</div>';
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
            <div class="item-meta">${fmtTime(r.time)}</div>
          </div>
        </div>`;
      } else if (r._type === 'diaper') {
        const icon = r.diaperType === 'wet' ? '💧' : r.diaperType === 'dirty' ? '💩' : '🔄';
        const typeLabel = r.diaperType === 'wet' ? '小便' : r.diaperType === 'dirty' ? '大便' : '混合';
        return `<div class="recent-item">
          <div class="item-icon">${icon}</div>
          <div class="item-body">
            <div class="item-title">换尿布 · ${typeLabel}</div>
            <div class="item-meta">${fmtTime(r.time)}</div>
          </div>
        </div>`;
      } else if (r._type === 'sleep') {
        const dur = r.endTime ? Math.round((r.endTime - r.startTime) / 60000) : null;
        return `<div class="recent-item">
          <div class="item-icon">😴</div>
          <div class="item-body">
            <div class="item-title">${dur != null ? `睡了 ${Math.floor(dur/60)}h${dur%60}m` : '入睡中'}</div>
            <div class="item-meta">${fmtTime(r.startTime)}${dur != null ? ' ~ ' + fmtTime(r.endTime) : ''}</div>
          </div>
        </div>`;
      }
    }).join('');
  }

  // ========== 喂养记录 ==========
  let feedingTimer = null;
  let feedingTimerStart = 0;
  let feedingTimerSide = 'left';

  function renderFeeding() {
    const records = getCurrentRecords();
    const list = records.feeding.slice().sort((a, b) => b.time - a.time);
    const container = $('#feedingList');

    let timerHtml = '';
    if (feedingTimer) {
      const elapsed = Math.floor((Date.now() - feedingTimerStart) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      timerHtml = `
        <div class="timer-bar">
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
      timerHtml = `
        <div class="timer-bar">
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
              <div class="record-title">${typeLabel}</div>
              <div class="record-meta">${fmtDate(r.time)}</div>
              ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
              <div class="record-actions">
                <button data-del-feed="${r.id}">删除</button>
              </div>
            </div>
          </div>`;
        }).join('');

    container.innerHTML = timerHtml + listHtml;

    // 计时器事件
    const timerBar = container.querySelector('.timer-bar');
    if (feedingTimer) {
      timerBar.querySelector('[data-side-switch]').addEventListener('click', () => {
        // 切换侧别时把当前时长保存为一条
        const dur = Math.floor((Date.now() - feedingTimerStart) / 60000);
        addFeeding({ feedingType: 'breast', time: feedingTimerStart, duration: dur, side: feedingTimerSide, notes: '' });
        feedingTimerSide = feedingTimerSide === 'left' ? 'right' : 'left';
        feedingTimerStart = Date.now();
        showToast(`已保存 ${dur} 分钟 · 切换到${feedingTimerSide === 'left' ? '左' : '右'}侧`);
        renderFeeding();
        startTimerTick();
      });
      timerBar.querySelector('[data-stop]').addEventListener('click', () => {
        const dur = Math.floor((Date.now() - feedingTimerStart) / 60000);
        addFeeding({ feedingType: 'breast', time: feedingTimerStart, duration: dur, side: feedingTimerSide, notes: '' });
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

    // 删除
    container.querySelectorAll('[data-del-feed]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('确定删除这条记录？')) return;
        const records = getCurrentRecords();
        records.feeding = records.feeding.filter(r => r.id !== btn.dataset.delFeed);
        saveData();
        renderFeeding();
        showToast('已删除');
      });
    });
  }

  let timerTickInterval = null;
  function startTimerTick() {
    clearInterval(timerTickInterval);
    timerTickInterval = setInterval(() => {
      const display = document.querySelector('.timer-display');
      if (!display || !feedingTimer) {
        clearInterval(timerTickInterval);
        return;
      }
      const elapsed = Math.floor((Date.now() - feedingTimerStart) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      display.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }, 1000);
  }

  function addFeeding(data) {
    const records = getCurrentRecords();
    records.feeding.push({ id: uid(), time: Date.now(), ...data });
    saveData();
  }

  // 喂养手动添加
  function openFeedingModal() {
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
        fields.innerHTML = `
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">时长（分钟）</label>
              <input class="form-input" type="number" id="feedDuration" min="1" max="60" value="15" />
            </div>
            <div class="form-group">
              <label class="form-label">侧别</label>
              <div class="segmented" data-seg="side">
                <button class="active" data-val="left">左</button>
                <button data-val="right">右</button>
                <button data-val="both">双</button>
              </div>
            </div>
          </div>`;
        fields.querySelectorAll('[data-seg="side"] button').forEach(b => {
          b.addEventListener('click', () => {
            fields.querySelectorAll('[data-seg="side"] button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
          });
        });
      } else if (currentType === 'formula') {
        fields.innerHTML = `
          <div class="form-group">
            <label class="form-label">奶量 (ml)</label>
            <input class="form-input" type="number" id="feedAmount" min="10" max="500" step="10" value="120" />
          </div>`;
      } else {
        fields.innerHTML = `
          <div class="form-group">
            <label class="form-label">食物</label>
            <input class="form-input" id="feedFood" placeholder="例如：米糊、苹果泥" />
          </div>`;
      }
    }
    renderFeedFields();

    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
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
      addFeeding(data);
      closeModal();
      showToast('已记录');
      if ($('#view-feeding').classList.contains('active')) renderFeeding();
    });
  }

  function datetimeLocalValue() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ========== 疫苗 ==========
  function computeVaccineSchedule() {
    const baby = getCurrentBaby();
    if (!baby) return [];
    const records = getCurrentRecords();
    const birth = new Date(baby.birthDate);
    return window.VACCINE_SCHEDULE.map(v => {
      const scheduled = new Date(birth);
      scheduled.setMonth(scheduled.getMonth() + v.monthsFromBirth);
      const completed = records.vaccine[v.id];
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
    if (currentVaccineTab === 'upcoming') {
      filtered = all.filter(v => !v.completed && !v.overdue).sort((a, b) => a.scheduledDate - b.scheduledDate);
    } else if (currentVaccineTab === 'overdue') {
      filtered = all.filter(v => v.overdue).sort((a, b) => a.scheduledDate - b.scheduledDate);
    } else {
      filtered = all.filter(v => v.completed).sort((a, b) => b.completedData.time - a.completedData.time);
    }

    // 更新tab高亮
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-vaccine-tab="${currentVaccineTab}"]`).classList.add('active');

    const container = $('#vaccineList');
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-hint">${
        currentVaccineTab === 'upcoming' ? '暂无即将接种的疫苗 🎉' :
        currentVaccineTab === 'overdue' ? '没有逾期未种的疫苗，做得很好！' :
        '还没有完成的接种记录'
      }</div>`;
      return;
    }
    container.innerHTML = filtered.map(v => {
      let timeHtml;
      let cls;
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

      return `
        <div class="vaccine-card ${cls}">
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

    container.querySelectorAll('[data-mark]').forEach(btn => {
      btn.addEventListener('click', () => openVaccineMarkModal(btn.dataset.mark));
    });
    container.querySelectorAll('[data-detail]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = all.find(x => x.id === btn.dataset.detail);
        if (v) openVaccineDetail(v);
      });
    });
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
          <input class="form-input" id="vLocation" placeholder="例如：社区卫生服务中心" />
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
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const records = getCurrentRecords();
      records.vaccine[vaccineId] = {
        time: new Date(modal.querySelector('#vDate').value).getTime(),
        location: modal.querySelector('#vLocation').value.trim(),
        batch: modal.querySelector('#vBatch').value.trim(),
        notes: modal.querySelector('#vNotes').value.trim()
      };
      saveData();
      closeModal();
      showToast('🎉 已记录接种信息');
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
        <div class="form-group">
          <p style="color:#666;line-height:1.7;">${escapeHtml(v.description)}</p>
        </div>
        <div class="form-group">
          <label class="form-label">推荐接种时间</label>
          <p style="color:#4A4A4A;font-size:15px;">${fmtDateShort(v.scheduledDate)}</p>
        </div>
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
        ${v.completed ? `
          <div class="form-group">
            <label class="form-label">接种记录</label>
            <div style="background:#F5F5F5;padding:10px;border-radius:8px;font-size:13px;color:#666;">
              <div>📅 接种时间：${fmtDate(v.completedData.time)}</div>
              ${v.completedData.location ? `<div>📍 地点：${escapeHtml(v.completedData.location)}</div>` : ''}
              ${v.completedData.batch ? `<div>🔖 批号：${escapeHtml(v.completedData.batch)}</div>` : ''}
              ${v.completedData.notes ? `<div>📝 备注：${escapeHtml(v.completedData.notes)}</div>` : ''}
            </div>
          </div>
        ` : ''}
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
        <p style="color:#666;line-height:1.7;margin-bottom:12px;">
          国家免疫规划疫苗由政府免费提供，按时接种可有效预防多种婴幼儿传染病。
        </p>
        <p style="color:#666;line-height:1.7;margin-bottom:12px;">
          <strong>自费疫苗</strong>为推荐但非强制的疫苗，可在医生建议下选择接种。
        </p>
        <p style="color:#888;font-size:12px;background:#FFF5F7;padding:10px;border-radius:8px;">
          ⚠️ 本应用仅供参考。具体接种程序以当地疾控中心和儿童预防接种证为准。如有疑问请咨询专业医生。
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="close">了解</button>
      </div>
    `);
    $('#modalContainer').querySelector('[data-action="close"]').addEventListener('click', closeModal);
  }

  // ========== 尿布 ==========
  function renderDiapers() {
    const records = getCurrentRecords();
    const list = records.diaper.slice().sort((a, b) => b.time - a.time);
    const container = $('#diaperList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">还没有尿布记录，点击右上角添加</div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const icon = r.diaperType === 'wet' ? '💧' : r.diaperType === 'dirty' ? '💩' : '🔄';
      const typeLabel = r.diaperType === 'wet' ? '小便' : r.diaperType === 'dirty' ? '大便' : '混合';
      const extra = r.diaperType === 'dirty' && r.consistency ? ` · ${r.consistency}` : '';
      return `<div class="record-card diaper">
        <div class="record-icon">${icon}</div>
        <div class="record-body">
          <div class="record-title">换尿布 · ${typeLabel}${extra}</div>
          <div class="record-meta">${fmtDate(r.time)}</div>
          ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
          <div class="record-actions">
            <button data-del="${r.id}">删除</button>
          </div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('删除这条记录？')) return;
        const records = getCurrentRecords();
        records.diaper = records.diaper.filter(r => r.id !== btn.dataset.del);
        saveData();
        renderDiapers();
        showToast('已删除');
      });
    });
  }

  function openDiaperModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">换尿布</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">类型</label>
          <div class="form-row">
            <button class="btn-secondary" data-type="wet" style="padding:14px;font-size:15px;">💧 小便</button>
            <button class="btn-secondary" data-type="dirty" style="padding:14px;font-size:15px;">💩 大便</button>
            <button class="btn-secondary" data-type="mixed" style="padding:14px;font-size:15px;">🔄 混合</button>
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
        modal.querySelectorAll('[data-type]').forEach(b => b.style.background = '');
        modal.querySelectorAll('[data-type]').forEach(b => b.style.color = '');
        btn.style.background = '#FFB7C5';
        btn.style.color = 'white';
        selectedType = btn.dataset.type;
      });
    });
    modal.querySelector('[data-type="wet"]').click();
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const records = getCurrentRecords();
      records.diaper.push({
        id: uid(),
        diaperType: selectedType,
        time: new Date(modal.querySelector('#diaperTime').value).getTime(),
        notes: modal.querySelector('#diaperNotes').value.trim()
      });
      saveData();
      closeModal();
      showToast('已记录');
      renderDiapers();
    });
  }

  // ========== 睡眠 ==========
  function renderSleep() {
    const records = getCurrentRecords();
    const list = records.sleep.slice().sort((a, b) => b.startTime - a.startTime);
    const container = $('#sleepList');
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-hint">还没有睡眠记录</div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const ongoing = !r.endTime;
      const dur = r.endTime ? Math.round((r.endTime - r.startTime) / 60000) : null;
      const q = r.quality ? ' · ' + (r.quality === 'good' ? '😊 良好' : r.quality === 'normal' ? '😐 一般' : '😣 较差') : '';
      return `<div class="record-card sleep">
        <div class="record-icon">${ongoing ? '💤' : '😴'}</div>
        <div class="record-body">
          <div class="record-title">${ongoing ? '正在入睡' : `睡了 ${Math.floor(dur/60)}h${dur%60}m`}${q}</div>
          <div class="record-meta">${fmtDate(r.startTime)}${r.endTime ? ' ~ ' + fmtDate(r.endTime) : ''}</div>
          ${r.notes ? `<div class="record-notes">${escapeHtml(r.notes)}</div>` : ''}
          <div class="record-actions">
            ${ongoing ? `<button data-end="${r.id}" style="color:#66BB6A;">结束睡眠</button>` : ''}
            <button data-del="${r.id}">删除</button>
          </div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('删除这条记录？')) return;
        const records = getCurrentRecords();
        records.sleep = records.sleep.filter(r => r.id !== btn.dataset.del);
        saveData();
        renderSleep();
      });
    });
    container.querySelectorAll('[data-end]').forEach(btn => {
      btn.addEventListener('click', () => {
        const records = getCurrentRecords();
        const s = records.sleep.find(r => r.id === btn.dataset.end);
        if (s) s.endTime = Date.now();
        saveData();
        renderSleep();
        showToast('睡眠已记录');
      });
    });
  }

  function openSleepModal() {
    const records = getCurrentRecords();
    const ongoing = records.sleep.find(s => !s.endTime);
    if (ongoing) {
      // 直接结束当前睡眠
      if (!confirm('宝宝正在入睡中，要结束这次睡眠吗？')) return;
      ongoing.endTime = Date.now();
      saveData();
      renderSleep();
      showToast('睡眠已结束');
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
          <label class="form-label">结束时间（可稍后结束）</label>
          <input class="form-input" type="datetime-local" id="sleepEnd" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">睡眠质量</label>
          <div class="segmented" data-seg="quality">
            <button data-val="good">😊 良好</button>
            <button class="active" data-val="normal">😐 一般</button>
            <button data-val="poor">😣 较差</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="sleepNotes" placeholder="如：夜醒2次、哄睡困难等"></textarea>
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
    modal.querySelector('[data-action="ongoing"]').addEventListener('click', () => {
      const records = getCurrentRecords();
      records.sleep.push({
        id: uid(),
        startTime: new Date(modal.querySelector('#sleepStart').value).getTime(),
        endTime: null,
        quality: modal.querySelector('[data-seg="quality"] button.active').dataset.val,
        notes: modal.querySelector('#sleepNotes').value.trim()
      });
      saveData();
      closeModal();
      showToast('已开始睡眠');
      renderSleep();
    });
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const records = getCurrentRecords();
      records.sleep.push({
        id: uid(),
        startTime: new Date(modal.querySelector('#sleepStart').value).getTime(),
        endTime: new Date(modal.querySelector('#sleepEnd').value).getTime(),
        quality: modal.querySelector('[data-seg="quality"] button.active').dataset.val,
        notes: modal.querySelector('#sleepNotes').value.trim()
      });
      saveData();
      closeModal();
      showToast('已记录');
      renderSleep();
    });
  }

  // ========== 成长曲线 ==========
  let growthChartType = 'weight';

  function renderGrowth() {
    const records = getCurrentRecords();
    const list = records.growth.slice().sort((a, b) => a.date - b.date);
    const container = $('#growthContent');

    let summaryHtml = '';
    if (list.length > 0) {
      const last = list[list.length - 1];
      summaryHtml = `
        <div class="growth-stats">
          <div class="growth-stat-card">
            <div class="growth-stat-value">${last.weight ? last.weight.toFixed(2) : '--'}<span style="font-size:12px;color:#999;">kg</span></div>
            <div class="growth-stat-label">最近体重</div>
          </div>
          <div class="growth-stat-card">
            <div class="growth-stat-value">${last.height ? last.height.toFixed(1) : '--'}<span style="font-size:12px;color:#999;">cm</span></div>
            <div class="growth-stat-label">最近身高</div>
          </div>
          <div class="growth-stat-card">
            <div class="growth-stat-value">${last.headCircumference ? last.headCircumference.toFixed(1) : '--'}<span style="font-size:12px;color:#999;">cm</span></div>
            <div class="growth-stat-label">最近头围</div>
          </div>
        </div>`;
    }

    const tabs = `
      <div class="growth-tabs">
        <button class="growth-tab ${growthChartType === 'weight' ? 'active' : ''}" data-gt="weight">体重 kg</button>
        <button class="growth-tab ${growthChartType === 'height' ? 'active' : ''}" data-gt="height">身高 cm</button>
        <button class="growth-tab ${growthChartType === 'head' ? 'active' : ''}" data-gt="head">头围 cm</button>
      </div>`;

    const chartHtml = `<div class="chart-container"><canvas id="growthCanvas"></canvas></div>`;

    const listHtml = list.length === 0
      ? '<div class="empty-hint">还没有测量数据\n建议每月记录一次宝宝的生长数据</div>'
      : `<div>${list.slice().reverse().map(r => {
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
            <div class="record-actions">
              <button data-del="${r.id}">删除</button>
            </div>
          </div>
        </div>`;
      }).join('')}</div>`;

    container.innerHTML = summaryHtml + tabs + chartHtml + listHtml;

    container.querySelectorAll('[data-gt]').forEach(btn => {
      btn.addEventListener('click', () => {
        growthChartType = btn.dataset.gt;
        renderGrowth();
      });
    });
    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('删除这条记录？')) return;
        const records = getCurrentRecords();
        records.growth = records.growth.filter(r => r.id !== btn.dataset.del);
        saveData();
        renderGrowth();
      });
    });

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
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无该类型数据', W/2, H/2);
      return;
    }

    const minX = data[0].x;
    const maxX = data[data.length-1].x;
    const rangeX = Math.max(maxX - minX, 86400000);
    const ys = data.map(d => d.y);
    const minY = Math.min(...ys) * 0.95;
    const maxY = Math.max(...ys) * 1.05;

    // 网格
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH * i / 4);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();
    }

    // Y 轴标签
    ctx.fillStyle = '#999';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = minY + (maxY - minY) * (1 - i / 4);
      const y = padding.top + (chartH * i / 4);
      ctx.fillText(v.toFixed(1), padding.left - 6, y + 4);
    }

    // X 轴标签
    ctx.textAlign = 'center';
    const xLabelCount = Math.min(data.length, 4);
    for (let i = 0; i < xLabelCount; i++) {
      const idx = Math.floor(i * (data.length - 1) / Math.max(xLabelCount - 1, 1));
      const x = padding.left + ((data[idx].x - minX) / rangeX) * chartW;
      const lbl = fmtDateShort(data[idx].x).slice(5);
      ctx.fillText(lbl, x, H - padding.bottom + 18);
    }

    // 折线
    ctx.strokeStyle = '#FFB7C5';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + ((d.x - minX) / rangeX) * chartW;
      const y = padding.top + (1 - (d.y - minY) / (maxY - minY)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 渐变填充
    const grad = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
    grad.addColorStop(0, 'rgba(255,183,197,0.3)');
    grad.addColorStop(1, 'rgba(255,183,197,0.02)');
    ctx.fillStyle = grad;
    ctx.lineTo(padding.left + ((data[data.length-1].x - minX) / rangeX) * chartW, H - padding.bottom);
    ctx.lineTo(padding.left, H - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // 数据点
    data.forEach(d => {
      const x = padding.left + ((d.x - minX) / rangeX) * chartW;
      const y = padding.top + (1 - (d.y - minY) / (maxY - minY)) * chartH;
      ctx.fillStyle = '#FF99AD';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 标题
    ctx.fillStyle = '#4A4A4A';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    const label = growthChartType === 'weight' ? '体重 (kg)' : growthChartType === 'height' ? '身高 (cm)' : '头围 (cm)';
    ctx.fillText(label, padding.left, padding.top - 6);
  }

  function openGrowthModal() {
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
          <div class="form-group">
            <label class="form-label">体重 (kg)</label>
            <input class="form-input" type="number" step="0.01" id="growthWeight" placeholder="如：6.5" />
          </div>
          <div class="form-group">
            <label class="form-label">身高 (cm)</label>
            <input class="form-input" type="number" step="0.1" id="growthHeight" placeholder="如：65" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">头围 (cm)</label>
          <input class="form-input" type="number" step="0.1" id="growthHead" placeholder="可选" />
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="growthNotes" placeholder="可选"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const w = parseFloat(modal.querySelector('#growthWeight').value);
      const h = parseFloat(modal.querySelector('#growthHeight').value);
      const head = parseFloat(modal.querySelector('#growthHead').value);
      const date = new Date(modal.querySelector('#growthDate').value).getTime();
      if (!w && !h && !head) return showToast('请至少填写一项测量值');
      const records = getCurrentRecords();
      records.growth.push({
        id: uid(),
        date,
        weight: w || null,
        height: h || null,
        headCircumference: head || null,
        notes: modal.querySelector('#growthNotes').value.trim()
      });
      saveData();
      closeModal();
      showToast('已记录');
      renderGrowth();
    });
  }

  // ========== 里程碑 ==========
  function renderMilestones() {
    const records = getCurrentRecords();
    const list = records.milestone.slice().sort((a, b) => b.date - a.date);
    const container = $('#milestoneList');
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-hint">
          还没有里程碑记录<br>
          记录宝宝成长的每一个"第一次"吧 ⭐
        </div>`;
      return;
    }
    container.innerHTML = list.map(r => `
      <div class="milestone-card">
        ${r.photo ? `<img src="${r.photo}" alt="" />` : `<div class="milestone-image">${r.icon || '⭐'}</div>`}
        <div class="milestone-body">
          <div class="milestone-title">${r.icon || '⭐'} ${escapeHtml(r.title)}</div>
          <div class="milestone-date">${fmtDateShort(r.date)} · 当时 ${ageText(r.babyBirthDate)}</div>
          ${r.description ? `<div class="milestone-desc">${escapeHtml(r.description)}</div>` : ''}
          <div class="record-actions" style="margin-top:8px;">
            <button data-del="${r.id}">删除</button>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('删除这条记录？')) return;
        const records = getCurrentRecords();
        records.milestone = records.milestone.filter(r => r.id !== btn.dataset.del);
        saveData();
        renderMilestones();
      });
    });
  }

  function openMilestoneModal() {
    const presets = window.MILESTONE_PRESETS;
    const presetHtml = presets.map((p, i) => `
      <button class="btn-secondary" data-preset="${i}" style="padding:10px;font-size:13px;">${p.icon} ${escapeHtml(p.title)}</button>
    `).join('');

    openModal(`
      <div class="modal-header">
        <span class="modal-title">⭐ 添加里程碑</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">常见里程碑参考</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${presetHtml}</div>
        </div>
        <div class="form-group">
          <label class="form-label">标题 *</label>
          <input class="form-input" id="msTitle" placeholder="例如：第一次叫妈妈" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">图标 Emoji</label>
            <input class="form-input" id="msIcon" value="⭐" maxlength="4" />
          </div>
          <div class="form-group">
            <label class="form-label">日期</label>
            <input class="form-input" type="date" id="msDate" value="${fmtDateShort(new Date())}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">照片</label>
          <input type="file" id="msPhoto" accept="image/*" style="font-size:13px;" />
          <div id="msPhotoPreview" style="margin-top:8px;"></div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea" id="msDesc" placeholder="记录这个特别的瞬间..."></textarea>
        </div>
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
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const title = modal.querySelector('#msTitle').value.trim();
      if (!title) return showToast('请输入标题');
      const baby = getCurrentBaby();
      const records = getCurrentRecords();
      records.milestone.push({
        id: uid(),
        title,
        icon: modal.querySelector('#msIcon').value || '⭐',
        date: new Date(modal.querySelector('#msDate').value).getTime(),
        description: modal.querySelector('#msDesc').value.trim(),
        photo: photoData,
        babyBirthDate: baby.birthDate
      });
      saveData();
      closeModal();
      showToast('⭐ 已记录这个特别的瞬间');
      renderMilestones();
    });
  }

  // ========== 设置 ==========
  function openSettingsModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">⚙️ 设置</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <div class="settings-section-title">数据管理</div>
          <div class="settings-card">
            <div class="settings-item" data-action="export">
              <span class="settings-item-label">📤 导出数据</span>
              <span class="settings-item-arrow">›</span>
            </div>
            <div class="settings-item" data-action="import">
              <span class="settings-item-label">📥 导入数据</span>
              <input type="file" id="importFile" accept=".json" hidden />
              <span class="settings-item-arrow">›</span>
            </div>
            <div class="settings-item" data-action="clear">
              <span class="settings-item-label" style="color:#FF6B6B;">🗑️ 清除所有数据</span>
              <span class="settings-item-arrow">›</span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">提醒</div>
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
              <span class="settings-item-label">萌宝成长记</span>
              <span class="settings-item-value">v1.0</span>
            </div>
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">数据位置</span>
              <span class="settings-item-value">本机浏览器</span>
            </div>
            <div class="settings-item" style="cursor:default;">
              <span class="settings-item-label">隐私</span>
              <span class="settings-item-value">本地存储不上传</span>
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
    modal.querySelector('[data-action="export"]').addEventListener('click', () => {
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `萌宝成长记-备份-${fmtDateShort(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出备份文件');
    });
    modal.querySelector('[data-action="import"]').addEventListener('click', () => {
      modal.querySelector('#importFile').click();
    });
    modal.querySelector('#importFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.babies) throw new Error('数据格式不正确');
          if (!confirm('导入数据将覆盖当前数据，是否继续？')) return;
          state = Object.assign(defaultData(), data);
          saveData();
          closeModal();
          refreshHeader();
          showToast('已导入');
          switchView('dashboard');
        } catch (err) {
          showToast('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
    });
    modal.querySelector('[data-action="clear"]').addEventListener('click', () => {
      if (!confirm('确定清除所有数据？此操作不可恢复。')) return;
      if (!confirm('再次确认：将删除所有宝宝和记录')) return;
      state = defaultData();
      saveData();
      closeModal();
      promptAddBaby(true);
    });
    modal.querySelector('[data-action="reminder"]').addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showToast('当前浏览器不支持通知');
        return;
      }
      const perm = await Notification.requestPermission();
      modal.querySelector('#notifStatus').textContent = perm === 'granted' ? '已开启' : '未开启';
      if (perm === 'granted') {
        new Notification('萌宝成长记', { body: '通知已开启，会在疫苗接种日期前提醒您 🎉', icon: '/favicon.ico' });
      }
    });
  }

  // ========== 通知面板 ==========
  function openNotificationsPanel() {
    const upcoming = computeVaccineSchedule()
      .filter(v => !v.completed)
      .sort((a, b) => a.scheduledDate - b.scheduledDate)
      .slice(0, 20);

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
            return `
              <div class="reminder-item ${cls}">
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

  // ========== 快捷操作（仪表板） ==========
  function openQuickAction(type) {
    const baby = getCurrentBaby();
    if (!baby) return promptAddBaby(true);
    switch (type) {
      case 'feeding': openFeedingModal(); break;
      case 'diaper': openDiaperModal(); break;
      case 'sleep': openSleepModal(); break;
      case 'medicine': openMedicineModal(); break;
      case 'growth': openGrowthModal(); break;
      case 'milestone': openMilestoneModal(); break;
    }
  }

  // 用药记录（轻量）
  function openMedicineModal() {
    openModal(`
      <div class="modal-header">
        <span class="modal-title">💊 用药记录</span>
        <button class="modal-close" data-action="close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">药品名称 *</label>
          <input class="form-input" id="medName" placeholder="例如：泰诺林" />
        </div>
        <div class="form-group">
          <label class="form-label">剂量</label>
          <input class="form-input" id="medDose" placeholder="如：1.5ml" />
        </div>
        <div class="form-group">
          <label class="form-label">服用时间</label>
          <input class="form-input" type="datetime-local" id="medTime" value="${datetimeLocalValue()}" />
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea" id="medNotes" placeholder="如：退烧用、体温38.5℃等"></textarea>
        </div>
        <div class="form-group">
          <p style="color:#888;font-size:12px;background:#FFF8E1;padding:10px;border-radius:8px;">
            ⚠️ 用药前请仔细阅读说明书或遵医嘱，本应用仅做记录用途。
          </p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="close">取消</button>
        <button class="btn-primary" data-action="save">保存</button>
      </div>
    `);
    const modal = $('#modalContainer');
    modal.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    modal.querySelector('[data-action="save"]').addEventListener('click', () => {
      const name = modal.querySelector('#medName').value.trim();
      if (!name) return showToast('请输入药品名称');
      // 把用药记录存到 milestones 里复用
      const records = getCurrentRecords();
      records.milestone.push({
        id: uid(),
        title: `用药: ${name}`,
        icon: '💊',
        date: new Date(modal.querySelector('#medTime').value).getTime(),
        description: `${modal.querySelector('#medDose').value.trim() ? '剂量：' + modal.querySelector('#medDose').value.trim() + '\n' : ''}${modal.querySelector('#medNotes').value.trim()}`,
        photo: null,
        type: 'medicine'
      });
      saveData();
      closeModal();
      showToast('已记录');
    });
  }

  // ========== 初始化 ==========
  function init() {
    refreshHeader();
    ensureBaby();

    // 底部导航
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // 头部
    $('#babySwitcherBtn').addEventListener('click', openBabySwitcher);
    $('#settingsBtn').addEventListener('click', openSettingsModal);
    $('#notificationsBtn').addEventListener('click', openNotificationsPanel);

    // 添加按钮
    $('#addFeedingBtn').addEventListener('click', openFeedingModal);
    $('#addDiaperBtn').addEventListener('click', openDiaperModal);
    $('#addSleepBtn').addEventListener('click', openSleepModal);
    $('#addGrowthBtn').addEventListener('click', openGrowthModal);
    $('#addMilestoneBtn').addEventListener('click', openMilestoneModal);
    $('#vaccineInfoBtn').addEventListener('click', openVaccineInfoModal);

    // 疫苗tabs
    $$('[data-vaccine-tab]').forEach(btn => {
      btn.addEventListener('click', () => renderVaccines(btn.dataset.vaccineTab));
    });

    // 快捷操作
    $$('[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => openQuickAction(btn.dataset.quick));
    });

    // 定期检查逾期（用于首页提醒）
    setInterval(() => {
      if ($('#view-dashboard').classList.contains('active')) {
        renderDashboard();
      }
    }, 60000);

    // 启动时检查通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      // 不主动请求，避免打扰
    }

    // 初始化视图
    switchView('dashboard');
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露调试接口
  window.babycare = { state, saveData, loadData };
})();