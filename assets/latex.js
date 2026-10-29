/* ============================================================
   latex.js — LaTeX 子集渲染 + 面板代码生成
   支持：\(..\) \textcolor \colorbox \fcolorbox \rule \overline
        \textbf \textit \text \footnotesize \large \qquad \\ 等
   ============================================================ */
(function (global) {
  'use strict';

  const ESC = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function readGroup(s, i) {
    // s[i] === '{'
    let depth = 0;
    const start = i + 1;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') {
        depth--;
        if (depth === 0) return { content: s.slice(start, j), next: j + 1 };
      }
    }
    return { content: s.slice(start), next: s.length };
  }

  function readArg(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') return readGroup(s, i);
    let j = i;
    while (j < s.length && !/[\s{}\\]/.test(s[j])) j++;
    return { content: s.slice(i, j), next: j };
  }

  const num = (v) => {
    // "5em" -> 5 ; "1ex" -> 1 ; "2.4em" -> 2.4
    const m = /^(-?[\d.]+)\s*(em|ex|pt|cm|mm|%)?$/.exec(String(v).trim());
    if (!m) return null;
    return { v: parseFloat(m[1]), u: m[2] || '' };
  };

  function parseLatex(src) {
    let i = 0;
    const s = String(src == null ? '' : src);

    function scope() {
      let out = '';
      while (i < s.length) {
        const ch = s[i];

        if (ch === '\\') {
          const rest = s.slice(i);
          if (rest.startsWith('\\\\')) { out += '<br>'; i += 2; continue; }
          if (rest.startsWith('\\(') || rest.startsWith('\\)') || rest.startsWith('\\[') || rest.startsWith('\\]')) { i += 2; continue; }

          const m = /^\\([a-zA-Z]+)/.exec(rest);
          if (!m) {
            const c = rest[1];
            if (',;:!'.includes(c)) { out += '<span style="display:inline-block;width:.22em"></span>'; i += 2; continue; }
            if (c === ' ') { out += ' '; i += 2; continue; }
            i += 2;
            continue;
          }
          const cmd = m[1];
          i += m[0].length;

          switch (cmd) {
            case 'textcolor': {
              const c = readArg(s, i); i = c.next;
              const g = readArg(s, i); i = g.next;
              out += `<span style="color:${ESC(c.content.trim())}">${parseInline(g.content)}</span>`;
              break;
            }
            case 'colorbox': {
              const c = readArg(s, i); i = c.next;
              const g = readArg(s, i); i = g.next;
              out += `<span style="background:${ESC(c.content.trim())};padding:1px 8px;border-radius:3px">${parseInline(g.content)}</span>`;
              break;
            }
            case 'fcolorbox': {
              const c1 = readArg(s, i); i = c1.next;
              const c2 = readArg(s, i); i = c2.next;
              const g = readArg(s, i); i = g.next;
              out += `<span style="display:block;border:2px solid ${ESC(c1.content.trim())};background:${ESC(c2.content.trim())};padding:10px 12px;border-radius:6px">${parseInline(g.content)}</span>`;
              break;
            }
            case 'rule': {
              const w = readArg(s, i); i = w.next;
              const h = readArg(s, i); i = h.next;
              out += `<span class="bar" style="width:${ESC(w.content.trim())};height:${ESC(h.content.trim())};background:currentColor"></span>`;
              break;
            }
            case 'overline':
            case 'underline': {
              const g = readArg(s, i); i = g.next;
              const side = cmd === 'overline' ? 'border-top' : 'border-bottom';
              out += `<span class="har" style="${side}:2px solid currentColor">${parseInline(g.content)}</span>`;
              break;
            }
            case 'textbf': {
              const g = readArg(s, i); i = g.next;
              out += `<b>${parseInline(g.content)}</b>`;
              break;
            }
            case 'textit':
            case 'emph': {
              const g = readArg(s, i); i = g.next;
              out += `<i>${parseInline(g.content)}</i>`;
              break;
            }
            case 'text':
            case 'textrm':
            case 'mbox':
            case 'mathrm':
            case 'operatorname': {
              const g = readArg(s, i); i = g.next;
              out += parseInline(g.content);
              break;
            }
            case 'qquad': out += '<span style="display:inline-block;width:2em"></span>'; break;
            case 'quad': out += '<span style="display:inline-block;width:1em"></span>'; break;
            case 'hspace':
            case 'hskip': {
              const g = readArg(s, i); i = g.next;
              out += `<span style="display:inline-block;width:${ESC(g.content.trim())}"></span>`;
              break;
            }
            case 'vspace':
            case 'vskip': {
              const g = readArg(s, i); i = g.next;
              out += `<span style="display:block;height:${ESC(g.content.trim())}"></span>`;
              break;
            }
            case 'footnotesize':
            case 'scriptsize':
            case 'small': {
              const k = cmd === 'scriptsize' ? 0.72 : cmd === 'small' ? 0.9 : 0.82;
              out += `<span style="font-size:${k}em">${scope()}</span>`;
              i = s.length;
              break;
            }
            case 'large': out += `<span style="font-size:1.14em">${scope()}</span>`; i = s.length; break;
            case 'Large': out += `<span style="font-size:1.3em">${scope()}</span>`; i = s.length; break;
            case 'huge': out += `<span style="font-size:1.5em">${scope()}</span>`; i = s.length; break;
            case 'newline':
            case 'par': out += '<br>'; break;
            case 'begin':
            case 'end': {
              const g = readArg(s, i); i = g.next;
              break;
            }
            case 'left':
            case 'right': {
              if (s[i]) i++;
              break;
            }
            case 'displaystyle':
            case 'textstyle':
            case 'nolimits':
            case 'limits': break;
            default: {
              // 未知命令：吞掉可能紧跟的参数，尽量保住文字
              if (s[i] === '{') {
                const g = readGroup(s, i); i = g.next;
                out += parseInline(g.content);
              }
              break;
            }
          }
          continue;
        }

        if (ch === '{') { const g = readGroup(s, i); i = g.next; out += parseInline(g.content); continue; }
        if (ch === '}') { i++; continue; }
        if (ch === '\n') { out += '<br>'; i++; continue; }
        if (ch === '\r') { i++; continue; }
        if (ch === '~') { out += '&nbsp;'; i++; continue; }
        out += ESC(ch);
        i++;
      }
      return out;
    }

    function parseInline(str) {
      const save = s;
      // 用子解析器处理嵌套字符串
      const sub = new SubParser(str);
      return sub.run();
    }

    return new SubParser(s).run();
  }

  function SubParser(str) {
    const s = String(str == null ? '' : str);
    let i = 0;

    function readGroupAt(pos) { return readGroup(s, pos); }
    function readArgAt(pos) { return readArg(s, pos); }

    function run() {
      let out = '';
      while (i < s.length) {
        const ch = s[i];

        if (ch === '\\') {
          const rest = s.slice(i);
          if (rest.startsWith('\\\\')) { out += '<br>'; i += 2; continue; }
          if (rest.startsWith('\\(') || rest.startsWith('\\)') || rest.startsWith('\\[') || rest.startsWith('\\]')) { i += 2; continue; }

          const m = /^\\([a-zA-Z]+)/.exec(rest);
          if (!m) {
            const c = rest[1];
            if (',;:!'.includes(c)) { out += '<span style="display:inline-block;width:.22em"></span>'; i += 2; continue; }
            i += 2;
            continue;
          }
          const cmd = m[1];
          i += m[0].length;

          switch (cmd) {
            case 'textcolor': {
              const c = readArgAt(i); i = c.next;
              const g = readArgAt(i); i = g.next;
              out += `<span style="color:${ESC(c.content.trim())}">${new SubParser(g.content).run()}</span>`;
              break;
            }
            case 'colorbox': {
              const c = readArgAt(i); i = c.next;
              const g = readArgAt(i); i = g.next;
              out += `<span style="background:${ESC(c.content.trim())};padding:1px 8px;border-radius:3px">${new SubParser(g.content).run()}</span>`;
              break;
            }
            case 'fcolorbox': {
              const c1 = readArgAt(i); i = c1.next;
              const c2 = readArgAt(i); i = c2.next;
              const g = readArgAt(i); i = g.next;
              out += `<span style="display:block;border:2px solid ${ESC(c1.content.trim())};background:${ESC(c2.content.trim())};padding:10px 12px;border-radius:6px">${new SubParser(g.content).run()}</span>`;
              break;
            }
            case 'rule': {
              const w = readArgAt(i); i = w.next;
              const h = readArgAt(i); i = h.next;
              out += `<span class="bar" style="width:${ESC(w.content.trim())};height:${ESC(h.content.trim())};background:currentColor"></span>`;
              break;
            }
            case 'overline':
            case 'underline': {
              const g = readArgAt(i); i = g.next;
              const side = cmd === 'overline' ? 'border-top' : 'border-bottom';
              out += `<span class="har" style="${side}:2px solid currentColor">${new SubParser(g.content).run()}</span>`;
              break;
            }
            case 'textbf': { const g = readArgAt(i); i = g.next; out += `<b>${new SubParser(g.content).run()}</b>`; break; }
            case 'textit':
            case 'emph': { const g = readArgAt(i); i = g.next; out += `<i>${new SubParser(g.content).run()}</i>`; break; }
            case 'text':
            case 'textrm':
            case 'mbox':
            case 'mathrm': { const g = readArgAt(i); i = g.next; out += new SubParser(g.content).run(); break; }
            case 'qquad': out += '<span style="display:inline-block;width:2em"></span>'; break;
            case 'quad': out += '<span style="display:inline-block;width:1em"></span>'; break;
            case 'hspace':
            case 'hskip': { const g = readArgAt(i); i = g.next; out += `<span style="display:inline-block;width:${ESC(g.content.trim())}"></span>`; break; }
            case 'vspace':
            case 'vskip': { const g = readArgAt(i); i = g.next; out += `<span style="display:block;height:${ESC(g.content.trim())}"></span>`; break; }
            case 'footnotesize':
            case 'scriptsize':
            case 'small': {
              const k = cmd === 'scriptsize' ? 0.72 : cmd === 'small' ? 0.9 : 0.82;
              out += `<span style="font-size:${k}em">${new SubParser(s.slice(i)).run()}</span>`;
              i = s.length;
              break;
            }
            case 'large': out += `<span style="font-size:1.14em">${new SubParser(s.slice(i)).run()}</span>`; i = s.length; break;
            case 'Large': out += `<span style="font-size:1.3em">${new SubParser(s.slice(i)).run()}</span>`; i = s.length; break;
            case 'huge': out += `<span style="font-size:1.5em">${new SubParser(s.slice(i)).run()}</span>`; i = s.length; break;
            case 'newline':
            case 'par': out += '<br>'; break;
            case 'begin':
            case 'end': { const g = readArgAt(i); i = g.next; break; }
            case 'left':
            case 'right': if (s[i]) i++; break;
            case 'displaystyle':
            case 'textstyle':
            case 'nolimits':
            case 'limits': break;
            default: {
              if (s[i] === '{') { const g = readGroupAt(i); i = g.next; out += new SubParser(g.content).run(); }
              break;
            }
          }
          continue;
        }

        if (ch === '{') { const g = readGroupAt(i); i = g.next; out += new SubParser(g.content).run(); continue; }
        if (ch === '}') { i++; continue; }
        if (ch === '\n' || ch === '\r') { i++; continue; }
        if (ch === '~') { out += '&nbsp;'; i++; continue; }
        out += ESC(ch);
        i++;
      }
      return out;
    }

    return { run };
  }

  function render(src) { return new SubParser(src).run(); }

  /* ---------- 生成 ---------- */

  const BAR_TOTAL = 5; // em

  function emStr(n) {
    const v = Math.max(0, Math.min(BAR_TOTAL, n));
    if (v === 0) return '0em';
    return (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '') + 'em';
  }

  /** 双条进度条（数据美化指令固定 5em） */
  function bar(cur, max, bodyColor, trackColor) {
    const c = Math.max(0, Number(cur) || 0);
    const m = Math.max(1, Number(max) || 1);
    const fill = Math.min(BAR_TOTAL, (c / m) * BAR_TOTAL);
    const rest = Math.max(0, BAR_TOTAL - fill);
    return `\\textcolor{${bodyColor}}{\\rule{${emStr(fill)}}{1ex}\\textcolor{${trackColor}}{\\rule{${emStr(rest)}}{1ex}}} `;
  }

  /** 一行属性：属性名 + 双条 + 当前/最大值 */
  function statLine(label, cur, max, pal, opts) {
    opts = opts || {};
    const color = opts.accent ? pal.accent : pal.body;
    return `\\textcolor{${pal.body}}{${opts.text ? tex(opts.text, opts.safe) : tex(label, opts.safe) + ' ' + bar(cur, max, color, opts.track || '#D5D8DC') + ' ' + cur + '/' + max}}`;
  }

  function tex(s, safe) {
    if (!safe) return String(s);
    return `\\text{${String(s)}}`;
  }

  /** 把顶层纯文本片段包进 \text{}，命令片段原样保留 */
  function splitTop(str) {
    const segs = [];
    let buf = '';
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (ch === '\\') {
        const m = /^\\([a-zA-Z]+)/.exec(str.slice(i));
        if (m) {
          if (buf) { segs.push({ t: 'txt', s: buf }); buf = ''; }
          let j = i + m[0].length;
          let cmd = m[0];
          let n = 0;
          while (str[j] === '{' && n < 3) { const g = readGroup(str, j); cmd += '{' + g.content + '}'; j = g.next; n++; }
          segs.push({ t: 'cmd', s: cmd });
          i = j;
          continue;
        }
        buf += ch + (str[i + 1] || '');
        i += 2;
        continue;
      }
      buf += ch;
      i++;
    }
    if (buf) segs.push({ t: 'txt', s: buf });
    return segs;
  }

  function safeWrap(str) {
    return splitTop(str)
      .map((sg) => {
        if (sg.t === 'cmd') return sg.s;
        if (!sg.s.trim()) return sg.s;
        return `\\text{${sg.s}}`;
      })
      .join('');
  }

  function title(text, pal, opts) {
    opts = opts || {};
    const inner = opts.safe ? `\\text{${text}}` : text;
    return `\\colorbox{${pal.titleBg}}{\\textcolor{${pal.titleFg}}{\\textbf{${inner}}}}`;
  }

  function divider(pal, opts) {
    opts = opts || {};
    const q = '\\qquad'.repeat(opts.wide === false ? 3 : 5);
    return `\\textcolor{${pal.rule}}{\\overline{${q}}}`;
  }

  function foot(text, pal, opts) {
    opts = opts || {};
    const inner = opts.safe ? `\\text{${text}}` : text;
    return `\\textcolor{${pal.foot}}{\\footnotesize ${inner}}`;
  }

  /**
   * 组装面板
   * rows: [{type:'title'|'line'|'div'|'foot'|'blank', ...}]
   * mode: 'chat'(逐行 \\ 换行) | 'box'(\fcolorbox+array)
   */
  function assemble(rows, pal, mode, opts) {
    opts = opts || {};
    const safe = !!opts.safe;
    const body = [];
    rows.forEach((r) => {
      if (r.type === 'title') body.push(title(r.text, pal, { safe }));
      else if (r.type === 'div') body.push(divider(pal, r));
      else if (r.type === 'foot') body.push(foot(r.text, pal, { safe }));
      else if (r.type === 'blank') body.push('');
      else if (r.type === 'line') {
        const color = r.accent ? pal.accent : pal.body;
        const inner = safe ? safeWrap(r.text) : r.text;
        body.push(`\\textcolor{${color}}{${inner}}`);
      } else if (r.type === 'raw') body.push(r.text);
    });

    if (mode === 'box') {
      const inner = body.map((l) => l + ' \\\\').join('\n');
      return `\\(\\fcolorbox{${pal.border}}{${pal.bg}}{\\begin{array}{l}\n${inner}\n\\end{array}}\\)`;
    }
    return `\\(\n${body.join(' \\\\\n')}\n\\)`;
  }

  global.LTX = {
    render, bar, statLine, title, divider, foot, assemble, tex, emStr,
    BAR_TOTAL,
  };
})(window);
