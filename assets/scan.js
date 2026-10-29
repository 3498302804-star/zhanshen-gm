/* ============================================================
   scan.js — 活人感闸门扫描器
   依据：活人感写作规约 v1.0（一级词/二级限用/标点配额/句式/
        台词/元叙述/心理描写/节奏）+ 规则书铁律27
   ============================================================ */
(function (global) {
  'use strict';

  const LX = global.LEXICON || { tier1: [], tier2: [], cliches: [], groups: {} };

  /* ---------- 元叙述 / 出戏词 ---------- */
  const META = [
    ['玩家', '出戏：叙境内不许出现「玩家」'],
    ['回合', '出戏：不许说「回合」'],
    ['选项', '出戏：「选项」只允许作为分隔线后的指令，不许进叙事'],
    ['存档', '出戏：「存档」属于界面词'],
    ['读档', '出戏：界面词'],
    ['面板', '出戏：面板只出现在叙事之外'],
    ['属性值', '出戏：界面词'],
    ['状态更新', '典型 AI 收尾腔'],
    ['我记下了', '元叙述：不许向对方汇报已记录'],
    ['接下来你可以', '元叙述：替对方安排下一步'],
    ['希望你喜欢', 'AI 助手语域'],
    ['以上', '总起总收的讲义腔'],
    ['总结一下', '讲义腔'],
    ['让我们', '翻译腔＋主持人腔'],
    ['作为AI', '绝对禁止'],
    ['作为 AI', '绝对禁止'],
    ['请注意', '说教腔'],
    ['温馨提示', '说教腔'],
    ['祝你', '助手语域'],
    ['如果你愿意', '助手语域'],
    ['需要我', '助手语域'],
    ['继续吗', '助手语域'],
    ['分析如下', '讲义腔'],
    ['首先，', '讲义腔（叙事内）'],
    ['其次，', '讲义腔'],
    ['最后，', '讲义腔'],
    ['综上', '讲义腔'],
    ['值得一提', '讲义腔'],
    ['不难看出', '讲义腔'],
    ['显而易见', '讲义腔'],
    ['由此可见', '讲义腔'],
  ];

  /* ---------- 句式（正则） ---------- */
  const PATTERNS = [
    { id: 'p1', name: '不是A，而是B', re: /不是[^。！？\n]{1,20}[，,]\s*而是/g, fix: '拆成两句陈述，或直接写 B 的事实，删掉对偶。' },
    { id: 'p2', name: '与其说A不如说B', re: /与其说[^。！？\n]{1,20}[，,]?\s*不如说/g, fix: '整句删除，只留下你真正想说的那一半。' },
    { id: 'p3', name: '既A又B／不仅A更B', re: /(既[^。！？\n]{1,18}[，,]?\s*又|不仅[^。！？\n]{1,22}[，,]?\s*更)/g, fix: '只保留一个特征，另一个用动作证明。' },
    { id: 'p4', name: '仿佛／宛如……一般', re: /(仿佛|宛如|好似|如同|像是)[^。！？\n]{1,30}一般/g, fix: '比喻当填充物：换成能看见的具体物象，或直接删。' },
    { id: 'p5', name: '形容词三连', re: /[\u4e00-\u9fa5]{2}、[\u4e00-\u9fa5]{2}、[\u4e00-\u9fa5]{2}的/g, fix: '留一个最准的，其余删。' },
    { id: 'p6', name: '顿悟句', re: /那一刻[^。！？\n]{0,24}(明白|懂得|懂得|意识到|懂了)|忽然明白|突然明白/g, fix: '不许替读者总结。删掉整句，让行为自己说话。' },
    { id: 'p7', name: '预叙句', re: /知道[，,]\s*从(今|此)(往后|以后|之后)|此后[^。！？\n]{0,10}(再也|再也)/g, fix: '抢跑剧情。删，把时间留给当下这一幕。' },
    { id: 'p8', name: '意义宣告', re: /(这|那)不仅仅是[^。！？\n]{1,24}更是|不只是[^。！？\n]{1,20}[，,]?\s*(更)?是/g, fix: '强行升华。删掉后半截评价，只留事实。' },
    { id: 'p9', name: '双重否定', re: /(并非不|未尝不是|不得不承认|不得不说|不可能不)/g, fix: '绕圈子。改成正面的短句。' },
    { id: 'p10', name: '令人／让人不由得', re: /(令人[^。！？\n]{0,10}|让人不由得|使人不禁|令人不禁)/g, fix: '替读者规定反应。删，或写成具体动作。' },
    { id: 'p11', name: '心理描写', re: /(心里想|心中暗想|内心|心中涌起|暗自|他感到|她感到|我感到|觉得有些|思绪万千)/g, fix: '只写能拍到的：动作、台词、环境。心理描写一律删。' },
    { id: 'p12', name: '万能排比（三句同头）', re: /(.)[^。！？\n]{2,12}。\1[^。！？\n]{2,12}。\1[^。！？\n]{2,12}。/g, fix: '三句以上同结构＝节奏僵死。打散句子长度。' },
  ];

  /* ---------- 工具 ---------- */
  const isCJK = (c) => /[\u4e00-\u9fa5]/.test(c);

  function findAll(text, word) {
    const out = [];
    if (!word) return out;
    let idx = 0;
    while (true) {
      const p = text.indexOf(word, idx);
      if (p < 0) break;
      out.push(p);
      idx = p + word.length;
      if (out.length > 200) break;
    }
    return out;
  }

  function ctxOf(text, start, end, pad) {
    pad = pad == null ? 12 : pad;
    const a = Math.max(0, start - pad);
    const b = Math.min(text.length, end + pad);
    return {
      before: text.slice(a, start),
      hit: text.slice(start, end),
      after: text.slice(end, b),
    };
  }

  function splitParagraphs(text) {
    return text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }

  function splitSentences(text) {
    return text
      .replace(/[「」“”]/g, '')
      .split(/[。！？!?…]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /* ---------- 主扫描 ---------- */
  function scan(text) {
    const raw = String(text || '');
    const hits = [];
    const spans = [];
    const checks = [];

    function addHit(level, kind, word, index, msg, fix) {
      hits.push({ level, kind, word, index, msg: msg || '', fix: fix || '', ctx: ctxOf(raw, index, index + word.length) });
      spans.push({ start: index, end: index + word.length, level });
    }

    /* 1. 一级禁用词 */
    const t1 = [];
    LX.tier1.forEach((w) => {
      findAll(raw, w).forEach((p) => {
        t1.push({ w, p });
        addHit(1, '一级禁用词', w, p, '', '删掉，换成具体动作/物象/数字。');
      });
    });
    checks.push({
      id: 'c1',
      name: '一级禁用词',
      pass: t1.length === 0,
      detail: t1.length ? `${t1.length} 处（${[...new Set(t1.map((x) => x.w))].slice(0, 8).join('、')}${new Set(t1.map((x) => x.w)).size > 8 ? '…' : ''}）` : '零命中',
    });

    /* 2. 二级限用词 */
    const t2count = {};
    LX.tier2.forEach((w) => {
      const n = findAll(raw, w).length;
      if (n) t2count[w] = n;
    });
    const over2 = Object.entries(t2count).filter(([, n]) => n > 1);
    over2.forEach(([w, n]) => {
      findAll(raw, w).slice(1).forEach((p) => addHit(2, '二级限用超额', w, p, `本段出现 ${n} 次，配额 ≤1`, '同一回合只留一次，其余换写法。'));
    });
    checks.push({
      id: 'c2',
      name: '二级限用词配额',
      pass: over2.length === 0,
      detail: over2.length ? over2.map(([w, n]) => `${w}×${n}`).join('、') : '全部 ≤1 次',
    });

    /* 3. 句式 */
    const patHits = [];
    PATTERNS.forEach((pt) => {
      const re = new RegExp(pt.re.source, pt.re.flags.includes('g') ? pt.re.flags : pt.re.flags + 'g');
      let m;
      let guard = 0;
      while ((m = re.exec(raw)) !== null && guard++ < 60) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        patHits.push({ id: pt.id, name: pt.name, text: m[0] });
        addHit(3, '禁用句式', m[0].slice(0, 14), m.index, pt.name, pt.fix);
      }
    });
    checks.push({
      id: 'c3',
      name: '禁用句式',
      pass: patHits.length === 0,
      detail: patHits.length ? `${patHits.length} 处（${[...new Set(patHits.map((x) => x.name))].join('、')}）` : '零命中',
    });

    /* 4. 模板台词 */
    const cli = [];
    (LX.cliches || [])
      .filter((c) => c && c.length >= 4 && c.length <= 16 && !/[」』”")）]/.test(c) && !/——/.test(c))
      .forEach((c) => {
        findAll(raw, c).forEach((p) => {
          cli.push(c);
          addHit(4, '模板台词', c, p, 'AI 最爱的空话台词', '换成这一人物此刻真正会说的、有信息的短句。');
        });
      });
    checks.push({
      id: 'c4',
      name: '模板台词',
      pass: cli.length === 0,
      detail: cli.length ? `${cli.length} 处（${[...new Set(cli)].slice(0, 5).join('、')}）` : '零命中',
    });

    /* 5. 元叙述／出戏词 */
    const metaHits = [];
    META.forEach(([w, msg]) => {
      findAll(raw, w).forEach((p) => {
        metaHits.push(w);
        addHit(1, '元叙述/出戏', w, p, msg, '删除。叙事里不许留下任何「我在写东西」的痕迹。');
      });
    });
    checks.push({
      id: 'c5',
      name: '元叙述与出戏词',
      pass: metaHits.length === 0,
      detail: metaHits.length ? `${metaHits.length} 处（${[...new Set(metaHits)].slice(0, 6).join('、')}）` : '干净',
    });

    /* 6. 标点配额（按段） */
    const paras = splitParagraphs(raw);
    let dashOver = 0, ellOver = 0, bangOver = 0, semi = 0, paren = 0;
    const punctHits = [];
    paras.forEach((p) => {
      const d = (p.match(/——|—-|—/g) || []).length;
      const e = (p.match(/……/g) || []).length + Math.max(0, (p.match(/\.{3,}|…/g) || []).length);
      const b = (p.match(/[！!]/g) || []).length;
      if (d > 1) { dashOver++; punctHits.push(`破折号×${d}`); }
      if (e > 2) { ellOver++; punctHits.push(`省略号×${e}`); }
      if (b > 1) { bangOver++; punctHits.push(`叹号×${b}`); }
    });
    semi = (raw.match(/[；;]/g) || []).length;
    paren = (raw.match(/[（）()]/g) || []).length;
    if (semi) punctHits.push(`分号×${semi}`);
    if (paren) punctHits.push(`括号×${paren}`);
    checks.push({
      id: 'c6',
      name: '标点配额',
      pass: dashOver === 0 && ellOver === 0 && bangOver === 0 && semi === 0 && paren === 0,
      detail: punctHits.length ? punctHits.slice(0, 6).join('，') : '破折号≤1／省略号≤2／叹号≤1／分号0／括号0',
    });

    /* 7. 句长 */
    const sents = splitSentences(raw);
    const lens = sents.map((s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length).filter((n) => n > 0);
    const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    const longSent = lens.filter((n) => n > 25).length;
    let mono = 0;
    for (let k = 0; k + 2 < lens.length; k++) {
      if (Math.abs(lens[k] - lens[k + 1]) <= 2 && Math.abs(lens[k + 1] - lens[k + 2]) <= 2) mono++;
    }
    checks.push({
      id: 'c7',
      name: '句长与节奏',
      pass: avg <= 20 && longSent === 0 && mono < 3,
      detail: `平均 ${avg.toFixed(1)} 字／句（台词卡要求 ≤15）｜超长句 ${longSent} ｜同长度三连 ${mono}`,
    });

    /* 8. 结尾升华 */
    const tail = (paras[paras.length - 1] || '').slice(-60);
    const tailBad = /(从此|注定|宿命|命运|这就是|这大概|而这，?就是|新的开始|序章|故事才)/.test(tail);
    checks.push({
      id: 'c8',
      name: '结尾升华',
      pass: !tailBad,
      detail: tailBad ? '结尾在做总结／升华，删掉最后一句试试' : '结尾落在具体物象上',
    });

    /* 9. 篇幅与段落 */
    const chars = (raw.match(/[\u4e00-\u9fa5]/g) || []).length;
    const longPara = paras.filter((p) => (p.match(/[。！？…]/g) || []).length >= 8).length;
    checks.push({
      id: 'c9',
      name: '篇幅与段落',
      pass: chars >= 280 && chars <= 1200 && longPara === 0,
      detail: `${chars} 字（标尺 300–900）｜超长段 ${longPara}`,
    });

    /* 10. 对话占比与废话率粗检 */
    const quotes = raw.match(/「[^」]*」/g) || [];
    const dlgChars = quotes.reduce((a, q) => a + q.length, 0);
    const dlgRate = chars ? dlgChars / chars : 0;
    checks.push({
      id: 'c10',
      name: '台词密度',
      pass: dlgRate >= 0.12,
      detail: `对话占 ${(dlgRate * 100).toFixed(0)}%（0 台词＝纯旁白，注意）｜台词 ${quotes.length} 句`,
    });

    /* 命中排序 & 合并区间 */
    hits.sort((a, b) => a.index - b.index);
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    spans.forEach((sp) => {
      const last = merged[merged.length - 1];
      if (last && sp.start <= last.end) last.end = Math.max(last.end, sp.end);
      else merged.push({ ...sp });
    });

    const passCount = checks.filter((c) => c.pass).length;
    const score = Math.round((passCount / checks.length) * 100);

    return {
      score,
      checks,
      hits,
      spans: merged,
      stats: {
        chars,
        paras: paras.length,
        sents: lens.length,
        avgLen: avg,
        quotes: quotes.length,
        t1: t1.length,
        t2over: over2.length,
        patterns: patHits.length,
        cliches: cli.length,
        meta: metaHits.length,
      },
    };
  }

  /** 生成带高亮的 HTML（转义安全） */
  function highlight(text, spans) {
    const raw = String(text || '');
    const ESC = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let out = '';
    let cur = 0;
    spans.forEach((sp) => {
      if (sp.start > cur) out += ESC(raw.slice(cur, sp.start));
      out += `<mark class="t${sp.level}">${ESC(raw.slice(sp.start, sp.end))}</mark>`;
      cur = sp.end;
    });
    out += ESC(raw.slice(cur));
    return out;
  }

  /** 生成给 AI 的重写指令 */
  function rewritePrompt(res, text) {
    const lines = [];
    lines.push('按活人感写作规约重写下面这段。要求：');
    lines.push('1. 保留全部事实、人物、因果，不增删剧情。');
    lines.push('2. 删掉所有命中项：一级禁用词、二级超额词、禁用句式、模板台词、元叙述。');
    lines.push('3. 只写能拍到的：动作、台词、环境、物象；心理描写全部改写为外部可观察。');
    lines.push('4. 平均句长压到 15 字以内，句长要有长短差；破折号每段≤1、省略号≤2、叹号≤1、分号与括号为 0。');
    lines.push('5. 结尾不许总结、升华、预告。');
    lines.push('');
    lines.push('【命中清单】');
    res.hits.slice(0, 40).forEach((h, i) => {
      lines.push(`${i + 1}. [L${h.level}] ${h.kind}：${h.word}`);
    });
    lines.push('');
    lines.push('【原文】');
    lines.push(text.trim());
    return lines.join('\n');
  }

  global.SCAN = { scan, highlight, rewritePrompt, PATTERNS, META };
})(window);
