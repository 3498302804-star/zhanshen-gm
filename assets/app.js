/* ============================================================
   app.js — 斩神·自由大世界 GM 台 主程序
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const G = window.GAMEDATA;
  const PAL = (window.BEAUTY && window.BEAUTY.palettes) || [];
  const SEQ = window.SEQUENCES || [];

  /* ---------------- 状态 ---------------- */
  const KEY = 'zs_gm_v2';

  function freshChar() {
    return {
      mode: 'B', name: '', gender: '男', orient: '自由（随心所遇）', age: '19–25 岁', height: '',
      race: '普通人族', look: '', personality: '', bg: '', habit: '',
      system: '', origin: '', location: '', timeline: '',
      realm: '盏境', sub: '初期', mp: 20, mpMax: 100, hp: 80, hpMax: 100,
      mind: 60, life: 20, lifeMax: 100, money: 2000, luck: 50, karma: 0, kills: 0, fame: 0,
      seqNo: 0, seqName: '未觉醒', seqDesc: '', seqSub: '禁墟未觉醒',
      bag: '无', title: '无', favor: [], notes: '', year: '第 1 年',
    };
  }

  const DEF = {
    route: 'start',
    slotId: '',
    cfg: { difficulty: 3, palette: 0, safeTex: false, panelMode: 'chat', foldOld: false, showAll: false, theme: 'auto' },
    char: freshChar(),
    wizard: { step: 0, rolled: null },
    dice: [],
    rounds: [],
    lastScanText: '',
    ai: {
      mode: 'api', base: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat',
      key: '', msgs: [], busy: false, error: '', draft: '', streaming: '', synced: 0,
    },
  };

  let S = load();

  /* ---------------- 多存档 ---------------- */
  const SLOT_KEY = 'zs_gm_slots_v1';

  function readSlots() {
    try {
      const o = JSON.parse(localStorage.getItem(SLOT_KEY) || 'null');
      if (o && Array.isArray(o.list)) return o;
    } catch (e) { /* ignore */ }
    return { active: '', list: [] };
  }
  function writeSlots(o) {
    try { localStorage.setItem(SLOT_KEY, JSON.stringify(o)); }
    catch (e) { if (!_lsWarned) { _lsWarned = true; try { toast('本地空间不够了，存档可能存不下'); } catch (x) { /* ignore */ } } }
  }
  function newId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function slotTitle(s) {
    const c = (s && s.char) || {};
    return (c.name || '未命名') + ' · ' + (c.realm || '盏境') + (c.sub || '');
  }
  function metaOf(s) {
    const ai = s.ai || {};
    return {
      name: slotTitle(s),
      diff: (s.cfg && s.cfg.difficulty) || 3,
      rounds: (s.rounds || []).length,
      msgs: (ai.msgs || []).length,
      money: (s.char && s.char.money) || 0,
      t: Date.now(),
    };
  }
  /** 把当前 S 写回它自己的存档槽 */
  function syncSlot() {
    if (!S.slotId) S.slotId = newId();
    const st = readSlots();
    const rec = { id: S.slotId, meta: metaOf(S), data: JSON.parse(JSON.stringify(S)) };
    const i = st.list.findIndex((x) => x.id === S.slotId);
    if (i >= 0) st.list[i] = rec; else st.list.push(rec);
    st.active = S.slotId;
    writeSlots(st);
  }

  function mergeState(o) {
    const m = Object.assign(JSON.parse(JSON.stringify(DEF)), o || {});
    m.char = Object.assign(freshChar(), (o && o.char) || {});
    m.cfg = Object.assign({}, DEF.cfg, (o && o.cfg) || {});
    m.wizard = Object.assign({}, DEF.wizard, (o && o.wizard) || {});
    if (!m.ai) m.ai = JSON.parse(JSON.stringify(DEF.ai));
    if (!Array.isArray(m.rounds)) m.rounds = [];
    if (!Array.isArray(m.dice)) m.dice = [];
    return m;
  }

  function load() {
    try {
      const st = readSlots();
      if (st.list.length) {
        const rec = st.list.find((x) => x.id === st.active) || st.list[0];
        if (rec && rec.data) {
          const m = mergeState(rec.data);
          m.slotId = rec.id;
          return m;
        }
      }
      /* 老版本单档迁移 */
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEF));
      const o = JSON.parse(raw);
      const m = mergeState(o);
      m.slotId = newId();
      return m;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEF));
    }
  }

  function loadSlot(id) {
    const st = readSlots();
    const rec = st.list.find((x) => x.id === id);
    if (!rec || !rec.data) { toast('这个存档读不出来'); return; }
    if (id === S.slotId) { closeSheet(); return; }
    persist();                       // 先把当前这份落盘
    applyRec(rec);
    toast('已载入：' + (rec.meta && rec.meta.name ? rec.meta.name : id));
  }

  /** 把某条记录变成当前状态（不落盘旧档） */
  function applyRec(rec) {
    const m = mergeState(rec.data);
    m.slotId = rec.id;
    S = m;
    const st = readSlots();
    st.active = rec.id;
    writeSlots(st);
    applyTheme();
    persist(); render();
  }

  function newSlot() {
    persist();
    const st = readSlots();
    const fresh = JSON.parse(JSON.stringify(DEF));
    fresh.slotId = newId();
    fresh.cfg = Object.assign({}, DEF.cfg, { palette: S.cfg.palette, theme: S.cfg.theme });
    fresh.route = 'start';
    S = fresh;
    st.list.push({ id: fresh.slotId, meta: metaOf(fresh), data: JSON.parse(JSON.stringify(fresh)) });
    st.active = fresh.slotId;
    writeSlots(st);
    persist();
    applyTheme();
    go('start');
    toast('新存档已开，从头建档');
  }

  function delSlot(id) {
    const st = readSlots();
    const i = st.list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const nm = (st.list[i].meta && st.list[i].meta.name) || '这个存档';
    if (!confirm('删掉「' + nm + '」？里面的角色、对话、回合记录都会没。')) return;
    const wasCur = id === S.slotId;
    st.list.splice(i, 1);
    writeSlots(st);                  // 先写，避免 persist 把刚删的又写回来
    if (wasCur) {
      if (st.list.length) { closeSheet(); applyRec(st.list[0]); return; }
      localStorage.removeItem(SLOT_KEY);
      localStorage.removeItem(KEY);
      S = JSON.parse(JSON.stringify(DEF));
      S.slotId = newId();
      persist(); applyTheme(); go('start');
      return;
    }
    closeSheet();
    openSlotSheet();
    toast('删掉了');
  }

  function renameSlot(id) {
    const st = readSlots();
    const rec = st.list.find((x) => x.id === id);
    if (!rec) return;
    const cur = (rec.data && rec.data.char && rec.data.char.name) || '';
    const t = window.prompt('给这个存档改个角色名（会影响面板上的名字）', cur);
    if (t == null) return;
    const nm = t.trim().slice(0, 20);
    if (!nm) return;
    if (rec.data && rec.data.char) rec.data.char.name = nm;
    rec.meta = Object.assign({}, rec.meta, { name: nm + ' · ' + ((rec.data && rec.data.char && rec.data.char.realm) || '盏境') + ((rec.data && rec.data.char && rec.data.char.sub) || '') });
    writeSlots(st);
    if (id === S.slotId) { S.char.name = nm; persist(); }
    render();
    closeSheet();
    openSlotSheet();
    toast('改名了');
  }

  /* ---------------- 主题 ---------------- */
  function systemDark() {
    return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  }
  function isDark() {
    const t = (S.cfg && S.cfg.theme) || 'auto';
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return systemDark();
  }
  function applyTheme() {
    const dark = isDark();
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0a0c11' : '#f3efe6');
  }
  function setTheme(v) {
    S.cfg.theme = v;
    persist();
    applyTheme();
    render();
    toast(v === 'auto' ? '跟着系统走' : v === 'light' ? '白天模式' : '黑夜模式');
  }

  let _lsWarned = false;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) {
      if (!_lsWarned) { _lsWarned = true; try { toast('浏览器不让存本地档，这次的进度可能丢'); } catch (x) { /* ignore */ } }
    }
    try { syncSlot(); } catch (e) { /* ignore */ }
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 1600);
  }

  function copy(text, label) {
    const done = () => toast((label || '已复制') + '（' + text.length + ' 字符）');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
  }

  const di = () => G.DIFFICULTIES[S.cfg.difficulty - 1] || G.DIFFICULTIES[2];
  const pal = () => PAL[S.cfg.palette] || PAL[0] || { border: '#C0392B', bg: '#FBF6EC', titleBg: '#7B2D2D', titleFg: '#F2DFA7', body: '#2E2925', rule: '#C9A45C', foot: '#6F6559', accent: '#A03428' };
  const roll = (n) => 1 + Math.floor(Math.random() * n);

  /* ---------------- 路由 ---------------- */
  const ROUTES = [
    ['start', '⚔', '开团建档', '建档'],
    ['play', '🎬', '跑团台', '跑团'],
    ['dice', '🎲', '骰子台', '骰子'],
    ['panel', '📜', '面板工坊', '面板'],
    ['scan', '🩺', 'AI 味闸门', '闸门'],
    ['book', '📖', '规则全书', '全书'],
    ['save', '💾', '存档与回合', '存档'],
  ];

  function go(route) {
    S.route = route;
    if (location.hash !== '#' + route) history.replaceState(null, '', '#' + route);
    persist();
    render();
  }

  function renderNav() {
    const nav = $('#nav');
    nav.innerHTML = ROUTES.map(([id, ic, label, short]) => {
      let cnt = '';
      if (id === 'dice') cnt = S.dice.length ? `<span class="cnt">${S.dice.length}</span>` : '';
      if (id === 'save') cnt = S.rounds.length ? `<span class="cnt">${S.rounds.length}</span>` : '';
      return `<a class="${S.route === id ? 'on' : ''}" data-go="${id}" title="${label}"><span class="ic">${ic}</span>${short || label}${cnt}</a>`;
    }).join('');
    $$('#nav a').forEach((a) => a.addEventListener('click', () => go(a.dataset.go)));
  }

  function render() {
    renderNav();
    const main = $('#main');
    main.className = S.route === 'book' ? 'wide' : '';
    if (S.route === 'start') renderStart(main);
    else if (S.route === 'play') renderPlay(main);
    else if (S.route === 'dice') renderDice(main);
    else if (S.route === 'panel') renderPanel(main);
    else if (S.route === 'scan') renderScan(main);
    else if (S.route === 'book') renderBook(main);
    else if (S.route === 'save') renderSave(main);
    renderTopbar();
    renderSideFoot();
  }

  function renderSideFoot() {
    const c = S.char;
    $('#sidefoot').innerHTML = `
      <div><b>${esc(c.name || '未命名')}</b> · ${esc(c.realm)}${esc(c.sub)}</div>
      <div>${esc(di().name)}难度 ｜ 配色 ${S.cfg.palette + 1}</div>
      <div class="muted">自动存档 · 本地浏览器</div>`;
  }

  /* ============================================================
     开团建档
     ============================================================ */
  const STEPS = ['难度', '模式', '基础', '出身', '觉醒', '地点', '时间线', '建档'];

  function stepBar(step) {
    return `<div class="steps">${STEPS.map((s, i) => `<span class="st ${i < step ? 'done' : ''} ${i === step ? 'cur' : ''}">${i + 1} ${s}</span>`).join('')}</div>`;
  }

  function optList(items, cur, key, after) {
    return `<div class="opts">${items.map((o, i) => `
      <div class="opt ${String(cur) === String(o.v) ? 'sel' : ''}" data-pick="${key}" data-v="${esc(String(o.v))}" ${after ? `data-after="${after}"` : ''}>
        <div class="no">${o.n != null ? o.n : i + 1}</div>
        <div class="body"><div class="t">${o.t}</div>${o.d ? `<div class="d">${o.d}</div>` : ''}</div>
      </div>`).join('')}</div>`;
  }

  function bindPick(fn) {
    $$('[data-pick]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.pick;
        const v = el.dataset.v;
        fn(key, v, el);
      });
    });
  }

  function renderStart(root) {
    const step = S.wizard.step;
    const c = S.char;
    let body = '';

    if (step === 0) {
      body = `
        <div class="card"><h3>第一步 · 难度选择 <span class="tag">选定后终身绑定，任何话术无效</span></h3>
        ${optList(G.DIFFICULTIES.map((d) => ({ v: d.id, n: d.id, t: `${d.name}　<span class="pill gold">${d.star}</span>`, d: d.desc + '<br>' + d.perks.join(' ｜ ') })), S.cfg.difficulty, 'difficulty')}
        </div>`;
    } else if (step === 1) {
      body = `
        <div class="card"><h3>第二步 · 角色模式 <span class="tag">三种模式完全隔离，禁止串台</span></h3>
        ${optList(G.MODES.map((m) => ({ v: m.id, n: m.id, t: m.name, d: m.desc + '<br><span class="muted">红线：' + m.banned + '</span>' })), c.mode, 'mode')}
        </div>`;
    } else if (step === 2) {
      body = `${c.mode === 'C' ? `
        <div class="card"><h3>穿越者 · 系统选择 <span class="tag">20 种预设 + 自定义</span></h3>
          <div class="row tight">
            <select id="f_sys" style="flex:1 1 420px">
              <option value="">— 选一个系统 —</option>
              ${G.SYSTEMS.map((s) => `<option value="${esc(s.name)}" ${s.name === c.system ? 'selected' : ''}>${esc(s.name)}　${esc(s.desc)}</option>`).join('')}
            </select>
          </div>
          <div class="hint" style="margin-top:8px">${c.system ? '当前：<b style="color:var(--gold2)">' + esc(c.system) + '</b> · ' + esc((G.SYSTEMS.find((s) => s.name === c.system) || {}).desc || '') : '系统决定你每次选择节点能抽什么奖励。'}</div>
        </div>` : ''}
        <div class="card"><h3>第三步 · 基础信息 <span class="tag">一次填完，随时可改</span></h3>
          <div class="grid2">
            <div><label>姓名（GM 绝不代取，留空＝让骰子决定）</label><input id="f_name" value="${esc(c.name)}" placeholder="你想叫什么"></div>
            <div><label>性别</label><input id="f_gender" value="${esc(c.gender)}"></div>
            <div><label>性取向</label>
              <select id="f_orient">${G.ORIENT.map((o) => `<option ${o === c.orient ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
            </div>
            <div><label>初始年龄</label>
              <select id="f_age">${G.AGES.map((a) => `<option ${a.name === c.age ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
            </div>
            <div><label>身高（cm）</label><input id="f_height" value="${esc(c.height)}" placeholder="如 178"></div>
            <div><label>种族／血脉</label>
              <select id="f_race">${G.RACES.map((r) => `<option ${r.name === c.race ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
            </div>
          </div>
          <div style="margin-top:12px"><label>外貌补充</label><input id="f_look" value="${esc(c.look)}" placeholder="发色／瞳色／体型／标志特征／服饰风格，或写「随机」"></div>
          <div style="margin-top:12px"><label>性格底色</label><input id="f_personality" value="${esc(c.personality)}" placeholder="冷静／热血／腹黑／善良／忧郁／开朗／亦正亦邪，也可自由描述"></div>
          <div style="margin-top:12px"><label>背景简述（一句话到三句话）</label><textarea id="f_bg" rows="2" placeholder="过往经历／家庭／目标／愿望">${esc(c.bg)}</textarea></div>
          <div style="margin-top:12px"><label>口头禅或习惯动作（可跳过）</label><input id="f_habit" value="${esc(c.habit)}" placeholder="这是语言指纹的第一行"></div>
          <div class="wrap-actions">
            <button class="primary" id="btn_next">下一步 · 出身</button>
          </div>
        </div>`;
    } else if (step === 3) {
      body = `
        <div class="card"><h3>第四步 · 出身 <span class="tag">决定初始资源、关系与难度曲线</span></h3>
        ${optList(G.ORIGINS.map((o) => ({ v: o.name, n: o.id, t: o.name, d: o.desc })), c.origin, 'origin')}
        </div>`;
    } else if (step === 4) {
      body = renderAwaken();
    } else if (step === 5) {
      body = `
        <div class="card"><h3>第六步 · 初始地点</h3>
        ${optList(G.LOCATIONS.map((o) => ({ v: o.name, n: o.id, t: o.name, d: o.desc })), c.location, 'location')}
        </div>`;
    } else if (step === 6) {
      body = `
        <div class="card"><h3>第七步 · 时间线节点 <span class="tag">决定开局世界状态</span></h3>
        ${optList(G.TIMELINES.map((o) => ({ v: o.id, n: o.id, t: `${o.year} · ${o.name}`, d: o.desc })), c.timeline, 'timeline')}
        </div>`;
    } else {
      body = renderDossier();
    }

    root.innerHTML = `
      <div class="hd"><h2>开团建档</h2><span class="sub">规则书第 2 章 · 分步引导 · 每步只做一件事</span></div>
      ${stepBar(step)}
      ${body}
      <div class="wrap-actions">
        ${step > 0 ? '<button id="btn_prev">← 上一步</button>' : ''}
        ${step < STEPS.length - 1 && step !== 2 ? '<button id="btn_skip">跳过这步 →</button>' : ''}
        ${step === STEPS.length - 1 ? '<button id="btn_restart" class="danger">重新建档</button>' : ''}
      </div>`;

    // 绑定
    bindPick((key, v) => {
      if (key === 'difficulty') { S.cfg.difficulty = Number(v); S.wizard.step = 1; }
      if (key === 'mode') { c.mode = v; S.wizard.step = 2; }
      if (key === 'origin') {
        if (v === '自定义出身') {
          const t = window.prompt('自定义出身：写下你的来历（家庭、经历、资源、仇家都行）', c.bg || '');
          if (t) { c.origin = '自定义：' + t; c.bg = c.bg || t; }
          else c.origin = '自定义出身';
        } else {
          c.origin = v;
        }
        S.wizard.step = 4;
      }
      if (key === 'location') { c.location = v; S.wizard.step = 6; }
      if (key === 'timeline') { c.timeline = Number(v); S.wizard.step = 7; }
      if (key === 'system') { c.system = v; S.wizard.step = 2; }
      if (key === 'seqpick') { applySeq(Number(v)); }
      persist(); render();
    });

    const sysSel = $('#f_sys');
    if (sysSel) sysSel.addEventListener('change', () => {
      c.system = sysSel.value;
      persist(); render();
    });

    const prev = $('#btn_prev');
    if (prev) prev.addEventListener('click', () => { S.wizard.step = Math.max(0, step - 1); persist(); render(); });
    const skip = $('#btn_skip');
    if (skip) skip.addEventListener('click', () => { S.wizard.step = Math.min(STEPS.length - 1, step + 1); persist(); render(); });
    const next = $('#btn_next');
    if (next) next.addEventListener('click', () => {
      c.name = $('#f_name').value.trim();
      c.gender = $('#f_gender').value.trim();
      c.orient = $('#f_orient').value;
      c.age = $('#f_age').value;
      c.height = $('#f_height').value.trim();
      c.race = $('#f_race').value;
      c.look = $('#f_look').value.trim();
      c.personality = $('#f_personality').value.trim();
      c.bg = $('#f_bg').value.trim();
      c.habit = $('#f_habit').value.trim();
      S.wizard.step = 3;
      persist(); render();
    });
    const restart = $('#btn_restart');
    if (restart) restart.addEventListener('click', () => {
      if (!confirm('开一份全新存档、从头建档？\n（当前这份会留在存档列表里，之后还能切回来）')) return;
      newSlot();
    });

    if (step === 4) bindAwaken();
    if (step === 7) bindDossier();
  }

  function NUM(v) { return Number(v) || v; }

  /* ---------- 禁墟觉醒 ---------- */
  function zoneOf(n) {
    if (n <= 23) return '神墟区';
    if (n <= 60) return '王墟区';
    if (n <= 200) return '高危禁墟';
    if (n <= 400) return '危险禁墟';
    if (n <= 600) return '低危禁墟';
    return '无害禁墟';
  }

  function pickSeq(min, max) {
    const pool = SEQ.filter((s) => s.no >= min && s.no <= max);
    if (pool.length && Math.random() < 0.72) return pool[Math.floor(Math.random() * pool.length)];
    const no = min + Math.floor(Math.random() * (max - min + 1));
    const gen = no <= 200 ? G.GEN.gao : no <= 400 ? G.GEN.wei : no <= 600 ? G.GEN.di : G.GEN.wu;
    const name = gen.pre[Math.floor(Math.random() * gen.pre.length)] + gen.suf[Math.floor(Math.random() * gen.suf.length)];
    return { no, code: String(no).padStart(3, '0'), name, zone: zoneOf(no), desc: gen.eff + '（GM 待补：具体发动条件与代价）' };
  }

  function applySeq(no) {
    const s = SEQ.find((x) => x.no === no);
    if (!s) return;
    const c = S.char;
    c.seqNo = s.no;
    c.seqName = s.name;
    c.seqDesc = s.desc;
    c.seqSub = s.zone;
  }

  function awakenRoll() {
    const d = di();
    const r = roll(100);
    lastRollSave('禁墟觉醒 1d100', r);
    let result;
    if (d.id === 1) {
      result = { ok: true, seq: pickSeq(1, 23), note: '天选之人：自动获得序列前100的高危禁墟或神墟' };
    } else if (d.id === 2) {
      if (r <= 80) result = { ok: true, seq: pickSeq(201, 400), note: '80% 概率：序列 200–400 危险禁墟' };
      else result = { ok: true, seq: pickSeq(61, 200), note: '20% 概率：更高，序列 61–200 高危禁墟' };
    } else if (d.id === 3) {
      if (r <= 60) result = { ok: true, seq: pickSeq(401, 600), note: '60% 概率：序列 400–600 低危禁墟' };
      else if (r <= 90) result = { ok: false, seq: null, note: '30% 概率：没有禁墟，纯靠精神力与装备' };
      else result = { ok: true, seq: pickSeq(61, 200), note: '10% 意外：序列 61–200 高危禁墟' };
    } else if (d.id === 4) {
      if (r <= 50) result = { ok: true, seq: pickSeq(101, 200), note: '50% 概率：序列 100–200 高危禁墟，副作用严重' };
      else if (r <= 80) result = { ok: true, seq: pickSeq(401, 600), note: '30% 概率：序列 400–600 低危禁墟' };
      else result = { ok: false, seq: null, note: '20% 概率：无禁墟，但埋下「濒死觉醒」伏笔' };
    } else {
      result = { ok: true, seq: pickSeq(1, 950), note: '作弊模式：可自选任意序列' };
    }
    return { d, r, ...result };
  }

  function renderAwaken() {
    const c = S.char;
    const w = S.wizard;
    const done = w.rolled;
    const pickable = di().id === 5;
    let html = `<div class="card"><h3>第五步 · 禁墟觉醒 <span class="tag">${di().id === 5 ? '作弊模式：可自选' : '天赋由骰子决定，不许自己挑'}</span></h3>`;
    html += `<div class="roll-out" style="min-height:auto;padding:18px">
        ${done
          ? `<div class="num ${done.ok ? 'crit' : 'fail'}">${done.r}</div>
             <div class="detail">1d100 ＝ ${done.r} ｜ ${esc(done.note)}</div>
             ${done.seq ? `<div style="margin-top:12px;font-size:15px;color:var(--gold2)">序列 ${done.seq.code}【${esc(done.seq.name)}】</div><div class="detail" style="margin-top:6px">${esc(done.seq.desc)}</div>` : `<div class="detail" style="margin-top:10px;color:#d9787a">本次未觉醒禁墟</div>`}`
          : `<div class="muted">尚未掷骰。当前难度：<b style="color:var(--gold2)">${esc(di().name)}</b>　${esc(di().seq)}</div>`}
      </div>
      <div class="wrap-actions">
        <button class="primary" id="btn_rollseq">${done ? '再掷一次' : '掷 1d100 觉醒'}</button>
        ${done ? '<button id="btn_accept">接受结果，下一步</button>' : ''}
      </div>`;

    if (pickable) {
      html += `<hr class="sep"><label>作弊模式 · 直接指定序列（41 条已收录 + 任意编号）</label>
        <div class="row tight">
          <select id="f_seq" style="flex:1 1 380px">
            <option value="">— 选一条 —</option>
            ${SEQ.map((s) => `<option value="${s.no}">${s.code}【${esc(s.name)}】${esc(s.zone)}</option>`).join('')}
          </select>
          <input id="f_seqno" placeholder="或输入编号 1–950" style="flex:0 0 160px">
          <button class="sm" id="btn_setseq">采用</button>
        </div>`;
    }
    html += `</div>`;

    if (c.seqNo) {
      html += `<div class="card"><h3>当前禁墟档案</h3>
        <div class="kv">
          <div class="k">序列</div><div class="v mono">${String(c.seqNo).padStart(3, '0')}</div>
          <div class="k">名称</div><div class="v">【${esc(c.seqName)}】</div>
          <div class="k">区段</div><div class="v">${esc(c.seqSub)}</div>
          <div class="k">描述</div><div class="v">${esc(c.seqDesc)}</div>
          <div class="k">成长方向</div><div class="v muted">待剧情推进中由 GM 裁定（觉醒→一阶→二阶→终极形态）</div>
        </div></div>`;
    }
    return html;
  }

  function bindAwaken() {
    const btn = $('#btn_rollseq');
    if (btn) btn.addEventListener('click', () => {
      const res = awakenRoll();
      S.wizard.rolled = { r: res.r, ok: res.ok, note: res.note, seq: res.seq };
      if (res.seq) applySeq(res.seq.no);
      else { S.char.seqNo = 0; S.char.seqName = '未觉醒'; S.char.seqDesc = ''; S.char.seqSub = '禁墟未觉醒'; }
      persist(); render();
    });
    const acc = $('#btn_accept');
    if (acc) acc.addEventListener('click', () => { S.wizard.step = 5; persist(); render(); });
    const setBtn = $('#btn_setseq');
    if (setBtn) setBtn.addEventListener('click', () => {
      const sel = $('#f_seq').value;
      const manual = $('#f_seqno').value.trim();
      let no = sel ? Number(sel) : manual ? Number(manual) : 0;
      if (!no) return toast('先选一条或填个编号');
      if (!SEQ.find((x) => x.no === no)) {
        const g = no <= 200 ? G.GEN.gao : no <= 400 ? G.GEN.wei : no <= 600 ? G.GEN.di : G.GEN.wu;
        const nm = g.pre[Math.floor(Math.random() * g.pre.length)] + g.suf[Math.floor(Math.random() * g.suf.length)];
        SEQ.push({ no, code: String(no).padStart(3, '0'), name: nm, zone: zoneOf(no), desc: g.eff + '（未收录，待 GM 细化）' });
      }
      applySeq(no);
      S.wizard.rolled = { r: 100, ok: true, note: '作弊模式：玩家自选', seq: SEQ.find((x) => x.no === no) };
      persist(); render();
    });
  }

  function lastRollSave(kind, val) {
    S.dice.unshift({ t: Date.now(), kind, val, note: '建档掷骰' });
    S.dice = S.dice.slice(0, 200);
  }

  /* ---------- 建档输出 ---------- */
  function dossierText() {
    const c = S.char;
    const d = di();
    const tl = G.TIMELINES.find((t) => String(t.id) === String(c.timeline));
    const lines = [];
    lines.push(`【角色档案】`);
    lines.push(`姓名：${c.name || '（未命名）'}｜性别：${c.gender}｜取向：${c.orient}｜年龄：${c.age}｜身高：${c.height || '未填'}cm`);
    lines.push(`种族：${c.race}｜性格：${c.personality || '未填'}｜习惯：${c.habit || '无'}`);
    lines.push(`模式：${modeName(c.mode)}｜难度：${d.name}（${d.star}）`);
    lines.push(`出身：${c.origin || '未选'}｜地点：${c.location || '未选'}｜时间线：${tl ? tl.year + ' ' + tl.name : '未选'}`);
    lines.push(`境界：${c.realm}${c.sub}｜精神力 ${c.mp}/${c.mpMax}`);
    lines.push(`禁墟：${c.seqNo ? '序列' + String(c.seqNo).padStart(3, '0') + '【' + c.seqName + '】' + c.seqSub : '未觉醒'}`);
    if (c.seqDesc) lines.push(`禁墟效果：${c.seqDesc}`);
    if (c.mode === 'C') lines.push(`系统：${c.system || '未选'}`);
    lines.push(`背景：${c.bg || '未填'}`);
    lines.push(`气运 ${c.luck}｜因果 ${c.karma}｜大夏币 ${c.money}`);
    return lines.join('\n');
  }

  function modeName(m) {
    const x = G.MODES.find((v) => v.id === m);
    return x ? x.name : m;
  }

  function buildPrompt() {
    const c = S.char;
    const d = di();
    const p = pal();
    const tl = G.TIMELINES.find((t) => String(t.id) === String(c.timeline));
    return [
      '你现在是《我在精神病院学斩神》世界的「守夜人主持」。我粘贴给你的规则书、写作规约、数据美化和表格美化指令全部生效。',
      '',
      '【本次开局设定】',
      `· 难度：${d.name}（${d.star}）——选定终身绑定`,
      `· 模式：${modeName(c.mode)}${c.mode === 'C' ? '，系统：' + (c.system || '待定') : ''}`,
      `· 出身：${c.origin || '待定'}｜初始地点：${c.location || '待定'}｜时间线：${tl ? tl.year + ' ' + tl.name : '待定'}`,
      `· 角色：${c.name || '（待命名）'}，${c.gender}，${c.age}，${c.race}，性格${c.personality || '待定'}`,
      `· 禁墟：${c.seqNo ? '序列' + String(c.seqNo).padStart(3, '0') + '【' + c.seqName + '】（' + c.seqSub + '）' : '尚未觉醒（按难度表掷骰）'}`,
      `· 背景：${c.bg || '待定'}｜口头禅：${c.habit || '无'}`,
      '',
      '【输出格式硬要求】',
      `· 叙事 300–900 字，只写能拍到的：动作、台词、环境、物象；不写心理；不总结不升华不预告。`,
      `· 叙事内禁止出现「玩家／回合／选项／系统／存档」等界面词，禁止任何提问。`,
      '· 叙事结束后另起分隔线，给出 3–5 个编号选项 ＋「0 自定义行动」。',
      '· 面板一律用 LaTeX 包在 \\( ... \\) 内，严禁代码块；配色方案：' + (p.name || '经典红金'),
      `· 凡「当前值/最大值」属性一律用 5em 双条进度条：\\textcolor{${p.body}}{属性名 \\rule{填充宽}{1ex}\\textcolor{#D5D8DC}{\\rule{剩余宽}{1ex}} 当前值/最大值}`,
      `· 面板行不超 16 个中文字符，单块不超 18 行；标题用 \\colorbox{${p.titleBg}}{\\textcolor{${p.titleFg}}{标题}}；分隔线用 \\textcolor{${p.rule}}{\\overline{\\qquad\\qquad\\qquad\\qquad\\qquad}}`,
      '',
      '【第一回合】',
      '请按规则书第 2 章第 9 步建档：输出完整角色面板、开局导语（300 字内）、序章第一幕，然后给选项。不要复述设定，不要问我问题。',
    ].join('\n');
  }

  function renderDossier() {
    const c = S.char;
    const rows = briefRows(c, pal());
    const tex = LTX.assemble(rows, pal(), S.cfg.panelMode, { safe: S.cfg.safeTex });
    renderDossier._tex = tex;
    return `
      <div class="card"><h3>第八步 · 建档完成 <span class="tag">角色卡 + 面板 + 开局指令</span></h3>
        <div class="grid2">
          <div>
            <div class="kv">
              <div class="k">姓名</div><div class="v">${esc(c.name || '未命名')}</div>
              <div class="k">难度</div><div class="v">${esc(di().name)}</div>
              <div class="k">模式</div><div class="v">${esc(modeName(c.mode))}</div>
              <div class="k">出身</div><div class="v">${esc(c.origin || '—')}</div>
              <div class="k">禁墟</div><div class="v">${c.seqNo ? esc('序列' + String(c.seqNo).padStart(3, '0') + '【' + c.seqName + '】') : '未觉醒'}</div>
              <div class="k">地点</div><div class="v">${esc(c.location || '—')}</div>
              <div class="k">时间线</div><div class="v">${esc((G.TIMELINES.find((t) => String(t.id) === String(c.timeline)) || {}).name || '—')}</div>
            </div>
            <div class="wrap-actions">
              <button class="primary" id="btn_to_play">去跑团台开演 →</button>
              <button id="btn_copy_prompt">复制开局指令</button>
              <button id="btn_copy_dossier">复制角色档案</button>
            </div>
          </div>
          <div>
            <label>面板预览（配色 ${S.cfg.palette + 1} · ${S.cfg.panelMode === 'box' ? '盒装版' : '逐行版'}）</label>
            <div class="panel-preview" id="pv" style="border-color:${pal().border};background:${pal().bg};color:${pal().body}">${LTX.render(tex)}</div>
          </div>
        </div>
      </div>
      <div class="card"><h3>面板代码 <span class="tag">${tex.length} 字符</span></h3>
        <pre class="code" id="texbox">${esc(tex)}</pre>
        <div class="wrap-actions"><button id="btn_copy_tex">复制面板代码</button></div>
      </div>`;
  }

  function bindDossier() {
    const t = renderDossier._tex || '';
    $('#btn_copy_prompt').addEventListener('click', () => copy(buildPrompt(), '开局指令'));
    $('#btn_copy_dossier').addEventListener('click', () => copy(dossierText(), '角色档案'));
    $('#btn_copy_tex').addEventListener('click', () => copy(t, '面板代码'));
    const gp = $('#btn_to_play');
    if (gp) gp.addEventListener('click', () => go('play'));
  }

  /* ============================================================
     跑团台 —— 真正跑起来
     ============================================================ */
  function gmSystemPrompt() {
    const c = S.char;
    const d = di();
    const p = pal();
    const tl = G.TIMELINES.find((t) => String(t.id) === String(c.timeline));
    const sample = LTX.assemble(briefRows(c, p), p, S.cfg.panelMode, { safe: S.cfg.safeTex });
    return [
      '# 你是谁',
      '你是一部黑暗幻想小说的作者，也是这个世界的出题人。对方用「我」自称，输入自己想做的动作、说的话；你写出世界如何回应。',
      '你只写小说正文，不解释、不总结、不提问、不复述设定。',
      '',
      '# 十条铁律（破一条就是废稿）',
      '1 从不承认这是游戏。禁止出现：玩家、你选择了、回合、系统、存档、面板、设定、剧情、关卡、任务、本回合、接下来、希望你喜欢、如果你愿意。',
      '2 只写摄影机能拍到的东西：动作、台词、环境、物象、旁人的反应。禁止写「他感到／他意识到／他想起／他心里／内心深处／仿佛看见了」。',
      '3 每个人都有他自己的目的。NPC 可以拒绝、敷衍、撒谎、转身走掉；不要因为剧情需要配合。',
      '4 后果不撤回。做蠢事就吃蠢事的果，不安排巧合兜底，不做补偿。',
      '5 不升华、不总结、不预告。结尾不许出现「从此刻起」「他暗下决心」「这一切都将改变」。',
      '6 禁用词：缓缓、淡淡、微微、一丝、一抹、不禁、不由得、似乎、仿佛、心中一凛、深吸一口气、嘴角勾起、眼神复杂、五味杂陈、莫名、难以名状、不言而喻、瞳孔骤缩、脊背发凉、空气凝固、气氛瞬间凝固。',
      '7 禁用句式：不是A而是B、与其说…不如说、既…又…、形容词三连、那一刻他明白了、他不知道的是、这将是他最后一次。',
      '8 标点配额：每段破折号≤1，省略号≤2，叹号≤1，全文不用分号，不用括号加注释。',
      '9 台词：平均句长≤15 字，四句里有至少一句是废话（问天气、抱怨、扯别的）。每场对话至少一次打断或改口。',
      '10 篇幅：正文 300–900 字，段落 1–8 行。对话用「」。正文内不出现问句——问句只出现在最后的选项里。',
      '',
      '# 世界',
      '境界：盏境→池境→川境→海境→无量境→克莱因境→伪神→主神→至高神，每境分初期/中期/后期/巅峰。精神力按境界给区间，凡人不入流。',
      '禁墟：觉醒者体内的规则畸变。序列 001–023 神墟，024–060 王墟，061–200 高危，201–400 危险，401–600 低危，600 以后无害。',
      '势力：守夜人（大夏官方，按城市设分部）、古神教会（献祭换力量）、诸神残余、地方帮派、普通人社会。',
      '常识：觉醒者不公开，普通人不知道禁墟。守夜人做事要写报告，也要背锅。死了人要有尸体、要有家属、要有舆情。',
      `时间线：${tl ? tl.year + ' ' + tl.name + '（' + tl.desc + '）' : '完全自由，按玩家选择推进'}`,
      `模式红线：${(G.MODES.find((m) => m.id === c.mode) || {}).banned || '无'}`,
      '',
      '# 判定',
      '需要结果不确定时，自己掷 1d20（普通行动）或 1d100（突破/觉醒/大事件），只公示结果行，不解释规则：',
      '〔判定·1d20 14＋2＝16 ／ 难度 14 ／ 成功〕　难度口径：简单 8、普通 12、困难 16、极难 19；1–2 大失败，19–20 大成功。',
      '掷骰只为制造后果差异，不为惩罚。失败要有失败的细节，不是「没成功」。',
      '',
      '# 每个回合的输出结构（严格照此）',
      '[正文 300–900 字]',
      '——',
      '【你可以】',
      '1. ……',
      '2. ……',
      '3. ……',
      '0. 自己来（写下你要做的动作或要说的原话）',
      '然后空一行，附上面板（LaTeX，包在 \\( \\) 内，不要代码块）：',
      sample,
      '',
      '面板规则：凡是「当前值/最大值」一律用 5em 双条进度条，第一条占当前值的比例用正文色，剩下的用浅灰 #D5D8DC；数值变了要标 ▲▼；每行不超 16 个中文字。',
      '',
      '# 这个人的档案',
      dossierText(),
      '',
      '现在开始。第一回合：按上面的时间线、出身、地点写出他被卷进来的那一幕，结尾停在必须立刻做决定的地方。不要再确认任何设定。',
    ].join('\n');
  }

  function richText(txt) {
    const src = String(txt || '');
    const rx = /\\\(([\s\S]*?)\\\)/g;
    const parts = [];
    let last = 0;
    let m;
    while ((m = rx.exec(src))) {
      if (m.index > last) parts.push({ t: 'text', v: src.slice(last, m.index) });
      parts.push({ t: 'tex', v: '\\(' + m[1] + '\\)' });
      last = rx.lastIndex;
    }
    if (last < src.length) parts.push({ t: 'text', v: src.slice(last) });
    return parts.map((pt) => {
      if (pt.t === 'tex') {
        return '<div class="msg-tex">' + LTX.render(pt.v) + '</div>';
      }
      return pt.v.split(/\n{2,}/).filter((s) => s.trim()).map((par) => '<p>' + esc(par).replace(/\n/g, '<br>') + '</p>').join('');
    }).join('');
  }

  function playMsgs() {
    const ai = S.ai;
    if (!ai.msgs) ai.msgs = [];
    return ai.msgs;
  }

  function pushSys() {
    const ai = S.ai;
    const sys = { role: 'system', content: gmSystemPrompt() };
    if (ai.msgs.length && ai.msgs[0].role === 'system') ai.msgs[0] = sys;
    else ai.msgs.unshift(sys);
    return sys;
  }

  /* 统一发请求：手机上（Capacitor 壳）走原生 HTTP，绕开 WKWebView 的跨域限制；
     浏览器里就走 fetch。返回 {ok, status, data}。 */
  /* 地址归一化：用户很容易把地址填成 https://api.deepseek.com（没有 /chat/completions），
     或者粘成 deepseek.com/chat/completions（没有协议头）。这两种都会让原生层跟着
     302 一直跳，最后报 "too many http redirects"。这里统一补齐。 */
  function normBase(u) {
    let s = String(u || '').trim().replace(/\s+/g, '');
    if (!s) return 'https://api.deepseek.com/chat/completions';
    // 没有协议头就补 https://
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    // 只有域名/根路径：补上标准接口路径
    let m;
    try { m = new URL(s); } catch (e) { return s; }
    let p = m.pathname.replace(/\/+$/, '');
    if (p === '') {
      p = '/chat/completions';
    } else if (!/\/chat\/completions$/.test(p) && /(\/v1|\/api|\/api\/v1)$/.test(p)) {
      p = p + '/chat/completions';
    } else if (/\/chat\/completions$/.test(p)) {
      /* 已经是完整接口，原样保留 */
    }
    if (p !== m.pathname) { m.pathname = p; s = m.toString(); }
    return s;
  }

  /* 同一个主机可能对应不同路径：/chat/completions、/v1/chat/completions。
     地址填错时先别急着报错，按顺序试一遍，哪个通就用哪个。 */
  function urlCandidates(rawUrl) {
    const base = normBase(rawUrl);
    const list = [base];
    try {
      const m = new URL(base);
      const origin = m.origin;
      ['/chat/completions', '/v1/chat/completions'].forEach((p) => {
        const u = origin + p;
        if (list.indexOf(u) < 0) list.push(u);
      });
    } catch (e) { /* 不是合法 URL 就只试原样 */ }
    return list;
  }

  async function apiPostOnce(url, payload, key) {
    const cap = window.Capacitor;
    const http = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    if (http && typeof http.post === 'function') {
      const r = await http.post({
        url,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        data: payload,
        connectTimeout: 30000,
        readTimeout: 180000,
      });
      let data = r.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { /* 保留原文 */ } }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, data, url };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    let data;
    const txt = await res.text();
    try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
    return { ok: res.ok, status: res.status, data, url };
  }

  async function apiPost(rawUrl, payload, key) {
    const cands = urlCandidates(rawUrl);
    const tried = [];
    let lastErr = null;
    for (let i = 0; i < cands.length; i++) {
      try {
        const r = await apiPostOnce(cands[i], payload, key);
        tried.push(cands[i] + ' → ' + r.status);
        /* 路径不对的表现：404 / 405 / 3xx。换个路径再试，别急着把错摔给用户 */
        if (!r.ok && (r.status === 404 || r.status === 405 || r.status === 301 || r.status === 302 || r.status === 308) && i < cands.length - 1) {
          lastErr = new Error('路径不对：' + cands[i] + ' HTTP ' + r.status);
          continue;
        }
        r.tried = tried;
        return r;
      } catch (e) {
        const msg = String((e && e.message) || e);
        tried.push(cands[i] + ' → ' + msg);
        lastErr = e;
        /* 重定向循环、跨域、网络中断：换下一条路径再试 */
        if (/redirect|Load failed|Failed to fetch|Network|网络|超时|timed? ?out/i.test(msg) && i < cands.length - 1) continue;
        throw new Error(msg + '\n（试过：' + tried.join('；') + '）');
      }
    }
    const base = String((lastErr && lastErr.message) || '请求失败');
    throw new Error(base + '\n（试过：' + tried.join('；') + '）');
  }

  /* ---------- 上下文裁剪：留系统设定 + 最近几十条，别把 token 烧光 ---------- */
  function trimHist(msgs) {
    const sys = msgs.filter((m) => m.role === 'system').slice(0, 1);
    const rest = msgs.filter((m) => m.role !== 'system');
    const KEEP = 30;
    if (rest.length <= KEEP) return sys.concat(rest);
    const cut = rest.slice(-KEEP);
    /* 历史别以 GM 的话打头，否则模型容易顺着上一段续写错位 */
    while (cut.length && cut[0].role !== 'user') cut.shift();
    const dropped = rest.length - cut.length;
    return sys.concat([{
      role: 'system',
      content: '（前面 ' + dropped + ' 条往来已折叠，剧情以最新这段为准。）',
    }], cut);
  }

  /* ---------- 流式（打字机） ----------
     手机壳里的原生 HTTP 拿不到增量，流式只能走 fetch；fetch 不通就静默退回一次性请求。 */
  let STREAM_CTL = null;
  let _paintT = 0;

  function paintStream(txt) {
    const el = document.getElementById('stream_body');
    if (!el) return;
    el.innerHTML = richText(txt);
    const box = $('#chat');
    if (box) box.scrollTop = box.scrollHeight;
  }

  async function streamTry(ai, body) {
    const url = normBase(ai.base);
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    STREAM_CTL = ctl;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + ai.key,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      return { skip: true, why: 'fetch 不通（多半是跨域）' };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error('HTTP ' + res.status + '　' + url + '\n' + String(t).slice(0, 400));
      err.http = res.status;
      throw err;
    }
    const ct = String(res.headers.get('content-type') || '');
    if (!res.body || typeof res.body.getReader !== 'function' || ct.indexOf('event-stream') < 0) {
      /* 服务端无视了 stream，按普通 JSON 读一次 */
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (c) { ai.streaming = c; paintStream(c); return { text: c }; }
      } catch (e) { /* 落到 skip */ }
      return { skip: true, why: '返回的不是流' };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let out = '';
    for (;;) {
      let step;
      try { step = await reader.read(); }
      catch (e) {
        if (e && e.name === 'AbortError') throw e;
        throw new Error('流断了：' + ((e && e.message) || e));
      }
      if (step.done) break;
      buf += dec.decode(step.value, { stream: true });
      let ni;
      while ((ni = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, ni).trim();
        buf = buf.slice(ni + 1);
        if (!line || line.indexOf('data:') !== 0) continue;
        const d = line.slice(5).trim();
        if (d === '[DONE]') { buf = ''; break; }
        let j;
        try { j = JSON.parse(d); } catch (e) { continue; }
        const ch = j.choices && j.choices[0];
        const delta = ch && ch.delta && ch.delta.content;
        if (!delta) continue;
        out += delta;
        ai.streaming = out;
        const now = Date.now();
        if (now - _paintT > 120) { _paintT = now; paintStream(out); }
      }
    }
    STREAM_CTL = null;
    if (!out) return { skip: true, why: '流里没有正文' };
    paintStream(out);
    return { text: out };
  }

  function stopStream() {
    if (STREAM_CTL) { try { STREAM_CTL.abort(); } catch (e) { /* ignore */ } }
    STREAM_CTL = null;
  }

  async function sendAI(text) {
    const ai = S.ai;
    if (!text || !text.trim()) return;
    if (!ai.key) { toast('先在连接设置里填 API Key'); return; }
    if (ai.busy) return;
    pushSys();
    ai.msgs.push({ role: 'user', content: text.trim() });
    ai.draft = '';
    ai.busy = true;
    ai.error = '';
    ai.streaming = '';
    persist();
    render();

    const params = { model: ai.model, messages: trimHist(ai.msgs) };
    /* reasoner 系列不接受 temperature / top_p，带上会 400 */
    if (!/reasoner|r1|thinking/i.test(String(ai.model))) params.temperature = 1.15;

    try {
      let out = '';
      try {
        const s = await streamTry(ai, Object.assign({ stream: true, max_tokens: 2400 }, params));
        if (!s.skip) out = s.text || '';
        else if (s.why) console.info('流式跳过：' + s.why);
      } catch (e) {
        /* 4xx 是真错误（Key 错、没钱、限流），别拿一次性请求再撞一遍 */
        if (e && e.http && e.http >= 400 && e.http < 500) throw e;
      }
      if (!out) {
        const r = await apiPost(ai.base, Object.assign({ stream: false }, params), ai.key);
        if (!r.ok) {
          const detail = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
          throw new Error('HTTP ' + r.status + '　' + r.url + '\n' + String(detail).slice(0, 400));
        }
        out = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
        if (!out) throw new Error('返回里没有正文：' + JSON.stringify(r.data).slice(0, 300));
      }
      ai.msgs.push({ role: 'assistant', content: out });
      if (ai.msgs.length > 90) ai.msgs = ai.msgs.slice(0, 1).concat(ai.msgs.slice(-60));
      const hit = syncFromText(out);
      if (hit.length) { ai.synced = hit.length; setTimeout(() => toast('面板已跟上：' + hit.slice(0, 4).join('／')), 260); }
    } catch (e) {
      ai.error = (e && e.name === 'AbortError')
        ? '你自己停掉了这一次，想接着走就点重发。'
        : String((e && e.message) || e);
      ai.msgs.pop();
      ai.draft = text;
    }
    ai.streaming = '';
    ai.busy = false;
    STREAM_CTL = null;
    persist();
    render();
    const box = $('#chat');
    if (box) box.scrollTop = box.scrollHeight;
  }

  /* 从 GM 的回复里把面板数值抓回来，省得每回合手动抄。
     只认「属性名 数字/数字」这种写法，LaTeX 命令里的数字不会被误吃。 */
  const SYNC_MAP = [
    { k: 'hp', m: 'hpMax', re: /气血\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/ },
    { k: 'mp', m: 'mpMax', re: /精神力\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/ },
    { k: 'life', m: 'lifeMax', re: /(?:剩余)?寿命\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/ },
    { k: 'mind', re: /心性\s*[:：]?\s*(-?\d+)/ },
    { k: 'money', re: /大夏币\s*[:：]?\s*(-?[\d,]+)/ },
    { k: 'luck', re: /气运\s*[:：]?\s*(-?\d+)/ },
    { k: 'karma', re: /因果\s*[:：]?\s*(-?\d+)/ },
    { k: 'kills', re: /杀业\s*[:：]?\s*(-?\d+)/ },
    { k: 'fame', re: /名望\s*[:：]?\s*(-?\d+)/ },
  ];
  const REALM_RE = /(盏境|池境|川境|海境|无量境|克莱因境|伪神|主神|至高神)\s*(初期|中期|后期|巅峰)?/;

  /* 把一段 GM 回复剥成纯正文：去掉选项区、LaTeX 面板、分隔线 */
  function narrativeOf(txt) {
    let s = String(txt || '');
    const cut = s.search(/\n\s*(?:—{2,}|-{3,}|={3,}|\*{3,}|【你可以】|你可以[:：])/);
    if (cut > 0) s = s.slice(0, cut);
    s = s.replace(/\\\([\s\S]*?\\\)/g, ' ');
    s = s.replace(/\\\[[\s\S]*?\\\]/g, ' ');
    s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return s;
  }

  function syncFromText(txt) {
    const c = S.char;
    const src = String(txt || '');
    const hit = [];
    SYNC_MAP.forEach(({ k, m, re }) => {
      const x = re.exec(src);
      if (!x) return;
      const v1 = Number(String(x[1]).replace(/,/g, ''));
      if (!isFinite(v1)) return;
      if (Number(c[k]) !== v1) { c[k] = v1; hit.push(k); }
      if (m && x[2] != null) {
        const v2 = Number(x[2]);
        if (isFinite(v2) && v2 > 0 && Number(c[m]) !== v2) { c[m] = v2; hit.push(m); }
      }
    });
    // 境界只在确实写成「境界：川境中期」或面板行首时同步，避免把台词里的词当升级
    const rm = /(?:境界|修为)\s*[:：]\s*/.exec(src) ? REALM_RE.exec(src.slice(src.search(/(?:境界|修为)\s*[:：]/))) : null;
    if (rm) {
      if (c.realm !== rm[1]) { c.realm = rm[1]; hit.push('realm'); }
      if (rm[2] && c.sub !== rm[2]) { c.sub = rm[2]; hit.push('sub'); }
    }
    return hit;
  }

  /* 一条窄状态条：跑团时不点开面板也知道自己还剩多少气 */
  function statStrip(c) {
    const pct = (v, m) => Math.max(0, Math.min(100, Math.round((Number(v) || 0) / (Number(m) || 1) * 100)));
    const one = (icon, label, v, m, color) => `
      <span class="sbar" title="${label} ${v}/${m}">
        <span class="sbl">${icon}${label}</span>
        <span class="sbtr"><i style="width:${pct(v, m)}%;background:${color}"></i></span>
        <span class="sbv">${v}/${m}</span>
      </span>`;
    return `<div class="statstrip">
      <span class="sn"><b>${esc(c.name || '无名')}</b> ${esc(c.realm || '盏境')}${esc(c.sub || '')} · ${esc(c.seqName || '未觉醒')}</span>
      ${one('🟢', '气血', c.hp, c.hpMax, '#6fbf73')}
      ${one('🔵', '精神', c.mp, c.mpMax, '#5dade2')}
      ${one('🟠', '寿元', c.life, c.lifeMax, '#e0a030')}
      <span class="sn2">🟡 ${Number(c.money || 0)}　🟣 ${Number(c.luck || 0)}　☯ ${Number(c.karma || 0)}</span>
    </div>`;
  }

  function renderPlay(root) {
    const c = S.char;
    const ai = S.ai;
    const msgs = playMsgs().filter((m) => m.role !== 'system');
    const ready = !!(c.name || c.origin);
    const p = pal();
    const tex = LTX.assemble(briefRows(c, p), p, S.cfg.panelMode, { safe: S.cfg.safeTex });
    const lastUser = (function () {
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') return msgs[i].content;
      return '';
    })();

    root.innerHTML = `
      <div class="hd"><h2>跑团台</h2><span class="sub">填了 API Key 就能在这里直接演；不填就用复制模式</span></div>
      ${ready ? statStrip(c) : ''}
      ${ready ? '' : '<div class="card" style="border-color:#8a5a2b"><h3>还没建档</h3><p class="muted">先去「开团建档」把难度、出身、禁墟、时间线走一遍，主角才有骨头。</p><div class="wrap-actions"><button class="primary" id="go_start">去建档</button></div></div>'}

      <details class="card" ${ai.key ? '' : 'open'}><summary><b>连接设置</b> <span class="muted small">${ai.key ? '已填 Key · ' + esc(ai.model) : '未填 · 只能用复制模式'}</span></summary>
        <div class="grid2" style="margin-top:12px">
          <div><label>API 地址</label><input id="a_base" value="${esc(ai.base)}" placeholder="https://api.deepseek.com/chat/completions"></div>
          <div><label>模型</label><input id="a_model" value="${esc(ai.model)}" placeholder="deepseek-chat"></div>
        </div>
        <div style="margin-top:10px"><label>API Key（只存在这台设备的本地存档里）</label><input id="a_key" type="password" value="${esc(ai.key)}" placeholder="sk-..."></div>
        <div class="wrap-actions">
          <button class="primary" id="a_save">保存设置</button>
          <button id="a_test">测试连接</button>
          <button id="a_new">开新对话（重发设定）</button>
          <button id="a_copy_sys">复制 GM 设定全文</button>
          <button id="a_export">导出对话</button>
        </div>
        <div class="hint" id="a_testout" style="margin-top:8px"></div>
      </details>

      ${ai.error ? `<div class="card" style="border-color:#c0392b"><h3>上一次没走通</h3><pre class="code">${esc(ai.error)}</pre><div class="wrap-actions"><button class="primary" id="c_retry">重发上一条</button><button id="c_clearerr">知道了</button></div></div>` : ''}

      <div class="card">
        <h3>台上 <span class="tag">${msgs.length} 条</span>${msgs.length ? '<button class="sm" id="c_fold" style="float:right">折叠旧记录</button>' : ''}</h3>
        <div class="chat${S.cfg.foldOld ? ' folded' : ''}" id="chat">
          ${msgs.length ? (function () {
            const CAP = 24;
            const hidden = (!S.cfg.showAll && msgs.length > CAP + 6) ? msgs.length - CAP : 0;
            const shown = hidden ? msgs.slice(hidden) : msgs;
            const base = msgs.length - shown.length;
            return (hidden ? `<button class="sm more" id="c_more">↑ 上面还有 ${hidden} 条，点开</button>` : '')
              + shown.map((m, i) => {
                const idx = base + i;
                return `
            <div class="msg ${m.role}${(S.cfg.foldOld && idx < msgs.length - 4) ? ' old' : ''}">
              <div class="who">${m.role === 'user' ? '你' : 'GM'}</div>
              <div class="body">${m.role === 'user' ? '<p>' + esc(m.content).replace(/\n/g, '<br>') + '</p>' : richText(m.content)}</div>
              <button class="mcopy" data-i="${idx}" title="复制这一条">⧉</button>
              ${(m.role === 'assistant' && idx === msgs.length - 1 && !ai.busy) ? '<button class="mredo" data-redo="1" title="删掉这段，让 GM 重写">↻ 重写</button>' : ''}
            </div>`;
              }).join('');
          })() : `<div class="empty" style="padding:22px 6px;text-align:center">
            <div class="muted" style="margin-bottom:12px">还没有开场。写一句你想做的事，比如「我推开门」。</div>
            <button class="primary" id="c_open">按我的设定开场</button>
            <div class="hint" style="margin-top:10px">会用你建档时的难度、出身、禁墟、地点和时间线，直接扔进第一幕。</div>
          </div>`}
          ${ai.busy ? `<div class="msg assistant live"><div class="who">GM</div><div class="body" id="stream_body">${ai.streaming ? richText(ai.streaming) : '<p class="muted thinking">正在写…</p>'}</div></div>` : ''}
        </div>
        <div class="composer">
          <div class="quickopts">
            <span class="muted small">选哪个：</span>
            ${[1, 2, 3, 4, 5, 0].map((n) => `<button class="sm" data-opt="${n}">${n === 0 ? '0 自己来' : n}</button>`).join('')}
          </div>
          <textarea id="c_in" rows="3" placeholder="你要做什么？写动作或原话，比如：我把刀插回鞘，退到墙角，问她是谁。">${esc(ai.draft || '')}</textarea>
          <div class="wrap-actions">
            ${ai.busy
              ? '<button class="primary" id="c_stop">停下</button>'
              : `<button class="primary" id="c_send">发送</button>`}
            <button id="c_d20">掷个 1d20</button>
            <button id="c_d100">掷个 1d100</button>
            <button id="c_sync" title="从 GM 最后那段回复里把气血／精神力／钱这些数抄回存档">同步面板数值</button>
            <button id="c_panel">复制当前面板 LaTeX</button>
          </div>
        </div>
      </div>`;

    const gs = $('#go_start');
    if (gs) gs.addEventListener('click', () => go('start'));
    const op = $('#c_open');
    if (op) op.addEventListener('click', () => sendAI('（开场。从我档案里的时间线和地点起手，直接把我扔进第一幕。不要在正文里复述设定。）'));
    $('#a_save').addEventListener('click', () => {
      ai.base = normBase($('#a_base').value.trim() || ai.base);
      ai.model = $('#a_model').value.trim() || ai.model;
      ai.key = $('#a_key').value.trim();
      pushSys();
      persist(); render(); toast('已保存');
    });
    $('#a_test').addEventListener('click', async () => {
      const out = $('#a_testout');
      const base = normBase($('#a_base').value.trim() || ai.base);
      const key = ($('#a_key').value.trim() || ai.key);
      const model = ($('#a_model').value.trim() || ai.model);
      out.innerHTML = '<span class="muted">连接中…</span>';
      try {
        const r = await apiPost(base, { model, messages: [{ role: 'user', content: 'ping' }], stream: false, max_tokens: 1 }, key);
        if (r.ok) {
          out.innerHTML = '<span style="color:#6fbf73">连通 ✓　HTTP ' + r.status + '</span>';
        } else {
          const d = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
          out.innerHTML = '<span style="color:#c0392b">HTTP ' + r.status + '</span><br>' + esc(String(d).slice(0, 240));
        }
      } catch (e) {
        out.innerHTML = '<span style="color:#c0392b">没通</span><br>' + esc(String((e && e.message) || e)).replace(/\n/g, '<br>');
      }
    });
    $('#a_new').addEventListener('click', () => {
      ai.msgs = [];
      ai.error = '';
      ai.streaming = '';
      pushSys();
      persist(); render(); toast('新对话准备好了');
    });
    $('#a_copy_sys').addEventListener('click', () => copy(gmSystemPrompt(), 'GM 设定'));
    $('#a_export').addEventListener('click', () => {
      const txt = playMsgs().map((m) => (m.role === 'user' ? '【我】' : m.role === 'assistant' ? '【GM】' : '【设定】') + '\n' + m.content).join('\n\n');
      if (window.Capacitor || /iPhone|iPad|iPod/.test(navigator.userAgent)) { copy(txt, '全部对话'); return; }
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '斩神对话_' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const ta = $('#c_in');
    ta.addEventListener('input', () => { ai.draft = ta.value; });
    const touch = window.matchMedia && window.matchMedia('(hover:none)').matches;
    ta.addEventListener('keydown', (e) => {
      /* 中文输入法选词时回车是在确认候选，不能当成发送 */
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key !== 'Enter') return;
      /* 电脑上 Ctrl/⌘+Enter 发；手机上回车发（换行按 Shift+Enter） */
      if (e.ctrlKey || e.metaKey || (touch && !e.shiftKey)) {
        e.preventDefault();
        sendAI(ta.value);
        if (touch) ta.blur();
      }
    });
    /* 手机上点输入框，等键盘弹起来再把输入区滚进视野 */
    ta.addEventListener('focus', () => { setTimeout(() => { try { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ignore */ } }, 320); });
    const snd = $('#c_send');
    if (snd) snd.addEventListener('click', () => sendAI(ta.value));
    const stp = $('#c_stop');
    if (stp) stp.addEventListener('click', () => stopStream());
    const rty = $('#c_retry');
    if (rty) rty.addEventListener('click', () => { ai.error = ''; sendAI(lastUser); });
    const cer = $('#c_clearerr');
    if (cer) cer.addEventListener('click', () => { ai.error = ''; persist(); render(); });
    const fld = $('#c_fold');
    if (fld) fld.addEventListener('click', () => { S.cfg.foldOld = !S.cfg.foldOld; persist(); render(); });
    const more = $('#c_more');
    if (more) more.addEventListener('click', () => { S.cfg.showAll = true; persist(); render(); });
    $$('.mredo').forEach((b) => b.addEventListener('click', () => {
      if (ai.busy) return;
      /* 删掉最后那段 GM 回复，用它前面那条「你」重跑一次 */
      let cut = -1;
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') { cut = i; break; }
      if (cut < 0) return;
      const prev = (function () {
        for (let i = cut - 1; i >= 0; i--) if (msgs[i].role === 'user') return msgs[i].content;
        return '';
      })();
      msgs.splice(cut, 1);
      ai.error = '';
      persist();
      if (!prev) { render(); toast('前面没有你的那句，重写不了'); return; }
      sendAI(prev);
    }));
    $$('.mcopy').forEach((b) => b.addEventListener('click', () => {
      const m = msgs[Number(b.dataset.i)];
      if (m) copy(m.content, m.role === 'user' ? '你那条' : 'GM 那段');
    }));
    $('#c_d20').addEventListener('click', () => {
      const v = roll(20);
      ta.value = (ta.value ? ta.value + ' ' : '') + '（我掷了 1d20：' + v + '）';
      ai.draft = ta.value; ta.focus();
    });
    $('#c_d100').addEventListener('click', () => {
      const v = roll(100);
      ta.value = (ta.value ? ta.value + ' ' : '') + '（我掷了 1d100：' + v + '）';
      ai.draft = ta.value; ta.focus();
    });
    $('#c_panel').addEventListener('click', () => copy(tex, '面板 LaTeX'));
    $('#c_sync').addEventListener('click', () => {
      const last = (function () {
        for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') return msgs[i].content;
        return '';
      })();
      if (!last) { toast('还没有 GM 的回复'); return; }
      const hit = syncFromText(last);
      persist();
      if (hit.length) { render(); toast('抄回来 ' + hit.length + ' 项：' + hit.slice(0, 4).join('／')); }
      else toast('最后那段里没找到面板数值');
    });
    $$('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      const n = b.dataset.opt;
      ta.value = n === '0' ? '' : '我选 ' + n + '。';
      if (n === '0') ta.placeholder = '自己写：你要做什么？';
      ai.draft = ta.value;
      ta.focus();
    }));
    const box = $('#chat');
    if (box) box.scrollTop = box.scrollHeight;
  }

  /* ============================================================
     骰子台
     ============================================================ */
  function renderDice(root) {
    root.innerHTML = `
      <div class="hd"><h2>骰子台</h2><span class="sub">铁律 21 · 一切判定走骰子，骰值必须公示</span></div>
      <div class="dice-wrap">
        <div>
          <div class="card">
            <h3>1d100 判定 <span class="tag">≤ 成功率 即成功｜1–5 大失败｜96–100 大成功</span></h3>
            <div class="row tight">
              ${G.DICE_DIFFICULTY.map(([n, v]) => `<button class="sm" data-diff="${v}">${n} ${v}</button>`).join('')}
              <input id="f_rate" type="number" min="1" max="100" value="60" style="flex:0 0 110px">
              <input id="f_mod" type="number" value="0" style="flex:0 0 110px" placeholder="修正">
              <button class="primary" id="btn_d100">掷</button>
            </div>
            <div class="hint" style="margin-top:8px">修正：属性加成／环境／状态，写成 +10 或 -15。判定式＝1d100，成功线＝成功率+修正。</div>
            <div id="out_d100" class="roll-out" style="margin-top:14px"><div class="muted">等一次掷骰。</div></div>
          </div>

          <div class="card">
            <h3>对抗 / 自由骰</h3>
            <div class="row tight">
              <button id="btn_vs">1d20 对抗</button>
              <span class="muted small">我方修正</span><input id="f_ma" type="number" value="0" style="flex:0 0 90px">
              <span class="muted small">对方修正</span><input id="f_mb" type="number" value="0" style="flex:0 0 90px">
            </div>
            <div class="row tight" style="margin-top:10px">
              <input id="f_dice" value="2d6+1" style="flex:0 0 160px">
              <button id="btn_free">掷自由骰</button>
              <span class="hint">格式：NdM+K，如 1d20、3d6、1d100-5</span>
            </div>
            <div id="out_free" class="roll-out" style="margin-top:14px;min-height:120px"><div class="muted">等一次掷骰。</div></div>
          </div>
        </div>

        <div class="card">
          <h3>骰史 <span class="tag">${S.dice.length} 条</span></h3>
          <div class="log">
            ${S.dice.length ? S.dice.map((d) => `<div class="item"><span class="tm">${new Date(d.t).toLocaleTimeString('zh-CN', { hour12: false })}</span><span>${esc(d.kind)}</span><span class="rs ${d.ok === false ? 'f' : ''}">${esc(String(d.val))}</span></div>`).join('') : '<div class="muted small">还没有骰子。</div>'}
          </div>
          <div class="wrap-actions"><button class="sm danger" id="btn_cleardice">清空骰史</button></div>
        </div>
      </div>`;

    $$('[data-diff]').forEach((b) => b.addEventListener('click', () => { $('#f_rate').value = b.dataset.diff; }));

    $('#btn_d100').addEventListener('click', () => {
      const rate = Math.max(1, Math.min(100, Number($('#f_rate').value) || 60));
      const mod = Number($('#f_mod').value) || 0;
      const target = Math.max(1, Math.min(100, rate + mod));
      const r = roll(100);
      let verdict, cls, extra = '';
      if (r <= 5) { verdict = '大失败 · 翻车'; cls = 'fail'; extra = '骰出 1–5，无论成功率多高都算翻车。'; }
      else if (r >= 96) { verdict = '大成功 · 意外之喜'; cls = 'crit'; extra = '骰出 96–100，低属性也能翻盘。'; }
      else if (r <= target) { verdict = '成功'; cls = 'crit'; }
      else { verdict = '失败'; cls = 'fail'; extra = '差值 ' + (r - target) + ' 点。'; }
      $('#out_d100').innerHTML = `
        <div class="num ${cls}">${r}</div>
        <div class="verdict">${verdict}</div>
        <div class="formula">判定：${r}/${target} ${verdict.startsWith('成功') || verdict.startsWith('大成功') ? '成功' : '失败'}　（成功率 ${rate} ${mod >= 0 ? '+' : ''}${mod}）</div>
        ${extra ? `<div class="detail">${extra}</div>` : ''}`;
      S.dice.unshift({ t: Date.now(), kind: `1d100 判定 ${rate}${mod >= 0 ? '+' : ''}${mod}`, val: `${r}/${target}`, ok: cls !== 'fail' });
      S.dice = S.dice.slice(0, 200);
      persist(); renderNav();
    });

    $('#btn_vs').addEventListener('click', () => {
      const ma = Number($('#f_ma').value) || 0;
      const mb = Number($('#f_mb').value) || 0;
      const a = roll(20), b = roll(20);
      const sa = a + ma, sb = b + mb;
      const win = sa > sb;
      const tie = sa === sb;
      $('#out_free').innerHTML = `
        <div class="num ${tie ? '' : win ? 'crit' : 'fail'}" style="font-size:34px">${a} <span style="opacity:.4">vs</span> ${b}</div>
        <div class="verdict">${tie ? '平手（再掷一次定先后手）' : win ? '我方先手／命中' : '对方先手／命中'}</div>
        <div class="formula">我方 ${a}${ma >= 0 ? '+' : ''}${ma}=${sa}　对方 ${b}${mb >= 0 ? '+' : ''}${mb}=${sb}</div>`;
      S.dice.unshift({ t: Date.now(), kind: `1d20 对抗 (${ma}/${mb})`, val: `${sa} : ${sb}`, ok: win });
      S.dice = S.dice.slice(0, 200);
      persist(); renderNav();
    });

    $('#btn_free').addEventListener('click', () => {
      const expr = $('#f_dice').value.trim();
      const m = /^(\d{1,2})d(\d{1,4})([+-]\d{1,3})?$/i.exec(expr.replace(/\s/g, ''));
      if (!m) return toast('格式：NdM+K');
      const n = Math.min(20, Number(m[1])), faces = Number(m[2]), k = Number(m[3] || 0);
      const vals = Array.from({ length: n }, () => roll(faces));
      const sum = vals.reduce((a, b) => a + b, 0) + k;
      $('#out_free').innerHTML = `
        <div class="num">${sum}</div>
        <div class="formula">${vals.join(' + ')}${k ? (k > 0 ? ' + ' + k : ' - ' + Math.abs(k)) : ''}</div>`;
      S.dice.unshift({ t: Date.now(), kind: expr, val: String(sum) });
      S.dice = S.dice.slice(0, 200);
      persist(); renderNav();
    });

    $('#btn_cleardice').addEventListener('click', () => {
      S.dice = []; persist(); render(); toast('骰史已清空');
    });
  }

  /* ============================================================
     面板工坊
     ============================================================ */
  function briefRows(c, p) {
    const rows = [];
    rows.push({ type: 'title', text: `✦ 长夜面板 · ${c.year || '第 1 年'}` });
    rows.push({ type: 'line', text: `👤 ${c.name || '未命名'}｜${c.realm}${c.sub}｜${di().name}难度` });
    rows.push({ type: 'line', text: `🟢 气血 ${c.hp}/${c.hpMax}　${LTX.bar(c.hp, c.hpMax, p.accent, '#D5D8DC')}` });
    rows.push({ type: 'line', text: `🔵 精神力 ${c.mp}/${c.mpMax}　${LTX.bar(c.mp, c.mpMax, p.accent, '#D5D8DC')}` });
    rows.push({ type: 'line', text: `❤️ 心性 ${c.mind}｜🟠 剩余寿命 ${c.life}/${c.lifeMax} 年` });
    rows.push({ type: 'line', text: `🟡 大夏币 ${c.money}｜🟣 气运 ${c.luck}｜☯ 因果 ${c.karma}` });
    rows.push({ type: 'line', text: `📍 ${c.location || '未知'}` });
    rows.push({ type: 'line', text: `🎒 ${c.bag || '空'}` });
    rows.push({ type: 'line', text: `📜 ${c.seqNo ? '序列' + String(c.seqNo).padStart(3, '0') + '【' + c.seqName + '】' : '禁墟未觉醒'}` });
    return rows;
  }

  function fullRows(c, p) {
    const rows = [];
    rows.push({ type: 'title', text: `✦ 斩神问道 · 角色总览 · ${c.year || '第 1 年'}` });
    rows.push({ type: 'line', text: `👤 ${c.name || '未命名'}｜🎭 ${c.gender}｜🌸 ${c.orient}｜🎲 ${di().name}` });
    rows.push({ type: 'line', text: `🟡 境界：${c.realm}${c.sub}（精神力修为 ${c.mp}/${c.mpMax}）｜称号：${c.title || '无'}` });
    rows.push({ type: 'div' });
    rows.push({ type: 'line', text: `🟢 气血 ${c.hp}/${c.hpMax}　${LTX.bar(c.hp, c.hpMax, p.accent, '#D5D8DC')}` });
    rows.push({ type: 'line', text: `🔵 精神力 ${c.mp}/${c.mpMax}　${LTX.bar(c.mp, c.mpMax, p.accent, '#D5D8DC')}` });
    rows.push({ type: 'line', text: `🟠 剩余寿命 ${c.life}/${c.lifeMax} 年　${LTX.bar(c.life, c.lifeMax, p.accent, '#D5D8DC')}` });
    rows.push({ type: 'line', text: `❤️ 心性 ${c.mind}｜🟣 气运 ${c.luck}｜☯ 因果 ${c.karma}` });
    rows.push({ type: 'line', text: `🟡 大夏币 ${c.money}｜🟪 杀业 ${c.kills}｜名望 ${c.fame}` });
    rows.push({ type: 'line', text: `📜 禁墟：${c.seqNo ? '序列' + String(c.seqNo).padStart(3, '0') + '【' + c.seqName + '】' : '未觉醒'}` });
    rows.push({ type: 'line', text: `⚔️ 禁墟技：${c.seqSub || '待觉醒'}｜📿 禁物：${c.notes || '无'}` });
    rows.push({ type: 'line', text: `🎒 背包：${c.bag || '空'}` });
    rows.push({ type: 'line', text: `👥 关系网：${(c.favor || []).length ? c.favor.map((f) => `${f.name}（${f.tier}）`).join('、') : '尚无'}` });
    rows.push({ type: 'line', text: `🏯 势力：${c.origin || '无'}` });
    rows.push({ type: 'line', text: `📍 ${c.location || '未知'}` });
    rows.push({ type: 'line', text: `🟠 特殊状态：无` });
    rows.push({ type: 'foot', text: `—— 长夜未明 · 骰值已公示 ——` });
    return rows;
  }

  function renderPanel(root) {
    const c = S.char;
    const p = pal();
    const builder = S.cfg.panelType === 'full' ? fullRows : briefRows;
    const rows = builder(c, p);
    const tex = LTX.assemble(rows, p, S.cfg.panelMode, { safe: S.cfg.safeTex });
    renderPanel._tex = tex;

    root.innerHTML = `
      <div class="hd"><h2>面板工坊</h2><span class="sub">数据美化指令 ＋ 表格美化指令 · 10 套配色 · 双条进度条</span></div>
      <div class="grid2">
        <div>
          <div class="card">
            <h3>配色方案</h3>
            <div class="opts" style="grid-template-columns:1fr 1fr">
              ${PAL.map((x, i) => `<div class="opt ${S.cfg.palette === i ? 'sel' : ''}" data-pal="${i}" style="padding:9px 11px">
                <div class="no" style="background:${x.border};color:#fff">${i + 1}</div>
                <div class="body"><div class="t" style="font-size:12.5px">${esc(x.name)}</div>
                <div class="d" style="display:flex;gap:3px;margin-top:5px">
                  ${[x.border, x.bg, x.titleBg, x.titleFg, x.body, x.accent].map((col) => `<span style="width:14px;height:14px;border-radius:3px;background:${col};border:1px solid rgba(255,255,255,.15)"></span>`).join('')}
                </div></div></div>`).join('')}
            </div>
          </div>

          <div class="card">
            <h3>属性数值 <span class="tag">改了立刻重算</span></h3>
            <div class="grid2">
              ${[['气血', 'hp', 'hpMax'], ['精神力', 'mp', 'mpMax'], ['剩余寿命', 'life', 'lifeMax']].map(([label, k, km]) => `
                <div><label>${label} 当前／上限</label><div class="row tight"><input type="number" data-num="${k}" value="${c[k]}"><input type="number" data-num="${km}" value="${c[km]}"></div></div>`).join('')}
              <div><label>心性</label><input type="number" data-num="mind" value="${c.mind}"></div>
              <div><label>气运 0–100</label><input type="number" data-num="luck" value="${c.luck}"></div>
              <div><label>因果</label><input type="number" data-num="karma" value="${c.karma}"></div>
              <div><label>大夏币</label><input type="number" data-num="money" value="${c.money}"></div>
              <div><label>杀业</label><input type="number" data-num="kills" value="${c.kills}"></div>
              <div><label>名望</label><input type="number" data-num="fame" value="${c.fame}"></div>
            </div>
            <div class="grid2" style="margin-top:12px">
              <div><label>境界</label><select data-num="realm">${G.REALMS.map((r) => `<option ${r.name === c.realm ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
              <div><label>小境</label><select data-num="sub">${G.SUB.map((s) => `<option ${s === c.sub ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
              <div><label>年份标记</label><input data-num="year" value="${esc(c.year)}"></div>
              <div><label>称号</label><input data-num="title" value="${esc(c.title)}"></div>
              <div><label>背包</label><input data-num="bag" value="${esc(c.bag)}"></div>
              <div><label>禁物／备注</label><input data-num="notes" value="${esc(c.notes)}"></div>
            </div>
          </div>

          <div class="card">
            <h3>面板设置</h3>
            <div class="row tight">
              <button class="${S.cfg.panelType !== 'full' ? 'primary' : ''}" data-pt="brief">精简面板</button>
              <button class="${S.cfg.panelType === 'full' ? 'primary' : ''}" data-pt="full">完整面板</button>
              <button class="${S.cfg.panelMode === 'chat' ? 'primary' : ''}" data-pm="chat">逐行版</button>
              <button class="${S.cfg.panelMode === 'box' ? 'primary' : ''}" data-pm="box">盒装版</button>
              <label style="display:flex;gap:6px;align-items:center;flex:0 0 auto"><input type="checkbox" id="cb_safe" ${S.cfg.safeTex ? 'checked' : ''} style="width:auto">中文包 \text{}（兼容性更好）</label>
            </div>
            <div class="hint" style="margin-top:8px">逐行版＝每行 \textcolor 后换行，粘贴到聊天窗最稳；盒装版＝\fcolorbox＋array，能画出真正的边框底色，但对手的渲染器要求高一点。</div>
          </div>
        </div>

        <div>
          <div class="card">
            <h3>实时预览</h3>
            <div class="panel-preview" id="pv" style="border-color:${p.border};background:${p.bg};color:${p.body}">${LTX.render(tex)}</div>
          </div>
          <div class="card">
            <h3>面板代码 <span class="tag">${tex.length} 字符 · ${rows.length} 行</span></h3>
            <pre class="code">${esc(tex)}</pre>
            <div class="wrap-actions">
              <button class="primary" id="btn_cp_tex">复制面板代码</button>
              <button id="btn_cp_plain">复制纯文本版</button>
            </div>
            ${rows.length > 18 ? '<div class="hint" style="color:#e88b86;margin-top:8px">⚠ 超过 18 行，规则要求拆成两块。</div>' : ''}
          </div>
        </div>
      </div>`;

    $$('[data-pal]').forEach((el) => el.addEventListener('click', () => { S.cfg.palette = Number(el.dataset.pal); persist(); render(); }));
    $$('[data-num]').forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.num;
      const num = el.type === 'number';
      S.char[k] = num ? Number(el.value) || 0 : el.value;
      persist();
      // 局部刷新预览，避免失焦
      const rows2 = (S.cfg.panelType === 'full' ? fullRows : briefRows)(S.char, pal());
      const tex2 = LTX.assemble(rows2, pal(), S.cfg.panelMode, { safe: S.cfg.safeTex });
      renderPanel._tex = tex2;
      $('#pv').innerHTML = LTX.render(tex2);
      const pre = $('.card pre.code');
      if (pre) pre.textContent = tex2;
    }));
    $$('[data-pt]').forEach((el) => el.addEventListener('click', () => { S.cfg.panelType = el.dataset.pt; persist(); render(); }));
    $$('[data-pm]').forEach((el) => el.addEventListener('click', () => { S.cfg.panelMode = el.dataset.pm; persist(); render(); }));
    const cb = $('#cb_safe');
    if (cb) cb.addEventListener('change', () => { S.cfg.safeTex = cb.checked; persist(); render(); });
    $('#btn_cp_tex').addEventListener('click', () => copy(renderPanel._tex, '面板代码'));
    $('#btn_cp_plain').addEventListener('click', () => {
      const rows = (S.cfg.panelType === 'full' ? fullRows : briefRows)(S.char, pal());
      const plain = rows.map((r) => (r.type === 'title' ? r.text : r.type === 'div' ? '────────' : r.type === 'foot' ? r.text : r.type === 'line' ? r.text : '')).filter(Boolean).join('\n');
      copy(plain, '纯文本面板');
    });
  }

  /* ============================================================
     AI 味闸门
     ============================================================ */
  function renderScan(root) {
    const txt = S.lastScanText || '';
    root.innerHTML = `
      <div class="hd"><h2>AI 味闸门</h2><span class="sub">活人感写作规约 v1.0 · 十道闸门 · 高档次</span></div>
      <div class="card">
        <h3>把 AI 写的叙事粘进来</h3>
        <textarea id="ta" rows="10" placeholder="叙事段落、对话、面板以外的全部文字……">${esc(txt)}</textarea>
        <div class="wrap-actions">
          <button class="primary" id="btn_scan">过闸门</button>
          <button id="btn_clear">清空</button>
          <button id="btn_demo">填一段反面教材</button>
          <span class="hint" id="cnt">${txt.length} 字符</span>
        </div>
      </div>
      <div id="result"></div>`;

    const ta = $('#ta');
    ta.addEventListener('input', () => {
      S.lastScanText = ta.value;
      $('#cnt').textContent = ta.value.length + ' 字符';
      persist();
    });
    $('#btn_clear').addEventListener('click', () => { ta.value = ''; S.lastScanText = ''; persist(); $('#result').innerHTML = ''; $('#cnt').textContent = '0 字符'; });
    $('#btn_demo').addEventListener('click', () => {
      ta.value = '夜色渐深，林夜缓缓抬起头，眼眸深处闪过一丝复杂的情绪。空气中弥漫着一股淡淡的血腥味，那是一种无法言喻的压迫感——不是恐惧，而是某种更深沉的东西。\n\n他深吸一口气，指尖微微颤抖。那一刻，他忽然明白了，从今往后，这条路上再也不会有人陪他走下去了。\n\n「你走吧。」他轻声说道。\n「……我等你。」她眼眶泛红，嘴角却勾起一抹苦笑。\n\n这不仅仅是一场告别，更是一个时代的终结。命运的齿轮，已经开始转动。';
      S.lastScanText = ta.value; persist(); $('#cnt').textContent = ta.value.length + ' 字符';
      doScan();
    });
    $('#btn_scan').addEventListener('click', doScan);

    function doScan() {
      const res = SCAN.scan(ta.value);
      S.lastScanText = ta.value;
      persist();
      const box = $('#result');
      const bars = 16;
      const on = Math.round((res.score / 100) * bars);
      const gauge = `<span class="gauge">执行程度 <span class="on">${'█'.repeat(on)}</span><span class="off">${'░'.repeat(bars - on)}</span> ${res.score}%</span>`;

      box.innerHTML = `
        <div class="card">
          <h3>闸门结果</h3>
          <div class="scan-stats">
            ${gauge}
            <span class="pill ${res.stats.t1 ? 'red' : 'green'}">一级词 ${res.stats.t1}</span>
            <span class="pill ${res.stats.t2over ? 'red' : 'green'}">二级超额 ${res.stats.t2over}</span>
            <span class="pill ${res.stats.patterns ? 'red' : 'green'}">禁用句式 ${res.stats.patterns}</span>
            <span class="pill ${res.stats.cliches ? 'red' : 'green'}">模板台词 ${res.stats.cliches}</span>
            <span class="pill ${res.stats.meta ? 'red' : 'green'}">元叙述 ${res.stats.meta}</span>
            <span class="pill blue">${res.stats.chars} 字 · ${res.stats.sents} 句 · 均长 ${res.stats.avgLen.toFixed(1)}</span>
          </div>
          <div class="wrap-actions">
            <button class="primary" id="btn_rw">复制重写指令给 AI</button>
            <button id="btn_hits">复制命中清单</button>
            <button id="btn_toround">存为一条回合记录</button>
          </div>
        </div>
        <div class="grid2">
          <div class="card">
            <h3>十道闸门</h3>
            <div class="hits">
              ${res.checks.map((c) => `<div class="hit ${c.pass ? '' : 'lv2'}" style="border-left-color:${c.pass ? 'var(--green)' : 'var(--red)'}">
                <div class="top"><b style="color:${c.pass ? '#74c79a' : '#e88b86'}">${c.pass ? '✓' : '✗'} ${esc(c.name)}</b></div>
                <div class="fix">${esc(c.detail)}</div>
              </div>`).join('')}
            </div>
          </div>
          <div class="card">
            <h3>命中清单 <span class="tag">${res.hits.length} 处</span></h3>
            <div class="hits scroll-y">
              ${res.hits.length ? res.hits.slice(0, 120).map((h) => `<div class="hit ${h.level === 2 ? 'lv2' : h.level === 3 ? 'lv3' : h.level === 4 ? '' : ''}">
                <div class="top"><span class="pill ${h.level === 1 ? 'red' : h.level === 2 ? 'gold' : 'blue'}">L${h.level} ${esc(h.kind)}</span><span class="word">${esc(h.word)}</span></div>
                <div class="ctx">…${esc(h.ctx.before)}<mark>${esc(h.ctx.hit)}</mark>${esc(h.ctx.after)}…</div>
                ${h.fix ? `<div class="fix">→ ${esc(h.fix)}</div>` : ''}
              </div>`).join('') : '<div class="muted small">没有命中。干净得有点可疑，自己再读一遍。</div>'}
            </div>
          </div>
        </div>
        <div class="card">
          <h3>高亮原文</h3>
          <div class="marked">${SCAN.highlight(ta.value, res.spans)}</div>
          <div class="hint" style="margin-top:8px">红＝一级禁用词／元叙述，黄＝二级超额，蓝＝禁用句式，紫＝模板台词。</div>
        </div>`;

      $('#btn_rw').addEventListener('click', () => copy(SCAN.rewritePrompt(res, ta.value), '重写指令'));
      $('#btn_hits').addEventListener('click', () => {
        copy(res.hits.map((h, i) => `${i + 1}. [L${h.level}] ${h.kind}：${h.word}`).join('\n'), '命中清单');
      });
      $('#btn_toround').addEventListener('click', () => {
        S.rounds.unshift({
          t: Date.now(),
          title: '（未命名回合）',
          summary: ta.value.slice(0, 120),
          time: '', place: S.char.location || '', body: '', item: '', promise: '',
          score: res.score,
          hits: res.hits.length,
        });
        persist(); toast('已存进回合记录');
      });
    }

    if (txt) doScan();
  }

  /* ============================================================
     规则全书
     ============================================================ */
  let BOOK = { tab: 'rules', chapter: 0, query: '', hits: null };

  function blocksOf(tab) {
    if (tab === 'rules') return (window.RULES && window.RULES.blocks) || [];
    if (tab === 'writing') return (window.WRITING && window.WRITING.blocks) || [];
    if (tab === 'beauty') return (window.BEAUTY && window.BEAUTY.blocks) || [];
    return (window.BEAUTY && window.BEAUTY.blocks) || [];
  }

  function bhtml(b) {
    if (b.t === 'h1') return `<h1 id="b${b.i}">${esc(b.x)}</h1>`;
    if (b.t === 'h2') return `<h2 id="b${b.i}">${esc(b.x)}</h2>`;
    if (b.t === 'h3') return `<h3 id="b${b.i}">${esc(b.x)}</h3>`;
    if (b.t === 'tbl') {
      const rows = b.rows || [];
      return `<table>${rows.map((r, i) => `<tr>${r.map((cell) => (i === 0 ? `<th>${esc(cell)}</th>` : `<td>${esc(cell)}</td>`)).join('')}</tr>`).join('')}</table>`;
    }
    return `<p id="b${b.i}">${esc(b.x)}</p>`;
  }

  function chaptersOf(blocks) {
    const out = [];
    blocks.forEach((b, i) => {
      if (b.t === 'h1') out.push({ idx: i, title: b.x, subs: [] });
      else if (b.t === 'h2' && out.length) out[out.length - 1].subs.push({ idx: i, title: b.x });
    });
    return out;
  }

  function renderBook(root) {
    const blocks = blocksOf(BOOK.tab);
    // 给每个块补 i
    blocks.forEach((b, i) => { if (b.i == null) b.i = i; });
    const chs = chaptersOf(blocks);
    if (BOOK.chapter >= chs.length) BOOK.chapter = 0;
    // 文档开头常有书名页之类的碎章，首次进入时自动落到第一个「第 N 章」
    if (!BOOK.autoJumped) {
      BOOK.autoJumped = true;
      if (BOOK.tab === 'rules' && BOOK.chapter === 0 && chs[0] &&
          (!chs[1] || chs[1].idx - chs[0].idx <= 2)) {
        const i = chs.findIndex((c) => /^第\s*\d+\s*章/.test(c.title));
        if (i > 0) BOOK.chapter = i;
      }
    }

    const cur = chs[BOOK.chapter] || { idx: 0, title: '' };
    const nextIdx = chs[BOOK.chapter + 1] ? chs[BOOK.chapter + 1].idx : blocks.length;

    let doc;
    if (BOOK.query) {
      const q = BOOK.query.toLowerCase();
      const hits = [];
      blocks.forEach((b) => {
        const text = b.t === 'tbl' ? (b.rows || []).map((r) => r.join(' ')).join(' ') : b.x || '';
        if (text.toLowerCase().includes(q)) hits.push(b);
      });
      BOOK.hits = hits.length;
      const rx = new RegExp(BOOK.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      doc = `<h1>搜索「${esc(BOOK.query)}」· ${hits.length} 条</h1>` +
        (hits.length ? hits.slice(0, 300).map((b) => `<div>${bhtml(b).replace(rx, (m) => `<mark>${esc(m)}</mark>`)}</div>`).join('') : '<p class="muted">没有命中。</p>');
    } else {
      const slice = blocks.slice(cur.idx, nextIdx);
      const lim = Math.min(BOOK.limit || 400, slice.length);
      doc = slice.slice(0, lim).map(bhtml).join('');
      if (slice.length > lim) {
        doc += `<p style="text-align:center"><button class="primary" id="btn_more">继续加载本章（已显示 ${lim} / ${slice.length} 段）</button></p>`;
      }
    }

    root.innerHTML = `
      <div class="reader">
        <div class="toc">
          <div class="tabs" style="margin-bottom:10px">
            ${[['rules', '规则书'], ['writing', '写作规约'], ['beauty', '数据美化'], ['palette', '表格配色']].map(([k, n]) => `<div class="tb ${BOOK.tab === k ? 'on' : ''}" data-tab="${k}">${n}</div>`).join('')}
          </div>
          <div class="q">
            <input id="q" placeholder="全文搜索…" value="${esc(BOOK.query)}">
            <button class="sm" id="btn_q">搜</button>
          </div>
          ${BOOK.tab === 'palette'
            ? PAL.map((p, i) => `<a data-ch="${i}" class="${BOOK.chapter === i ? 'on' : ''}" style="display:flex;gap:6px;align-items:center"><span style="width:10px;height:10px;background:${p.border};border-radius:2px"></span>${esc(p.name)}</a>`).join('')
            : chs.map((ch, i) => `<a class="l1 ${BOOK.chapter === i ? 'on' : ''}" data-ch="${i}">${esc(ch.title)}</a>
               ${BOOK.chapter === i ? ch.subs.map((sb) => `<a class="l2" data-jump="${sb.idx}">${esc(sb.title)}</a>`).join('') : ''}`).join('')}
        </div>
        <div class="doc" id="doc">
          <button class="sm mtoc" id="btn_toc">☰ 目录 · 搜索</button>
          ${BOOK.tab === 'palette' ? paletteDoc(BOOK.chapter) : doc}
        </div>
      </div>`;

    $$('[data-tab]').forEach((el) => el.addEventListener('click', () => {
      BOOK.tab = el.dataset.tab; BOOK.chapter = 0; BOOK.query = ''; BOOK.limit = 400; renderBook(root);
    }));
    $$('[data-ch]').forEach((el) => el.addEventListener('click', () => {
      BOOK.chapter = Number(el.dataset.ch); BOOK.query = ''; BOOK.limit = 400; renderBook(root);
    }));
    const more = $('#btn_more');
    if (more) more.addEventListener('click', () => { BOOK.limit = (BOOK.limit || 400) + 400; renderBook(root); });
    $$('[data-jump]').forEach((el) => el.addEventListener('click', () => {
      const id = 'b' + el.dataset.jump;
      const target = document.getElementById(id);
      if (target) { target.scrollIntoView({ block: 'start' }); target.classList.add('hl'); setTimeout(() => target.classList.remove('hl'), 1600); }
    }));
    const tocBtn = $('#btn_toc');
    if (tocBtn) tocBtn.addEventListener('click', () => {
      const rd = document.querySelector('.reader');
      if (rd) rd.classList.toggle('toc-open');
    });
    const q = $('#q');
    const doSearch = () => { BOOK.query = q.value.trim(); BOOK.hits = null; renderBook(root); };
    $('#btn_q').addEventListener('click', doSearch);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    $('#doc').addEventListener('click', (e) => {
      const a = e.target.closest('[data-usepal]');
      if (a) { S.cfg.palette = Number(a.dataset.usepal); persist(); toast('已切换到该配色'); renderSideFoot(); }
    });
  }

  function paletteDoc(i) {
    const p = PAL[i] || PAL[0];
    const c = S.char;
    const rows = briefRows(c, p);
    const tex = LTX.assemble(rows, p, S.cfg.panelMode, { safe: S.cfg.safeTex });
    return `
      <h1>${esc(p.name)}</h1>
      <table>
        <tr><th>槽位</th><th>色值</th><th>用途</th></tr>
        ${[['外边框', p.border, '面板外框'], ['背景底色', p.bg, '面板底色'], ['标题底色', p.titleBg, '\\colorbox 背景'], ['标题字色', p.titleFg, '标题前景'], ['正文字色', p.body, '所有属性行'], ['分隔线', p.rule, '\\overline{\\qquad×5}'], ['灰色脚注', p.foot, '\\footnotesize'], ['强调色', p.accent, '重点数值']].map(([n, v, u]) => `<tr><td>${n}</td><td class="mono">${v}</td><td>${u}</td></tr>`).join('')}
      </table>
      <p><button class="primary" data-usepal="${i}">用这套配色生成面板</button></p>
      <h2>面板预览</h2>
      <div class="panel-preview" style="border-color:${p.border};background:${p.bg};color:${p.body}">${LTX.render(tex)}</div>
      <h2>代码</h2>
      <pre class="code">${esc(tex)}</pre>`;
  }

  /* ============================================================
     存档与回合
     ============================================================ */
  function renderSave(root) {
    const c = S.char;
    root.innerHTML = `
      <div class="hd"><h2>存档与回合</h2><span class="sub">六大永久档案 · 回合流水 · 连续性核对</span></div>
      <div class="grid2">
        <div class="card">
          <h3>角色总档</h3>
          <pre class="code" style="max-height:300px">${esc(dossierText())}</pre>
          <div class="wrap-actions">
            <button id="btn_exp">导出全部存档（JSON）</button>
            <button id="btn_imp">导入存档</button>
            <button class="danger" id="btn_reset">清空全部</button>
          </div>
          <input type="file" id="file" accept=".json" style="display:none">
        </div>
        <div class="card">
          <h3>新增回合记录 <span class="tag">五项连续性核对</span></h3>
          <div class="grid2">
            <div><label>回合标题</label><input id="r_title" placeholder="第 12 回合 · 巷道里的鬼面人"></div>
            <div><label>世界时间</label><input id="r_time" placeholder="2021年 10月 3日 夜"></div>
            <div><label>地点</label><input id="r_place" value="${esc(c.location || '')}"></div>
            <div><label>身体状态</label><input id="r_body" placeholder="左肩贯穿伤，精神力 3 成"></div>
            <div><label>物品变动</label><input id="r_item" placeholder="+ 直刀｜- 大夏币 500"></div>
            <div><label>承诺／因果</label><input id="r_promise" placeholder="答应赵空城照顾她"></div>
          </div>
          <div style="margin-top:10px"><label>本回合摘要</label><textarea id="r_sum" rows="3" placeholder="发生了什么，只记事实"></textarea></div>
          <div class="wrap-actions"><button class="primary" id="btn_addround">记一条</button><button id="btn_grab">从最后一段回复抓摘要</button></div>
        </div>
      </div>
      <div class="card">
        <h3>回合流水 <span class="tag">${S.rounds.length} 条</span></h3>
        <div class="hits">
          ${S.rounds.length ? S.rounds.map((r, i) => `<div class="hit" style="border-left-color:var(--gold)">
            <div class="top">
              <b>${esc(r.title)}</b>
              <span class="pill blue">${esc(r.time || '时间未记')}</span>
              <span class="pill">${esc(r.place || '地点未记')}</span>
              ${r.score != null ? `<span class="pill ${r.score >= 80 ? 'green' : 'gold'}">闸门 ${r.score}%</span>` : ''}
              <button class="sm danger" data-del="${i}" style="margin-left:auto">删</button>
            </div>
            <div class="ctx">${esc(r.summary || '')}</div>
            <div class="fix">身体：${esc(r.body || '—')}｜物品：${esc(r.item || '—')}｜承诺：${esc(r.promise || '—')}</div>
          </div>`).join('') : '<div class="muted small">还没有回合记录。每回合结束记一条，下一回合开场先读它。</div>'}
        </div>
      </div>`;

    $('#btn_addround').addEventListener('click', () => {
      S.rounds.unshift({
        t: Date.now(),
        title: $('#r_title').value.trim() || '（未命名回合）',
        time: $('#r_time').value.trim(),
        place: $('#r_place').value.trim(),
        body: $('#r_body').value.trim(),
        item: $('#r_item').value.trim(),
        promise: $('#r_promise').value.trim(),
        summary: $('#r_sum').value.trim(),
      });
      persist(); render(); toast('记下了');
    });
    const grab = $('#btn_grab');
    if (grab) grab.addEventListener('click', () => {
      const last = (function () {
        for (let i = S.ai.msgs.length - 1; i >= 0; i--) if (S.ai.msgs[i].role === 'assistant') return S.ai.msgs[i].content;
        return '';
      })();
      if (!last) { toast('跑团台里还没有 GM 的回复'); return; }
      const txt = narrativeOf(last);
      $('#r_title').value = '第 ' + (S.rounds.length + 1) + ' 回合';
      $('#r_sum').value = txt.length > 260 ? txt.slice(0, 260) + '…' : txt;
      if (!$('#r_place').value) $('#r_place').value = S.char.location || '';
      toast('已把最后那段正文填进摘要，改完点「记一条」');
    });
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
      S.rounds.splice(Number(b.dataset.del), 1); persist(); render();
    }));
    $('#btn_exp').addEventListener('click', () => {
      const json = JSON.stringify(S, null, 2);
      const name = '斩神存档_' + new Date().toISOString().slice(0, 10) + '.json';
      /* 手机上 WKWebView 不认 a[download]，直接给剪贴板 */
      if (window.Capacitor || /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        copy(json, '存档 JSON（' + (json.length / 1024).toFixed(1) + ' KB）');
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出');
    });
    $('#btn_imp').addEventListener('click', () => $('#file').click());
    $('#file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const o = JSON.parse(fr.result);
          S = Object.assign(JSON.parse(JSON.stringify(DEF)), o);
          S.char = Object.assign(freshChar(), o.char || {});
          persist(); render(); toast('导入成功');
        } catch (err) { toast('文件读不动，不是本软件的存档'); }
      };
      fr.readAsText(f);
    });
    $('#btn_reset').addEventListener('click', () => {
      if (!confirm('清空角色、骰史、回合记录和所有设置？')) return;
      localStorage.removeItem(KEY);
      S = JSON.parse(JSON.stringify(DEF));
      persist(); render(); toast('已清空');
    });
  }

  /* ============================================================
     顶栏：主题 / 存档
     ============================================================ */
  function renderTopbar() {
    const tb = $('#topbar');
    if (!tb) return;
    const dark = isDark();
    const auto = (S.cfg.theme || 'auto') === 'auto';
    tb.innerHTML = `
      <button id="tb_theme" title="切换白天 / 黑夜">
        <span class="ic">${dark ? '🌙' : '☀️'}</span><span class="lb">${auto ? '跟随系统' : dark ? '黑夜' : '白天'}</span>
      </button>
      <button id="tb_slot" title="存档">
        <span class="ic">🗂</span><span class="lb">${esc((S.char.name || '未建档'))}</span>
      </button>`;
    $('#tb_theme').addEventListener('click', () => {
      setTheme(isDark() ? 'light' : 'dark');
    });
    $('#tb_slot').addEventListener('click', openSlotSheet);
  }

  function closeSheet() {
    const s = $('#sheet');
    if (s) s.remove();
  }

  function openSheet(html) {
    closeSheet();
    const d = document.createElement('div');
    d.id = 'sheet';
    d.className = 'on';
    d.innerHTML = `<div class="mask" data-close="1"></div><div class="pane">${html}</div>`;
    document.body.appendChild(d);
    d.querySelector('.mask').addEventListener('click', closeSheet);
    return d;
  }

  function openSlotSheet() {
    const st = readSlots();
    const list = st.list.slice().sort((a, b) => ((b.meta && b.meta.t) || 0) - ((a.meta && a.meta.t) || 0));
    const rows = list.length
      ? list.map((r) => {
        const m = r.meta || {};
        const cur = r.id === S.slotId;
        const dt = m.t ? new Date(m.t) : null;
        const when = dt ? `${dt.getMonth() + 1}月${dt.getDate()}日 ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '';
        return `<div class="slotrow ${cur ? 'cur' : ''}" data-slot="${r.id}">
          <div class="s-main">
            <div class="s-name">${esc(m.name || r.id)}</div>
            <div class="s-meta">${esc(diOf(m.diff) || '')}难度 ｜ ${m.msgs || 0} 段对话 ｜ ${m.rounds || 0} 条回合${when ? ' ｜ ' + when : ''}</div>
          </div>
          ${cur ? '<span class="s-cur">当前</span>' : ''}
          <button class="s-btn" data-rename="${r.id}">改名</button>
          <button class="s-btn danger" data-del="${r.id}">删</button>
        </div>`;
      }).join('')
      : '<div class="muted small" style="padding:8px 0">还没有其他存档。点下面「新建存档」开一份新的。</div>';

    const d = openSheet(`
      <h4>🗂 存档</h4>
      <div class="sh-sub">每份存档各自带角色、对话、骰史和回合记录。切过去就接着那一条线走。</div>
      ${rows}
      <div class="sh-act">
        <button class="primary" id="sh_new">新建存档</button>
        <button id="sh_cur_save">导出当前存档</button>
      </div>

      <div class="sh-sec">
        <div class="sh-lab">外观</div>
        <div class="themerow">
          <button data-theme="auto" class="${(S.cfg.theme || 'auto') === 'auto' ? 'on' : ''}">跟随系统</button>
          <button data-theme="light" class="${S.cfg.theme === 'light' ? 'on' : ''}">☀️ 白天</button>
          <button data-theme="dark" class="${S.cfg.theme === 'dark' ? 'on' : ''}">🌙 黑夜</button>
        </div>
      </div>

      <div class="sh-sec">
        <div class="sh-lab">导入</div>
        <button id="sh_imp" style="width:100%">从 JSON 文件导入成新存档</button>
        <input type="file" id="sh_file" accept=".json" style="display:none">
      </div>`);

    d.querySelectorAll('[data-slot]').forEach((el) => el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-del],[data-rename]')) return;
      const id = el.dataset.slot;
      closeSheet();
      if (id !== S.slotId) loadSlot(id);
    }));
    d.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      delSlot(b.dataset.del);
    }));
    d.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      renameSlot(b.dataset.rename);
    }));
    d.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
      setTheme(b.dataset.theme);
      closeSheet();
    }));
    d.querySelector('#sh_new').addEventListener('click', () => { closeSheet(); newSlot(); });
    d.querySelector('#sh_cur_save').addEventListener('click', () => {
      const json = JSON.stringify(S, null, 2);
      if (window.Capacitor || /iPhone|iPad|iPod/.test(navigator.userAgent)) { copy(json, '存档 JSON'); return; }
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '斩神存档_' + ((S.char.name || '无名') + '_' + new Date().toISOString().slice(0, 10)) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出');
    });
    d.querySelector('#sh_imp').addEventListener('click', () => d.querySelector('#sh_file').click());
    d.querySelector('#sh_file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const o = JSON.parse(fr.result);
          const m = mergeState(o);
          m.slotId = newId();
          const st2 = readSlots();
          st2.list.push({ id: m.slotId, meta: metaOf(m), data: JSON.parse(JSON.stringify(m)) });
          st2.active = m.slotId;
          writeSlots(st2);
          closeSheet();
          loadSlot(m.slotId);
        } catch (err) { toast('这个文件不是本软件的存档'); }
      };
      fr.readAsText(f);
    });
  }

  function diOf(n) {
    const d = G.DIFFICULTIES.find((x) => x.id === Number(n));
    return d ? d.name : '';
  }

  /* ---------------- 启动 ---------------- */
  window.addEventListener('error', (e) => {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;background:#3a1212;color:#ffb4b4;border-top:1px solid #c0392b;padding:10px 16px;font:12px/1.6 ui-monospace,Consolas,monospace';
    bar.textContent = '出错了：' + (e.message || '') + '　' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '');
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 9000);
  });

  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace('#', '');
    if (ROUTES.some(([id]) => id === h) && h !== S.route) { S.route = h; persist(); render(); }
  });

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    if (!S.cfg.panelType) S.cfg.panelType = 'brief';
    if (!S.ai) S.ai = JSON.parse(JSON.stringify(DEF.ai));
    if (!S.slotId) S.slotId = newId();
    const h = (location.hash || '').replace('#', '');
    if (ROUTES.some(([id]) => id === h)) S.route = h;
    persist();
    render();
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const on = () => { if ((S.cfg.theme || 'auto') === 'auto') { applyTheme(); renderTopbar(); } };
      if (mq.addEventListener) mq.addEventListener('change', on);
      else if (mq.addListener) mq.addListener(on);
    }
  });

  // data 就绪检查
  window.addEventListener('load', () => {
    if (!window.RULES) console.warn('rules.js 未加载');
    if (!window.BEAUTY) console.warn('beauty.js 未加载');
  });

  // 调试/自检接口
  window.__ZS = {
    get S() { return S; },
    set S(v) { S = v; },
    go, render, persist, gmSystemPrompt, buildPrompt, dossierText, briefRows, fullRows, sendAI,
    normBase, apiPost, trimHist, streamTry, statStrip, syncFromText, narrativeOf,
    readSlots, writeSlots, newId, loadSlot, newSlot, delSlot, renameSlot, syncSlot, metaOf, applyTheme, isDark, setTheme, openSlotSheet,
  };

})();
