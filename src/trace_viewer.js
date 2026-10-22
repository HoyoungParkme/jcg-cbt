  /* ================= 실행 추적 뷰어 (흥달쌤식 손풀이 판) =================
     원리: 단계 0..k 를 차례로 '판'에 적는다. 변수는 "주소 이름 값" 한 줄, 값이 바뀌면 옛 값에 빗금을 긋고 옆에 새 값을 쓴다.
     함수를 부르면 그 함수의 변수 묶음이 새로 생기고 돌아오면 지워진다. 재귀는 아래→위로 쌓이는 표, 반환값은 호출한 줄 옆에 적는다. */
  const TI = window.CBT_TRACE_INDEX || {};
  const TR = (window.CBT_TRACE = window.CBT_TRACE || {});
  function loadTrace(id) {
    if (TR[id]) return Promise.resolve(TR[id]);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script"); s.src = "data/trace/" + id + ".js";
      s.onload = () => TR[id] ? resolve(TR[id]) : reject(new Error("empty")); s.onerror = () => reject(new Error("load"));
      document.head.appendChild(s);
    });
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // 압축된 단계(바뀐 것만 기록)를 전체 상태로 복원
  function expandTrace(c) {
    const out = []; let f = [], h = {}, g = [], s = [], o = "";
    c.steps.forEach((st) => {
      if (st.f) f = clone(st.f);
      else if (st.dv) st.dv.forEach(([i, v]) => {
        const fr = f[i]; if (!fr) return;
        if (v.del) fr.v = fr.v.filter((x) => x.k !== v.k);
        else if (v.line !== undefined) fr.l = v.line;
        else { const idx = fr.v.findIndex((x) => x.k === v.k); if (idx >= 0) fr.v[idx] = v; else fr.v.push(v); }
      });
      if (st.h !== undefined) h = clone(st.h);
      if (st.g !== undefined) g = clone(st.g);
      if (st.s !== undefined) s = clone(st.s);
      if (st.o !== undefined) o = st.o;
      out.push({ l: st.l, e: st.e, f: clone(f), h, g, s, o, r: st.r });
    });
    return out;
  }

  /* ---- 값 → 판에 그릴 '모양' ----
     {k:"s", v:"10"} 하나의 값 | {k:"arr", items:[…]} 배열 | {k:"st", f:{필드: 모양}} 구조체·객체 | {k:"u"} 아직 값 없음 */
  const CHAR_RE = /^'(.*)' \((-?\d+)\)$/, JCHAR_RE = /^'(.*)'\((\d+)\)$/;
  function toShape(x) {
    if (x === "?" || x === undefined) return { k: "u" };
    if (x === null) return { k: "s", v: "null" };
    if (typeof x !== "object") {
      const v = String(x); let m;
      if (typeof x === "string") {
        if ((m = CHAR_RE.exec(x) || JCHAR_RE.exec(x))) return { k: "s", v: m[1] === "\\x00" ? "\\0" : "'" + m[1] + "'", ch: true, title: "문자 코드 " + m[2] };
        if ((m = /^(?:→|@)(\d+)$/.exec(x))) return { k: "s", v: m[1], ref: true };
      }
      return { k: "s", v };
    }
    if (x.p !== undefined) {           // C 포인터: 값은 가리키는 곳의 주소 번호
      const sh = { k: "s", v: x.p === "NULL" ? "NULL" : String(x.p), ptr: true };
      if (x.s !== undefined) sh.str = x.s;
      if (x.d !== undefined) sh.d = x.d;
      return sh;
    }
    if (x.arr) {
      const items = x.arr.map(toShape);
      if (items.length && items.every((it) => it.k === "s" && (it.ch || it.v === "…"))) {   // char 배열: 첫 \0 까지만 보여 준다
        const cut = items.findIndex((it) => it.v === "\\0");
        const shown = (cut >= 0 ? items.slice(0, cut + 1) : items).map((it) => ({ ...it, v: it.v.replace(/^'(.*)'$/, "$1") }));
        return { k: "arr", items: shown, str: x.s === undefined ? shown.filter((it) => it.v !== "\\0").map((it) => it.v).join("") : x.s, chars: true, esc: shown.some((it) => /^\\x/.test(it.v)) };
      }
      return { k: "arr", items };
    }
    if (x.st) { const f = {}; Object.keys(x.st).forEach((n) => { f[n] = toShape(x.st[n]); }); return { k: "st", f }; }
    if (Array.isArray(x)) return { k: "arr", items: x.map(toShape) };
    const f = {}; Object.keys(x).forEach((n) => { f[n] = toShape(x[n]); }); return { k: "st", f };
  }
  const heapShape = (o) => Array.isArray(o.v) ? { k: "arr", items: o.v.map(toShape) } : (o.v && typeof o.v === "object") ? toShape(o.v) : { k: "s", v: String(o.v) };
  // 모양을 글자로 (설명문·제목용)
  function plain(sh) {
    if (!sh || sh.k === "u") return "?";
    if (sh.k === "s") return sh.v;
    if (sh.k === "arr") return sh.chars ? '"' + sh.str + '"' : "[" + sh.items.map(plain).join(", ") + "]";
    return "{" + Object.keys(sh.f).map((n) => n + ": " + plain(sh.f[n])).join(", ") + "}";
  }
  const curShape = (cell) => !cell ? null : cell.k === "s" ? cell.hist[cell.hist.length - 1] : cell.k === "arr" ? { k: "arr", items: cell.items.map(curShape), chars: cell.chars, str: cell.str } : cell.k === "st" ? { k: "st", f: Object.fromEntries(Object.keys(cell.f).map((n) => [n, curShape(cell.f[n])])) } : { k: "u" };

  /* ---- 판 위의 '칸': 값이 바뀌면 옛 값을 지우지 않고 빗금 + 새 값 ---- */
  function newCell(sh, step) {
    if (sh.k === "s") return { k: "s", hist: [sh], at: [step] };
    if (sh.k === "arr") return { k: "arr", items: sh.items.map((it) => newCell(it, step)), str: sh.str, chars: sh.chars, esc: sh.esc, at: step };
    if (sh.k === "st") { const f = {}; Object.keys(sh.f).forEach((n) => { f[n] = newCell(sh.f[n], step); }); return { k: "st", f, at: step }; }
    return { k: "u", at: step };
  }
  function updCell(cell, sh, step) {
    if (!cell || cell.k === "u" || cell.k !== sh.k) return newCell(sh, step);   // 첫 값(? → 값)은 그냥 쓴다
    if (cell.k === "s") { const last = cell.hist[cell.hist.length - 1]; if (last.v !== sh.v) { cell.hist.push(sh); cell.at.push(step); } else Object.assign(last, sh); return cell; }
    if (cell.k === "arr") {
      if (!cell.chars && !sh.chars && cell.items.length !== sh.items.length) {   // 구조가 바뀜: 옛 줄을 통째로 빗금
        const fresh = newCell(sh, step); fresh.old = (cell.old || []).concat([plain(curShape(cell))]).slice(-4); fresh.oldAt = step; return fresh;
      }
      if (cell.chars && sh.chars) {   // 문자열은 통째로 한 칸처럼: 바뀌면 옛 문자열에 빗금
        cell.items = sh.items.map((it, i) => updCell(cell.items[i], it, step));
        if (cell.str !== sh.str) { (cell.strHist = cell.strHist || [cell.str]).push(sh.str); cell.strAt = step; }
      } else cell.items = sh.items.map((it, i) => updCell(cell.items[i], it, step));
      cell.str = sh.str; cell.chars = sh.chars; cell.esc = sh.esc; return cell;
    }
    Object.keys(sh.f).forEach((n) => { cell.f[n] = updCell(cell.f[n], sh.f[n], step); }); return cell;
  }

  /* ---- 소스 분석: 함수 정의 위치·매개변수 이름·static 지역변수 ---- */
  function codeInfo(code, lang) {
    const lines = code.replace(/\n+$/, "").split("\n");
    const bodies = {}, params = {};
    const findDef = (name) => {
      const re = lang === "python" ? new RegExp("^\\s*def\\s+" + name + "\\s*\\(([^)]*)\\)") : new RegExp("^\\s*(?:[\\w<>\\[\\],*]+\\s+)*\\*?" + name + "\\s*\\(([^)]*)\\)\\s*(\\{|$)");
      for (let i = 0; i < lines.length; i++) { const m = re.exec(lines[i]); if (m && !/^\s*(return|else)\b/.test(lines[i])) return { i, args: m[1] }; }
      return null;
    };
    const body = (name) => {
      if (bodies[name] !== undefined) return bodies[name];
      const d = findDef(name); if (!d) return (bodies[name] = null);
      let end = d.i;
      if (lang === "python") {
        const ind = lines[d.i].search(/\S/);
        for (let i = d.i + 1; i < lines.length; i++) { if (lines[i].trim() && lines[i].search(/\S/) <= ind) break; end = i; }
      } else {
        let depth = 0, started = false;
        for (let i = d.i; i < lines.length; i++) {
          for (const ch of lines[i]) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
          end = i; if (started && depth <= 0) break;
        }
      }
      return (bodies[name] = { start: d.i + 1, end: end + 1 });
    };
    const paramNames = (name) => {
      if (params[name]) return params[name];
      const d = findDef(name); if (!d) return (params[name] = []);
      return (params[name] = d.args.split(",").map((p) => { const m = /([A-Za-z_]\w*)\s*(\[[^\]]*\])*\s*(=.*)?$/.exec(p.trim()); return m ? m[1] : null; }).filter((p) => p && p !== "void" && p !== "self"));
    };
    const statics = new Set();   // C: 함수 안 static 변수 → "함수.이름"
    if (lang === "c") {
      let fn = null;
      lines.forEach((ln) => {
        const d = /^\s*(?:[\w]+\s+)+\*?([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$/.exec(ln); if (d && !/^\s*(if|for|while|switch|return)\b/.test(ln)) fn = d[1];
        const s = /^\s*static\s+(?:[\w]+\s+)+\*?([A-Za-z_]\w*)/.exec(ln); if (s && fn) statics.add(fn + "." + s[1]);
      });
    }
    const amp = new Set(); (code.match(/&\s*([A-Za-z_]\w*)/g) || []).forEach((m) => amp.add(m.replace(/&\s*/, "")));
    return { lines, body, paramNames, statics, amp };
  }

  /* ---- 식 계산기: 숫자·사칙연산·비교·논리만 허용 (변수가 남아 있으면 null) ----
     반환식 "2 * 1" → 2, 조건식 "3 < 4" → 1 처럼 흥달쌤이 코드 위에 덧쓰는 값을 만든다 */
  function evalExpr(expr, lang) {
    const re = /\d+\.\d+|\d+|\/\/|<=|>=|==|!=|&&|\|\||[-+*\/%()<>!]|\b(?:and|or|not|true|false|True|False)\b/g;
    const toks = expr.match(re) || [];
    if (!toks.length || toks.join("") !== expr.replace(/\s+/g, "")) return null;
    let i = 0; const peek = () => toks[i], next = () => toks[i++], isInt = Number.isInteger;
    const prim = () => {
      const t = next();
      if (t === "(") { const v = orE(); if (next() !== ")") throw 0; return v; }
      if (t === "-") return -prim(); if (t === "+") return prim();
      if (t === "!" || t === "not") return prim() ? 0 : 1;
      if (t === "true" || t === "True") return 1; if (t === "false" || t === "False") return 0;
      if (t === undefined || isNaN(Number(t))) throw 0; return Number(t);
    };
    const mul = () => { let a = prim(); while (["*", "/", "%", "//"].includes(peek())) { const op = next(), b = prim();
      if (op === "*") a = a * b; else if (op === "//") a = Math.floor(a / b); else if (op === "/") a = (lang !== "python" && isInt(a) && isInt(b)) ? Math.trunc(a / b) : a / b; else a = lang === "python" ? ((a % b) + b) % b : a % b; } return a; };
    const add = () => { let a = mul(); while (peek() === "+" || peek() === "-") { const op = next(), b = mul(); a = op === "+" ? a + b : a - b; } return a; };
    const cmp = () => { let a = add(); while (["<", "<=", ">", ">=", "==", "!="].includes(peek())) { const op = next(), b = add(); a = ({ "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b, "==": a == b, "!=": a != b })[op] ? 1 : 0; } return a; };
    const andE = () => { let a = cmp(); while (peek() === "&&" || peek() === "and") { next(); const b = cmp(); a = a && b ? 1 : 0; } return a; };
    const orE = () => { let a = andE(); while (peek() === "||" || peek() === "or") { next(); const b = andE(); a = a || b ? 1 : 0; } return a; };
    try { const v = orE(); return i === toks.length && Number.isFinite(v) ? v : null; } catch (e) { return null; }
  }
  const evalArith = evalExpr;
  const numStr = (v) => (v < 0 ? "(" + v + ")" : String(v));
  // 식 안의 변수 이름을 지금 값으로 바꾼다 (함수 이름·필드 이름은 건드리지 않음)
  const curVal = (cell) => cell && cell.k === "s" ? cell.hist[cell.hist.length - 1].v : null;
  function substVars(expr, vars, field, arrAsAddr) {
    const wrap = (v) => (/^-\d/.test(v) ? "(" + v + ")" : v);
    if (field) expr = expr.replace(/\b(?:this|self)\.([A-Za-z_]\w*)/g, (m, f) => { const v = field(f); return v === null ? m : wrap(v); });
    return expr.replace(/(^|[^.\w])([A-Za-z_]\w*)(?!\s*\()(?![\w])/g, (m, pre, id) => {
      const rec = vars.get(id); let v = rec && rec.cell && rec.cell.k === "s" ? curVal(rec.cell) : null;
      if (v === null && arrAsAddr && rec && rec.cell && rec.cell.k === "arr" && rec.a && !/^\s*\[/.test(expr.slice(expr.indexOf(m) + m.length))) v = String(rec.a);
      if (v === null && !rec && field) v = field(id);        // Java 메서드 안의 맨 필드 이름 (this. 생략)
      return v === null ? m : pre + wrap(v);
    });
  }
  // "f(a - 1)" 꼴의 호출들을 찾아 인자를 계산해 주고, 돌아온 값이 있으면 호출 자체를 그 값으로 바꾼다
  function foldCalls(expr, name, rets, lang) {
    let out = "", i = 0, n = 0;
    while (i < expr.length) {
      const m = new RegExp("\\b" + name + "\\s*\\(").exec(expr.slice(i));
      if (!m) { out += expr.slice(i); break; }
      const start = i + m.index, open = start + m[0].length; let depth = 1, j = open;
      while (j < expr.length && depth) { if (expr[j] === "(") depth++; else if (expr[j] === ")") depth--; j++; }
      out += expr.slice(i, start);
      if (n < rets.length) out += (/^-\d/.test(rets[n]) ? "(" + rets[n] + ")" : rets[n]);
      else { const args = expr.slice(open, j - 1).split(/,(?![^(]*\))/).map((a) => { const v = evalArith(a.trim(), lang); return v === null ? a.trim() : String(v); }); out += name + "(" + args.join(", ") + ")"; }
      n++; i = j;
    }
    return out;
  }

  /* ---- 판 만들기: 단계 0..k 를 차례로 적는다 ---- */
  function newInstance(fr, depth, step, T) {
    const n = fr.n; let short = n, title = n, kind = "fn", cls = "";
    if (T.lang === "java") { const parts = n.split("."); cls = parts[0]; short = parts[1] || n; if (short === "<init>") { title = "new " + cls; kind = "ctor"; } else if (short === "main") { title = "main"; kind = "main"; } else title = short; }
    else if (T.lang === "python") { if (n === "main(모듈)") { short = "모듈"; title = "모듈 (main)"; kind = "main"; } else if (n.startsWith("<")) { kind = "gen"; title = n === "<genexpr>" ? "(제너레이터 식)" : n === "<listcomp>" ? "(리스트 컴프리헨션)" : n === "<lambda>" ? "(람다)" : n; } else if (!T.info.body(n)) { title = "class " + n + " 정의"; kind = "class"; } }
    if (T.lang === "c" && n === "main") { kind = "main"; title = "main"; }
    const params = kind === "fn" ? T.info.paramNames(T.lang === "java" ? short : n) : kind === "ctor" ? T.info.paramNames(cls) : [];
    const self = fr.v.find((v) => v.k === "self" || v.k === "this");
    if (T.lang === "python" && self && kind === "fn") title = self.t + (n === "__init__" ? " 생성자" : "." + n);
    const args = params.map((p) => { const v = fr.v.find((x) => x.k === p); const t = v ? plain(toShape(v.x)) : "?"; return t.length > 22 ? t.slice(0, 20) + "…" : t; });
    if (kind === "fn" || kind === "ctor") title += "(" + args.join(", ") + ")";
    return { id: step + ":" + depth, n, short, title, kind, depth, start: step, line: fr.l, vars: new Map(), params, args, childRets: [] };
  }
  function buildBoard(T, k) {
    const B = { statics: new Map(), frames: [], gone: [], objects: new Map(), lineRets: new Map(), done: new Set(), skipped: new Set(), retNow: null, out: T.steps[k].o };
    const live = B.frames; let lastTopId = null;
    const L = T.info.lines, isCode = (ln) => { const t = (ln || "").trim(); return !!t && !/^[{}();]*$/.test(t) && !/^(\/\/|#|\*|\/\*)/.test(t) && !/^(\}\s*)?else\s*(\{|:)?\s*$/.test(t); };
    const indent = (l) => (L[l - 1] || "").search(/\S/);
    for (let j = 0; j <= k; j++) {
      const s = T.steps[j], prev = T.steps[j - 1];
      if (prev && prev.l && prev.e !== "end" && prev.l !== s.l) B.done.add(prev.l);
      // 1) 프레임 맞추기: 같은 이름이 이어지는 데까지는 같은 묶음, 그 위는 지우고 새로 만든다
      let same = 0; while (same < live.length && same < s.f.length && live[same].n === s.f[same].n && !(live[same].ret && live[same].retStep < j)) same++;
      if (s.e === "call" && same === s.f.length && same > 0) same--;      // Python: 앞 호출이 끝나자마자 같은 함수를 또 부름 → 새 묶음
      const removed = live.splice(same);
      B.gone = j === k ? removed : [];
      for (let d = same; d < s.f.length; d++) live.push(newInstance(s.f[d], d, j, T));
      // 건너뛴 문장: 같은 묶음 안에서 코드 줄을 뛰어넘었으면(거짓 if, 안 맞는 case, break·continue) 그 줄들에 X. 다시 실행되면 X 를 지운다
      const topId = live.length ? live[live.length - 1].id : null;
      if (prev && prev.e !== "end" && topId && topId === lastTopId && prev.l && s.l) {
        const src = L[prev.l - 1] || "";
        if (s.l > prev.l + 1) {
          const gap = []; for (let l = prev.l + 1; l < s.l; l++) gap.push(l);
          const branchy = /^\s*(\}\s*)?(else\s+)?(if|elif|switch|case|default)\b/.test(src) || /\b(break|continue)\b/.test(src) || gap.some((l) => /^\s*(\}\s*)?(else|elif|case|default)\b/.test(L[l - 1] || ""));
          if (branchy) gap.forEach((l) => { if (isCode(L[l - 1])) B.skipped.add(l); });
        } else if (s.l < prev.l && /\bcontinue\b/.test(src)) {   // continue 로 되돌아감: 반복 몸체의 남은 줄은 건너뜀
          const ind = indent(prev.l);
          for (let l = prev.l + 1; l < L.length; l++) { const t = (L[l - 1] || "").trim(); if (t && indent(l) < ind) break; if (isCode(L[l - 1])) B.skipped.add(l); }
        }
      }
      lastTopId = topId; B.skipped.delete(s.l);
      // 2) 반환값: C/Java 는 돌아온 직후(스택이 줄어든 단계), Python 은 return 이벤트(아직 그 함수 안)
      if (s.r) {
        const inst = s.e === "return" ? live[live.length - 1] : removed[0];
        if (inst) {
          inst.ret = toShape(s.r.x); inst.retStep = j;
          const parent = live[inst.depth - 1];
          if (parent && parent.n === inst.n) parent.childRets.push(plain(inst.ret));
          const callLine = s.e === "return" ? (s.f[inst.depth - 1] || {}).l : s.l;
          if (callLine) { const prevR = B.lineRets.get(callLine); B.lineRets.set(callLine, { text: inst.short + "(" + inst.args.join(", ") + ") = " + plain(inst.ret), n: (prevR ? prevR.n : 0) + 1, step: j }); }
          if (j === k) B.retNow = { inst, val: plain(inst.ret) };
        }
      }
      // 3) 변수 적기
      live.forEach((inst, d) => {
        const fr = s.f[d]; inst.line = fr.l;
        fr.v.forEach((v) => {
          if (T.lang === "java" && v.k === "args") return;
          if (T.lang === "python" && v.k.startsWith(".")) return;      // 제너레이터 내부 변수
          const sh = toShape(v.x);
          if (T.lang === "c" && T.info.statics.has(fr.n + "." + v.k)) {   // static 지역변수: 함수가 끝나도 남는다
            const key = fr.n + "." + v.k, old = B.statics.get(key);
            B.statics.set(key, { label: v.k, note: fr.n + "() static", a: v.a, cell: updCell(old && old.cell, sh, j) }); return;
          }
          const rec = inst.vars.get(v.k) || { k: v.k, t: v.t, a: v.a };
          if (v.a) rec.a = v.a; rec.cell = updCell(rec.cell, sh, j); inst.vars.set(v.k, rec);
        });
      });
      // 4) 전역·static 필드
      (s.g || []).forEach((v) => { const old = B.statics.get(v.k); B.statics.set(v.k, { label: v.k, note: "전역", a: v.a, cell: updCell(old && old.cell, toShape(v.x), j) }); });
      (s.s || []).forEach((v) => { const old = B.statics.get(v.k); B.statics.set(v.k, { label: v.k, note: "static", cell: updCell(old && old.cell, toShape(v.x), j) }); });
      // 5) 객체(Java·Python 힙) / C 힙(포인터가 가리키는, 변수가 아닌 곳)
      Object.keys(s.h || {}).forEach((id) => {
        const key = id.replace(/^[@→]/, ""), o = s.h[id], old = B.objects.get(key);
        B.objects.set(key, { t: o.t, cell: updCell(old && old.cell, heapShape(o), j), n: o.n });
      });
      if (T.lang === "c") {
        const visit = (sh) => {
          if (!sh) return;
          if (sh.k === "s" && sh.ptr && sh.v !== "NULL" && sh.d !== undefined && !T.regionOf(sh.v)) {
            const old = B.objects.get(sh.v); const dsh = toShape(sh.d);
            if (dsh.k === "s" && dsh.v === "…") return;                       // 너무 깊어 못 본 곳은 있는 그대로 둔다
            B.objects.set(sh.v, { t: "", cell: updCell(old && old.cell, dsh, j) }); visit(dsh);
          }
          else if (sh.k === "arr") sh.items.forEach(visit);
          else if (sh.k === "st") Object.values(sh.f).forEach(visit);
        };
        live.forEach((inst) => inst.vars.forEach((rec) => visit(curShape(rec.cell))));
        B.statics.forEach((rec) => visit(curShape(rec.cell)));
      }
    }
    // 지금 단계에서 살아 있는 객체만 보여 준다
    const cur = T.steps[k];
    if (T.lang === "c") {
      const reach = new Set(); const walk = (sh) => { if (!sh) return; if (sh.k === "s" && sh.ptr && !T.regionOf(sh.v) && sh.v !== "NULL") { if (reach.has(sh.v)) return; reach.add(sh.v); const o = B.objects.get(sh.v); if (o) walk(curShape(o.cell)); } else if (sh.k === "arr") sh.items.forEach(walk); else if (sh.k === "st") Object.values(sh.f).forEach(walk); };
      live.forEach((inst) => inst.vars.forEach((rec) => walk(curShape(rec.cell)))); B.statics.forEach((rec) => walk(curShape(rec.cell)));
      B.liveObjects = [...B.objects.keys()].filter((id) => reach.has(id));
    } else {
      const argsId = T.lang === "java" && cur.f[0] ? (cur.f[0].v.find((v) => v.k === "args") || {}).x : null;
      B.liveObjects = Object.keys(cur.h || {}).map((id) => id.replace(/^[@→]/, "")).filter((id) => "@" + id !== argsId && !/iterator|generator|_method|function|^type$/.test((B.objects.get(id) || {}).t || ""));
    }
    return B;
  }

  /* ---- 주소 정보 (C): 어떤 변수에 주소를 적어야 하는지 ---- */
  function addrInfo(steps, info) {
    const regions = new Map();   // 주소 번호 → {name, len, cols}
    const ptrTargets = new Set(), dupNames = new Set();
    const span = (sh) => sh.k === "arr" ? sh.items.reduce((a, it) => a + span(it), 0) || 1 : 1;
    steps.forEach((s) => {
      const names = new Map();
      s.f.forEach((fr) => fr.v.forEach((v) => {
        names.set(v.k, (names.get(v.k) || 0) + 1);
        if (!v.a) return; const sh = toShape(v.x); const r = regions.get(v.a) || { name: v.k, len: 1 };
        if (sh.k === "arr") { r.len = span(sh); if (sh.items[0] && sh.items[0].k === "arr") r.cols = span(sh.items[0]); }
        regions.set(v.a, r);
      }));
      (s.g || []).forEach((v) => { names.set(v.k, (names.get(v.k) || 0) + 1); if (v.a) { const sh = toShape(v.x); regions.set(v.a, { name: v.k, len: sh.k === "arr" ? span(sh) : 1, cols: sh.k === "arr" && sh.items[0] && sh.items[0].k === "arr" ? span(sh.items[0]) : undefined }); } });
      names.forEach((c, n) => { if (c > 1) dupNames.add(n); });
    });
    const find = (p) => { const n = Number(p); if (!Number.isFinite(n)) return null; for (const [base, r] of regions) { const b = Number(base); if (n >= b && n < b + r.len) return { base: b, r, off: n - b }; } return null; };
    const collect = (x) => { if (!x || typeof x !== "object") return; if (x.p !== undefined && x.p !== "NULL") { const f = find(x.p); if (f) ptrTargets.add(String(f.base)); } if (x.arr) x.arr.forEach(collect); if (x.st) Object.values(x.st).forEach(collect); if (x.d) collect(x.d); };
    steps.forEach((s) => { s.f.forEach((fr) => fr.v.forEach((v) => collect(v.x))); (s.g || []).forEach((v) => collect(v.x)); });
    const hasPtr = steps.some((s) => s.f.some((fr) => fr.v.some((v) => /\*/.test(v.t || ""))) || (s.g || []).some((v) => /\*/.test(v.t || "")));
    const hasArr = [...regions.values()].some((r) => r.len > 1);
    const usesAddr = hasPtr || hasArr || dupNames.size > 0 || info.amp.size > 0;
    return {
      usesAddr,
      regionOf: (p) => find(p),
      // 포인터 값 → "num[2]" 같은 이름
      hint: (p) => { const f = find(p); if (!f) return ""; const { r, off } = f; if (r.cols) return r.name + "[" + Math.floor(off / r.cols) + "][" + off % r.cols + "]"; if (r.len > 1) return r.name + "[" + off + "]"; return r.name; },
      show: (rec, isArr) => usesAddr,
    };
  }

  /* ---- 그리기 ---- */
  const KEEP = 10;   // 빗금 친 옛 값은 최근 10개까지만
  function scalarHtml(cell, k, T) {
    const n = cell.hist.length;
    return `<span class="c">` + (n > KEEP + 1 ? `<s title="옛 값 ${n - KEEP - 1}개 생략">…</s>` : "") + cell.hist.map((h, i) => {
      if (i < n - KEEP - 1) return "";
      if (i < n - 1) return `<s>${esc(h.v)}</s>`;
      const now = cell.at[i] === k; let extra = "";
      if (h.ptr && h.v !== "NULL" && T.lang === "c") { const hn = T.addr.hint(h.v); if (hn) extra += `<span class="hint">→ ${esc(hn)}</span>`; }
      if (h.str !== undefined && h.ptr) extra += `<i class="str">"${esc(h.str)}"</i>`;
      return `<em class="cur${now ? " now" : ""}"${h.title ? ` title="${esc(h.title)}"` : ""}>${esc(h.v)}</em>${extra}`;
    }).join("") + `</span>`;
  }
  function stackHtml(cell, k, T) {   // 배열 칸: 옛 값은 위에 작게(빗금), 지금 값은 아래
    if (!cell || cell.k === "u") return `<em class="unset">?</em>`;
    if (cell.k !== "s") return cellHtml(cell, k, T, {});
    const n = cell.hist.length;
    return `<div class="stk">${n > KEEP + 1 ? `<s>…</s>` : ""}${cell.hist.map((h, i) => i < n - KEEP - 1 ? "" : i < n - 1 ? `<s>${esc(h.v)}</s>` : `<em class="cur${cell.at[i] === k ? " now" : ""}"${h.title ? ` title="${esc(h.title)}"` : ""}>${esc(h.v)}</em>`).join("")}</div>`;
  }
  function strHtml(cell, k) {   // char 배열을 문자열 하나로: 옛 문자열은 빗금
    const hist = cell.strHist || [cell.str];
    return `<span class="c">${hist.map((h, i) => i < hist.length - 1 ? `<s>"${esc(h)}"</s>` : `<em class="cur${cell.strAt === k ? " now" : ""}">"${esc(h)}"</em>`).join("")}</span>`;
  }
  function arrHtml(cell, k, T, name, base, showAddr, noIdx) {
    const items = cell.items, b = Number(base);
    if (cell.chars && cell.esc) return `<span class="vn">${esc(name)}</span> ${strHtml(cell, k)}`;
    const oldRows = (cell.old || []).map((o) => `<div class="oldrow"><s>${esc(o)}</s></div>`).join("");
    if (oldRows) return `<div class="rewrite">${oldRows}${arrHtmlBody(cell, k, T, name, base, showAddr, noIdx)}</div>`;
    return arrHtmlBody(cell, k, T, name, base, showAddr, noIdx);
  }
  function arrHtmlBody(cell, k, T, name, base, showAddr, noIdx) {
    const items = cell.items, b = Number(base);
    if (!items.length) return `<span class="hint">(빈 ${esc(name || "")})</span>`;
    if (items.every((it) => it.k === "arr")) {   // 2차원: 행마다 한 줄, 행 주소는 원소 수만큼 뛴다
      const cols = items[0].items.length;
      return `<table class="at">${items.map((row, r) => `<tr class="row"><th>${esc(name)}[${r}]${showAddr && base ? `<i>${b + r * cols}</i>` : ""}</th>${row.items.map((it) => `<td>${stackHtml(it, k, T)}</td>`).join("")}</tr>`).join("")}</table>`;
    }
    if (items.every((it) => it.k === "st")) {     // 구조체 배열: 필드가 열, 인덱스가 행
      const fields = Object.keys(items[0].f);
      return `<table class="at"><tr class="hd"><th>${esc(name)}${showAddr && base ? `<i>${base}</i>` : ""}</th>${fields.map((f) => `<td>${esc(f)}</td>`).join("")}</tr>${items.map((it, i) => `<tr class="row"><th>[${i}]${showAddr && base ? `<i>${b + i}</i>` : ""}</th>${fields.map((f) => `<td>${it.f[f] && it.f[f].k === "arr" && it.f[f].chars ? strHtml(it.f[f], k) : stackHtml(it.f[f], k, T)}</td>`).join("")}</tr>`).join("")}</table>`;
    }
    return `<table class="at">${noIdx ? "" : `<tr class="hd"><th></th>${items.map((_, i) => `<td>${i}</td>`).join("")}</tr>`}${showAddr && base ? `<tr class="ad"><td></td>${items.map((_, i) => `<td>${b + i}</td>`).join("")}</tr>` : ""}<tr class="row"><th>${esc(name)}${cell.chars ? `<i>"${esc(cell.str)}"</i>` : ""}</th>${items.map((it) => `<td>${stackHtml(it, k, T)}</td>`).join("")}</tr></table>`;
  }
  function cellHtml(cell, k, T, o) {
    if (!cell || cell.k === "u") return `<em class="unset" title="아직 값이 정해지지 않음 (C는 쓰레기값)">?</em>`;
    if (cell.k === "s") return scalarHtml(cell, k, T);
    if (cell.k === "arr") return arrHtml(cell, k, T, o.name || "", o.base, o.showAddr);
    return `<div class="stv">${Object.keys(cell.f).map((f) => `<div class="fr"><span class="fn">${esc(f)}</span>${cell.f[f] && cell.f[f].k === "arr" && cell.f[f].chars ? strHtml(cell.f[f], k) : cellHtml(cell.f[f], k, T, { name: f })}</div>`).join("")}</div>`;
  }
  function ownerOf(id, B, skipInst) {   // 객체 번호 → 그 객체를 들고 있는 변수 이름 (this/self 제외)
    let name = null;
    B.frames.forEach((inst) => { if (name || inst === skipInst) return; inst.vars.forEach((rec, kk) => { if (!name && kk !== "this" && kk !== "self" && rec.cell && rec.cell.k === "s" && curVal(rec.cell) === id && rec.cell.hist[rec.cell.hist.length - 1].ref) name = kk; }); });
    if (!name) B.statics.forEach((rec) => { if (!name && rec.cell && rec.cell.k === "s" && curVal(rec.cell) === id) name = rec.label; });
    return name;
  }
  function objInline(o, k, T, B, depth) {   // 번호 없이 객체 내용을 변수 줄에 바로: n Lee · a 45
    const cell = o.cell;
    if (cell.k === "arr") return arrHtml(cell, k, T, "", null, false, /set/.test(o.t || ""));
    if (cell.k === "st") return `<span class="stv inl">${Object.keys(cell.f).length ? Object.keys(cell.f).map((f) => `<span class="fr"><span class="fn">${esc(f)}</span>${refOrCell(cell.f[f], k, T, B, depth + 1, f)}</span>`).join("") : `<span class="hint">(${esc(o.t || "객체")} · 필드 없음)</span>`}</span>`;
    return cellHtml(cell, k, T, {});
  }
  function refOrCell(cell, k, T, B, depth, name) {
    const sh = cell && cell.k === "s" ? cell.hist[cell.hist.length - 1] : null;
    if (sh && sh.ref && !T.shared && depth < 3) { const o = B.objects.get(sh.v); if (o) return objInline(o, k, T, B, depth); }
    return cellHtml(cell, k, T, { name });
  }
  function varRow(rec, k, T, addrAll, B) {
    const cell = rec.cell, isArr = cell && cell.k === "arr";
    const sh = cell && cell.k === "s" ? cell.hist[cell.hist.length - 1] : null;
    if (sh && sh.ref && B && !T.shared) {   // 참조 변수: 공유가 없으면 객체를 번호 없이 바로 펼친다
      if (rec.k === "this" || rec.k === "self") { const own = ownerOf(sh.v, B); if (own) return `<div class="vr"><span class="ad"></span><span class="vn">${esc(rec.k)}</span><span class="vv"><span class="hint">→ ${esc(own)} 의 객체</span></span></div>`; }
      const o = B.objects.get(sh.v); if (o) return `<div class="vr obj"><span class="ad"></span><span class="vn">${esc(rec.k)}</span><span class="vv">${objInline(o, k, T, B, 0)}</span></div>`;
    }
    const show = T.lang === "c" && rec.a && (addrAll || T.addr.show(rec, isArr));
    const ad = `<span class="ad">${show && !isArr ? esc(rec.a) : ""}</span>`;
    if (isArr) return `<div class="vr arr">${ad}<div class="vv">${arrHtml(cell, k, T, rec.k, rec.a, show || addrAll)}</div></div>`;
    return `<div class="vr">${ad}<span class="vn">${esc(rec.k)}</span><span class="vv">${cellHtml(cell, k, T, { name: rec.k })}</span></div>`;
  }
  function retExpr(inst, T) {   // 재귀 표의 R 열: 이 호출이 돌려줄 식
    if (inst.ret) return `<b>= ${esc(plain(inst.ret))}</b>`;
    const body = T.info.body(T.lang === "java" ? inst.short : inst.n); if (!body) return "";
    const rets = [];
    for (let l = body.start; l <= body.end; l++) { const m = /\breturn\b\s*(.*?)\s*;?\s*(?:\/\/.*|#.*)?$/.exec(T.info.lines[l - 1].trim()); if (m && m[1] !== undefined) rets.push({ l, expr: m[1] }); }
    const pick = rets.find((r) => r.l === inst.line) || rets.find((r) => new RegExp("\\b" + inst.short + "\\s*\\(").test(r.expr)) || rets[rets.length - 1];
    if (!pick) return "";
    let e = foldCalls(substVars(pick.expr, inst.vars), inst.short, inst.childRets, T.lang);
    const v = evalArith(e, T.lang);
    return esc(e) + (v !== null && String(v) !== e.replace(/\s+/g, "") ? ` <b>= ${esc(String(v))}</b>` : "");
  }
  function frameHtml(inst, k, T, addrAll, top, gone, B) {
    const rows = [...inst.vars.values()].map((rec) => varRow(rec, k, T, addrAll, B)).join("");
    const ret = inst.ret ? `<span class="ret">→ 반환 ${esc(plain(inst.ret))}</span>` : "";
    return `<div class="fg${top ? " top" : ""}${gone ? " gone" : ""}"><div class="fg-h"><b>${esc(inst.title)}</b><span>${inst.kind === "class" ? "" : gone ? "끝남 · 변수 묶음 지움" : top ? inst.line + "행 실행 중" : inst.line + "행에서 기다림"}</span>${ret}</div>${rows ? `<div class="fg-b">${rows}</div>` : ""}</div>`;
  }
  function branchCount(T, inst) {   // return 식에 자기 호출이 몇 번 나오나 (2번 이상 = 두 갈래 재귀)
    const body = T.info.body(T.lang === "java" ? inst.short : inst.n); if (!body) return 1;
    let best = 1;
    for (let l = body.start; l <= body.end; l++) { const ln = T.info.lines[l - 1]; if (/\breturn\b/.test(ln)) { const n = (ln.match(new RegExp("\\b" + inst.short + "\\s*\\(", "g")) || []).length; if (n > best) best = n; } }
    return best;
  }
  function recHtml(insts, k, T, addrAll, topLive) {   // 재귀 표
    const cols = []; insts.forEach((inst) => inst.vars.forEach((rec) => { if (!cols.includes(rec.k) && rec.k !== "this" && rec.k !== "self") cols.push(rec.k); }));
    const two = branchCount(T, insts[0]) >= 2;       // 두 갈래(피보나치형): 위→아래로 펼침, 단일 재귀: 아래→위로 쌓음
    const ordered = two ? insts : [...insts].reverse();
    const rows = ordered.map((inst) => `<tr class="${inst === insts[insts.length - 1] && topLive ? "cur" : ""}">${cols.map((c) => `<td>${inst.vars.get(c) ? cellHtml(inst.vars.get(c).cell, k, T, { name: c }) : ""}</td>`).join("")}<td class="R">${retExpr(inst, T)}</td></tr>`).join("");
    return `<div class="fg${topLive ? " top" : ""}"><div class="fg-h"><b>${esc(insts[0].short)} 재귀 ${insts.length}단</b><span>${two ? "위에서 아래로 펼침 · 맨 아래가 지금 실행 중 · 돌아온 값은 윗줄 식에 넣음" : "아래에서 위로 쌓임 · 맨 위가 지금 실행 중"} · R = 돌려줄 식</span></div><table class="rt"><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th>R</th></tr>${rows}</table></div>`;
  }
  function boardHtml(B, k, T, addrAll) {
    const parts = [];
    if (B.statics.size) parts.push(`<section class="hb-sec"><h4>${T.lang === "java" ? "static 필드" : "전역 · static 변수 (함수가 끝나도 남음)"}</h4>${[...B.statics.values()].map((rec) => varRow({ k: rec.label, a: rec.a, cell: rec.cell }, k, T, addrAll, B).replace('<span class="vn">', `<span class="vn">`).replace('</span><span class="vv">', `<span class="hint">${esc(rec.note)}</span></span><span class="vv">`)).join("")}</section>`);
    // 프레임 묶음: 같은 함수가 연달아 2번 이상 쌓이면 재귀 표로
    const fr = B.frames; let i = 0;
    while (i < fr.length) {
      let j = i; while (j + 1 < fr.length && fr[j + 1].n === fr[i].n) j++;
      const top = j === fr.length - 1;
      if (j > i) parts.push(recHtml(fr.slice(i, j + 1), k, T, addrAll, top));
      else parts.push(frameHtml(fr[i], k, T, addrAll, top, false, B));
      i = j + 1;
    }
    B.gone.forEach((inst) => parts.push(frameHtml(inst, k, T, addrAll, false, true, B)));
    if (!fr.length && !B.gone.length) parts.push(`<div class="empty">프로그램이 끝났습니다. 모든 변수 묶음이 지워졌습니다.</div>`);
    if (B.liveObjects.length && T.shared) parts.push(`<section class="hb-sec"><h4>${T.lang === "c" ? "힙 (malloc 으로 만든 곳)" : "객체 (번호가 같으면 같은 객체)"}</h4>${B.liveObjects.map((id) => { const o = B.objects.get(id); if (!o) return ""; const cell = o.cell;
      const body = cell.k === "arr" ? arrHtml(cell, k, T, "", null, false, /set/.test(o.t || "")) : cell.k === "st" ? `<span class="ov">${Object.keys(cell.f).length ? Object.keys(cell.f).map((f) => `<span class="fr"><span class="fn">${esc(f)}</span>${cellHtml(cell.f[f], k, T, { name: f })}</span>`).join("") : `<span class="hint">(필드 없음)</span>`}</span>` : cellHtml(cell, k, T, {});
      return `<div class="ob"><span class="ad">${esc(id)}</span><span class="ty">${esc(o.t || "")}</span>${body}</div>`; }).join("")}</section>`);
    return `<div class="hb">${parts.join("")}</div>`;
  }
  // 이번 단계에서 바뀐 것을 한국어로 (판을 훑어서 '지금 단계에 적힌' 칸을 찾는다)
  function describeBoard(B, k, T, prevStep, curStep) {
    const ch = [];
    const changes = (cell, label) => {
      if (!cell) return;
      if (cell.k === "s") { const n = cell.hist.length; if (cell.at[n - 1] === k) ch.push(n > 1 ? `${esc(label)}: ${esc(cell.hist[n - 2].v)} → <b>${esc(cell.hist[n - 1].v)}</b>` : `<span class="add">${esc(label)} = ${esc(cell.hist[0].v)}</span>`); }
      else if (cell.k === "arr") cell.items.forEach((it, i) => changes(it, label + "[" + i + "]"));
      else if (cell.k === "st") Object.keys(cell.f).forEach((f) => changes(cell.f[f], label + "." + f));
    };
    B.frames.forEach((inst) => { if (inst.start === k && k > 0) ch.push(`<span class="add">${esc(inst.title)} 호출 → 변수 묶음 새로 만듦</span>`); });
    B.gone.forEach((inst) => ch.push(`<span class="del">${esc(inst.title)} 끝 → 묶음 지움${inst.ret ? `, 돌려준 값 <b>${esc(plain(inst.ret))}</b>` : ""}</span>`));
    if (B.retNow && !B.gone.includes(B.retNow.inst)) ch.push(`${esc(B.retNow.inst.title)} 이 <b>${esc(B.retNow.val)}</b> 을(를) 돌려줌`);
    B.statics.forEach((rec) => changes(rec.cell, rec.label));
    B.frames.forEach((inst) => inst.vars.forEach((rec) => changes(rec.cell, rec.k)));
    B.liveObjects.forEach((id) => { const o = B.objects.get(id); if (o) changes(o.cell, T.shared ? (o.t ? o.t + " " : "") + id : (ownerOf(id, B) || (o.t ? o.t + " " : "") + id)); });
    if (prevStep && curStep.o !== prevStep.o) ch.push(`출력 <b>"${esc(curStep.o.slice(prevStep.o.length).replace(/\n/g, "↵"))}"</b>`);
    return ch;
  }
  /* ---- 현재 줄에 덧쓰는 값들 (흥달쌤: 조건은 값 넣은 비교식 + 1/0, 인덱스 값, *p → *(100) → a) ---- */
  function condOf(line, lang) {
    if (lang === "python") { const m = /^\s*(?:if|elif|while)\s+(.*?)\s*:\s*(?:#.*)?$/.exec(line); return m ? m[1] : null; }
    const m = /^\s*(?:\}\s*)?(?:else\s+)?(if|while|for)\s*\(/.exec(line); if (!m) return null;
    let i = m[0].length, depth = 1, j = i;
    while (j < line.length && depth) { if (line[j] === "(") depth++; else if (line[j] === ")") depth--; j++; }
    const inner = line.slice(i, j - 1);
    if (m[1] === "for") { const parts = inner.split(";"); return parts.length === 3 ? parts[1].trim() || null : null; }
    return inner.trim();
  }
  function scopeOf(B) {   // 지금 실행 중인 함수에서 보이는 변수들 (지역 + 전역·static)
    const sc = new Map(); B.statics.forEach((rec) => sc.set(rec.label, rec));
    const top = B.frames[B.frames.length - 1]; if (top) top.vars.forEach((rec, k) => sc.set(k, rec));
    return sc;
  }
  function fieldResolver(B, sc) {   // this.x / self.x → 객체 필드 값
    const self = sc.get("this") || sc.get("self"); if (!self) return () => null;
    const id = curVal(self.cell); const o = id && B.objects.get(id); if (!o || o.cell.k !== "st") return () => null;
    return (f) => { const c = o.cell.f[f] || o.cell.f[Object.keys(o.cell.f).find((n) => n.endsWith("." + f)) || ""]; return c ? curVal(c) : null; };
  }
  function indexNotes(expr, sc, lang, field, notes) {   // 원래 식 그대로: a[j+1] → a[3] = 100
    const elem = (name, idx, idx2) => {
      const rec = sc.get(name); if (!rec || !rec.cell || rec.cell.k !== "arr") return null;
      let it = rec.cell.items[idx]; if (idx2 !== undefined) it = it && it.k === "arr" ? it.items[idx2] : null;
      return it && it.k === "s" ? curVal(it) : null;
    };
    const seen = new Set();
    expr.replace(/([A-Za-z_]\w*)\[([^\[\]]+)\](?:\[([^\[\]]+)\])?/g, (m, n, e1, e2) => {
      if (!/[A-Za-z_]/.test(e1 + (e2 || "")) || seen.has(m)) return m; seen.add(m);
      const i1 = evalExpr(substVars(e1, sc, field), lang), i2 = e2 !== undefined ? evalExpr(substVars(e2, sc, field), lang) : undefined;
      if (i1 === null || i2 === null) return m;
      const v = elem(n, i1, i2); if (v === null) return m;
      notes.push(`${m.replace(/\s+/g, " ")} → ${n}[${i1}]${i2 !== undefined ? "[" + i2 + "]" : ""} = ${v}`); return m;
    });
  }
  function substArrays(expr, sc, lang, notes) {   // a[j+1] → 값 (식 계산용)
    const elem = (name, idx, idx2) => {
      const rec = sc.get(name); if (!rec || !rec.cell || rec.cell.k !== "arr") return null;
      let it = rec.cell.items[idx]; if (idx2 !== undefined) it = it && it.k === "arr" ? it.items[idx2] : null;
      return it && it.k === "s" ? curVal(it) : null;
    };
    for (let guard = 0; guard < 6; guard++) {
      let changed = false;
      expr = expr.replace(/([A-Za-z_]\w*)\[([^\[\]]+)\]\[([^\[\]]+)\]/g, (m, n, e1, e2) => { const i1 = evalExpr(e1, lang), i2 = evalExpr(e2, lang); if (i1 === null || i2 === null) return m; const v = elem(n, i1, i2); if (v === null) return m; changed = true; return v; });
      expr = expr.replace(/([A-Za-z_]\w*)\[([^\[\]]+)\]/g, (m, n, e1) => { const i1 = evalExpr(e1, lang); if (i1 === null) return m; const v = elem(n, i1); if (v === null) return m; changed = true; return v; });
      if (!changed) break;
    }
    return expr;
  }
  function valueAt(addr, B) {   // 주소 번호 → 그 자리에 있는 변수의 값 (포인터 사슬 따라가기용)
    let found = null;
    const look = (rec) => { if (found || !rec.a || !rec.cell) return; const base = Number(rec.a); const a = Number(addr);
      if (rec.cell.k === "arr") {
        const items = rec.cell.items, two = items.length && items.every((it) => it.k === "arr");
        const cols = two ? items[0].items.length : 1, n = two ? items.length * cols : items.length;
        if (a >= base && a < base + n) { const off = a - base; const it = two ? items[Math.floor(off / cols)].items[off % cols] : items[off];
          found = { name: rec.k + (two ? "[" + Math.floor(off / cols) + "][" + off % cols + "]" : "[" + off + "]"), v: it && it.k === "s" ? curVal(it) : it ? plain(curShape(it)) : "?", cell: it }; }
      }
      else if (a === base) found = { name: rec.k, v: rec.cell.k === "s" ? curVal(rec.cell) : plain(curShape(rec.cell)), cell: rec.cell }; };
    B.frames.forEach((inst) => inst.vars.forEach(look)); B.statics.forEach((rec) => look({ k: rec.label, a: rec.a, cell: rec.cell }));
    if (!found) { const o = B.objects.get(String(addr)); if (o) found = { name: "힙 " + addr, v: plain(curShape(o.cell)), cell: o.cell }; }
    return found;
  }
  function lineNotes(lineTxt, B, T) {
    const out = { cond: null, idx: [], ptr: [] }; if (!lineTxt) return out;
    const sc = scopeOf(B), field = fieldResolver(B, sc);
    const line = lineTxt.replace(/\/\/.*$|#.*$/, "");
    // 포인터 역참조: *p, **pp, *(p+1), p->f  (C만) — 흥달쌤의 "*100 → a", "*200 → (*)100" 메모
    if (T.lang === "c" && T.addr) {
      const seen = new Set();
      const subP = (e) => substVars(e, sc, field, true);   // 배열 이름은 그 주소로 (arr+1 → 101)
      const chain = (stars, inner) => {
        const addr0 = evalExpr(substArrays(subP(inner), sc, T.lang, []), T.lang); if (addr0 === null) return null;
        let addr = addr0; const parts = [];
        for (let i = 0; i < stars; i++) {
          const at = valueAt(addr, B); if (!at) return null;
          parts.push(`*(${addr})`);
          if (i === stars - 1) return parts.join(" → ") + ` → ${at.name} (${at.v})`;
          const nv = Number(at.v); if (!Number.isFinite(nv)) return null; addr = nv;
        }
        return null;
      };
      const isMul = (idx) => { const before = line.slice(0, idx); return /[\w)\]]\s*$/.test(before) && !/\b(return|case|else|do)\s*$/.test(before); };
      const re1 = /(\*+)\s*(\(([^()]*)\)|[A-Za-z_]\w*(?:\s*\[[^\]]*\])*)/g; let m;
      while ((m = re1.exec(line))) {
        if (isMul(m.index)) continue;
        const key = m[0].replace(/\s+/g, ""); if (seen.has(key)) continue; seen.add(key);
        const c = chain(m[1].length, m[3] !== undefined ? m[3] : m[2]); if (c) out.ptr.push(`${key} = ${c}`);
      }
      const re3 = /\(\s*\*\s*([A-Za-z_]\w*)\s*\)\s*\.\s*([A-Za-z_]\w*)/g;   // (*p).age
      while ((m = re3.exec(line))) {
        const key = m[0].replace(/\s+/g, ""); if (seen.has(key)) continue; seen.add(key);
        const addr = evalExpr(subP(m[1]), T.lang); if (addr === null) continue;
        const at = valueAt(addr, B); if (!at) continue;
        const fc = at.cell && at.cell.k === "st" ? at.cell.f[m[2]] : null; const fv = fc ? (fc.k === "s" ? curVal(fc) : plain(curShape(fc))) : null;
        out.ptr.push(`${key} = *(${addr}).${m[2]} → ${at.name}.${m[2]}${fv !== null ? " = " + fv : ""}`);
      }
      const re2 = /(\(([^()]*)\)|[A-Za-z_]\w*)\s*->\s*([A-Za-z_]\w*)/g;
      while ((m = re2.exec(line))) {
        const key = m[0].replace(/\s+/g, ""); if (seen.has(key)) continue; seen.add(key);
        const addr = evalExpr(subP(m[2] !== undefined ? m[2] : m[1]), T.lang); if (addr === null) continue;
        const at = valueAt(addr, B); if (!at) continue;
        const fc = at.cell && at.cell.k === "st" ? at.cell.f[m[3]] : null; const fv = fc ? (fc.k === "s" ? curVal(fc) : plain(curShape(fc))) : null;
        out.ptr.push(`${key} → ${addr} → ${at.name}.${m[3]}${fv !== null ? " = " + fv : ""}`);
      }
    }
    // 조건식: 값 넣은 비교식 + 결과
    const cond = condOf(line, T.lang);
    indexNotes(cond || line, sc, T.lang, field, out.idx);
    if (cond) {
      const sub = substArrays(substVars(cond, sc, field), sc, T.lang, []).replace(/\s+/g, " ").trim();
      let v = evalExpr(sub, T.lang);
      // 단락 평가: 최상위 && / || 로 나눠 왼쪽부터 보고, 결과가 정해지면 나머지는 평가하지 않는다
      const parts = []; { let depth = 0, cur = "", i = 0; const src = sub;
        while (i < src.length) { const ch = src[i]; if (ch === "(") depth++; else if (ch === ")") depth--;
          const two = src.slice(i, i + 2), w = /^\s(and|or)\s/.exec(src.slice(i));
          if (depth === 0 && (two === "&&" || two === "||")) { parts.push(cur.trim(), two); cur = ""; i += 2; continue; }
          if (depth === 0 && w) { parts.push(cur.trim(), w[1] === "and" ? "&&" : "||"); cur = ""; i += w[0].length - 1; continue; }
          cur += ch; i++; }
        parts.push(cur.trim()); }
      if (parts.length >= 3) {
        let acc = null;
        for (let i = 0; i < parts.length; i += 2) {
          const pv = evalExpr(parts[i], T.lang); if (pv === null) { acc = null; break; }
          const op = parts[i - 1]; acc = i === 0 ? (pv ? 1 : 0) : op === "&&" ? (acc && pv ? 1 : 0) : (acc || pv ? 1 : 0);
          const nextOp = parts[i + 1];
          if (nextOp && ((nextOp === "&&" && !acc) || (nextOp === "||" && acc))) { out.sc = parts.slice(i + 2).filter((_, j) => j % 2 === 0).join(" " + nextOp + " "); v = acc; break; }
        }
      }
      const res = v === null ? null : T.lang === "python" ? (v ? "True" : "False") : T.lang === "java" ? (v ? "true" : "false") : String(v ? 1 : 0);
      if (sub !== cond.replace(/\s+/g, " ").trim() || res !== null) out.cond = { expr: cond.replace(/\s+/g, " ").trim(), sub, res };
    }
    return out;
  }
  const outHtml = (o) => esc(o).replace(/ /g, '<i class="sp"> </i>').replace(/\n/g, '<i class="nl">↵</i>\n');

  function mountTrace(id) {
    loadTrace(id).then((c) => {
      const box = $("#trace"); if (!box) return;
      const steps = expandTrace(c), info = codeInfo(c.code, c.lang), lines = info.lines;
      const T = { steps, lang: c.lang, info, addr: null, regionOf: () => null };
      // 참조 공유가 있는 문제인가 (같은 객체를 두 변수·필드가 가리키는 단계가 있으면) — 흥달쌤은 그때만 객체에 번호를 붙인다
      T.shared = c.lang === "c" || steps.some((s) => { const cnt = {}; const add = (x) => { const m = /^(?:→|@)(\d+)$/.exec(String(x)); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; };
        s.f.forEach((fr) => fr.v.forEach((v) => { if (v.k !== "this" && v.k !== "self" && v.k !== "args") add(v.x); })); (s.s || []).forEach((v) => add(v.x));
        Object.values(s.h || {}).forEach((o) => { if (Array.isArray(o.v)) o.v.forEach(add); else if (o.v && typeof o.v === "object") Object.values(o.v).forEach(add); });
        return Object.values(cnt).some((n) => n >= 2); });
      if (c.lang === "c") { T.addr = addrInfo(steps, info); T.regionOf = T.addr.regionOf; }
      let k = Number((S.tracePos || {})[id] || 0); if (k >= steps.length) k = 0;
      let addrAll = !!S.traceAddrAll;
      box.innerHTML = `<div class="trace-h"><b>실행 추적</b><span class="hint">손으로 따라 푸는 순서 그대로</span>${c.fill ? `<span class="pill mark">빈칸을 정답으로 채운 코드</span>` : ""}${c.stdin ? `<span class="pill">입력: ${esc(c.stdin.trim().replace(/\n/g, " ⏎ "))}</span>` : ""}
          <span class="trace-ctl"><button data-t="first" title="처음">⏮</button><button data-t="prev" title="이전 ( [ 키 )">◀</button><span class="pos" id="tpos"></span><button data-t="next" title="다음 ( ] 키 )">▶</button><button data-t="last" title="끝">⏭</button></span></div>
        <input type="range" id="trange" min="0" max="${steps.length - 1}" value="${k}">
        <div class="trace-code" id="tcode">${lines.map((ln, i) => `<div class="ln" data-l="${i + 1}"><span class="g">${i + 1}</span><span class="src">${esc(ln) || " "}</span><span class="cv"></span><span class="rv"></span><span class="ok">✓</span></div>`).join("")}</div>
        <div class="trace-now" id="tnow"></div>
        <div class="trace-h" style="margin-top:4px"><span class="hint">손풀이 판 · 흥달쌤 방식</span>${c.lang === "c" ? `<span class="trace-opts">주소 <button id="taddr" class="${addrAll ? "on" : ""}" title="포인터·배열 문제가 아니면 주소를 생략합니다. 켜면 모든 변수에 100·200·300 을 붙입니다">모두 보기</button></span>` : ""}</div>
        <div id="tboard"></div>
        <section class="hb-sec" style="margin-top:8px"><h4>출력</h4><div class="tout" id="tout"></div></section>
        <div class="trace-note">${c.status === "truncated" ? `${steps.length}단계까지만 기록했습니다 (반복이 길어 이후 생략). ` : ""}${c.lang === "c" ? "주소는 변수마다 100, 200, 300…, 배열 원소는 100, 101, 102…로 단순화했습니다. 포인터 값은 가리키는 변수의 주소이고 → 뒤는 그 주소가 어느 변수인지입니다. 주소는 포인터·배열·같은 이름 변수가 나오는 문제에서만 적습니다. <i>?</i> 는 아직 값이 정해지지 않은(쓰레기값) 상태입니다." : "변수 값의 100, 200 은 객체를 구분하는 번호입니다. 같은 번호면 같은 객체(같은 참조)입니다."} 빗금은 지워진 옛 값, 노란 칸은 이번 단계에 적힌 값입니다. 코드 줄 끝의 ✓ 는 한 번 이상 실행된 줄, 파란 표는 그 줄에서 부른 함수가 돌려준 값입니다.</div>`;
      const show = (n) => {
        k = Math.max(0, Math.min(steps.length - 1, n)); const cur = steps[k], prev = steps[k - 1];
        S.tracePos = S.tracePos || {}; S.tracePos[id] = k; Store.save();
        const B = buildBoard(T, k);
        $("#tpos").textContent = `${k + 1} / ${steps.length}`; $("#trange").value = String(k);
        $$("#tcode .ln").forEach((el) => {
          const l = Number(el.dataset.l); el.classList.toggle("cur", l === cur.l); el.classList.toggle("done", B.done.has(l)); el.classList.toggle("skip", B.skipped.has(l)); el.querySelector(".ok").textContent = B.skipped.has(l) ? "✗" : "✓";
          const r = B.lineRets.get(l); el.querySelector(".rv").innerHTML = r ? `${esc(r.text)}${r.n > 1 ? ` <span style="opacity:.7">(${r.n}번째)</span>` : ""}` : "";
        });
        const curEl = $(`#tcode .ln[data-l="${cur.l}"]`); if (curEl) { const cbox = $("#tcode"); const top = curEl.offsetTop - cbox.clientHeight / 2 + 12; cbox.scrollTo({ top: Math.max(0, top) }); }
        const lineTxt = cur.l ? (lines[cur.l - 1] || "").trim() : "";
        const changes = describeBoard(B, k, T, prev, cur);
        const notes = cur.e === "end" ? { cond: null, idx: [], ptr: [] } : lineNotes(lineTxt, B, T);
        const pre = [];
        if (notes.cond) pre.push(`<span class="note">조건</span> <code>${esc(notes.cond.expr)}</code>${notes.cond.sub !== notes.cond.expr ? ` → <code>${esc(notes.cond.sub)}</code>` : ""}${notes.cond.res !== null ? ` → <b>${esc(notes.cond.res)}</b>` : ""}${notes.sc ? ` · 앞에서 결정 → <s>${esc(notes.sc)}</s> 는 평가 안 함 <span class="x">✗</span>` : ""}`);
        notes.ptr.forEach((x) => pre.push(`<span class="note">포인터</span> <code>${esc(x)}</code>`));
        notes.idx.forEach((x) => pre.push(`<span class="note">인덱스</span> <code>${esc(x)}</code>`));
        $$("#tcode .ln .cv").forEach((el) => { el.textContent = ""; });
        if (notes.cond && curEl) curEl.querySelector(".cv").textContent = (notes.cond.sub !== notes.cond.expr ? notes.cond.sub : "") + (notes.cond.res !== null ? (notes.cond.sub !== notes.cond.expr ? " → " : "") + notes.cond.res : "");
        $("#tnow").innerHTML = `<span class="ev">${cur.e === "end" ? "종료" : k === 0 ? "시작" : `${cur.l}행`}</span>${cur.e === "end" ? "프로그램이 끝났습니다." : k === 0 ? `main 부터 봅니다. <code>${esc(lineTxt)}</code>` : `<code>${esc(lineTxt)}</code>`}${pre.length || changes.length ? `<ul>${pre.concat(changes).map((x) => `<li>${x}</li>`).join("")}</ul>` : `<div class="hint">판에 적을 변화 없음 (조건 검사·이동)</div>`}`;
        $("#tboard").innerHTML = boardHtml(B, k, T, addrAll);
        $("#tout").innerHTML = outHtml(cur.o) + (cur.e === "end" ? `<i class="fin">◯ 최종 출력</i>` : "");
      };
      $$(".trace-ctl button", box).forEach((b) => b.addEventListener("click", () => show({ first: 0, prev: k - 1, next: k + 1, last: steps.length - 1 }[b.dataset.t])));
      $("#trange").addEventListener("input", (e) => show(Number(e.target.value)));
      const ta = $("#taddr"); if (ta) ta.addEventListener("click", () => { addrAll = !addrAll; S.traceAddrAll = addrAll; Store.save(); ta.classList.toggle("on", addrAll); show(k); });
      box.dataset.ready = "1"; box._show = (d) => show(k + d);
      show(k);
    }).catch((e) => { console.error(e); const box = $("#trace"); if (box) box.querySelector(".trace-note").textContent = "추적 데이터를 불러오지 못했어요."; });
  }

