  /* ================= SQL 판 (실행 흐름을 코드 추적처럼) =================
     시험용 SQL(SELECT · WHERE · 서브쿼리 · IN · 집계 · GROUP BY · ORDER BY)을 작은 해석기로 돌리면서,
     "테이블 묶음이 등록되고(FROM) → 행을 하나씩 집어 조건을 검사하고(WHERE) → 가상 테이블이 생겨 바깥으로 올라가는" 순간마다 판을 찍는다.
     묶음이 생겼다 지워지는 모양은 코드 추적 판의 함수 묶음과 같다. */
  const Sql = {
    /* ---- 표 입력 파싱: "이름 / 머리글 / 행들" 을 빈 줄로 구분 ---- */
    parseTables(text) {
      const tables = {};
      text.replace(/\r/g, "").split(/\n\s*\n/).forEach((block) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean); if (lines.length < 2) return;
        const name = lines[0].replace(/^\[?표\]?\s*/, "").replace(/[<>\[\]]/g, "").trim();
        const cols = lines[1].split(/\s*[\t|,]\s*|\s{1,}/).filter(Boolean);
        const rows = lines.slice(2).map((l) => { const v = l.split(/\s*[\t|,]\s*|\s{1,}/).filter(Boolean); const o = {}; cols.forEach((c, i) => { const x = v[i]; o[c] = x === undefined || /^null$/i.test(x) ? null : /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x.replace(/^'|'$/g, ""); }); return o; });
        tables[name] = { cols, rows };
      });
      return tables;
    },
    /* ---- 토큰 ---- */
    tokenize(sql) {
      const re = /\s+|--[^\n]*|'(?:[^']|'')*'|\d+(?:\.\d+)?|<>|!=|<=|>=|[<>=]|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?|\*|[(),+\-\/%;]/gy;
      const out = []; let m; re.lastIndex = 0; let pos = 0;
      while (pos < sql.length) { re.lastIndex = pos; m = re.exec(sql); if (!m || m.index !== pos) throw new Error("알 수 없는 글자: " + sql.slice(pos, pos + 10)); pos = re.lastIndex; const t = m[0]; if (/^\s+$|^--/.test(t)) continue; out.push(t); }
      return out;
    },
    KW: new Set(["SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "AND", "OR", "NOT", "IN", "EXISTS", "AS", "IS", "NULL", "BETWEEN", "LIKE", "DISTINCT", "ASC", "DESC", "JOIN", "ON", "INNER", "LEFT", "LIMIT"]),
    AGG: new Set(["COUNT", "SUM", "AVG", "MAX", "MIN"]),
    /* ---- 파서 → AST ---- */
    parse(sql) {
      const T = this.tokenize(sql.replace(/;\s*$/, "")); let i = 0;
      const peek = (k = 0) => (T[i + k] || "").toUpperCase(), next = () => T[i++], eat = (w) => { if (peek() === w) { i++; return true; } return false; };
      const expect = (w) => { if (!eat(w)) throw new Error(`${w} 가 와야 하는데 '${T[i] || "끝"}' 가 왔어요`); };
      const self = this;
      function select() {
        expect("SELECT"); const node = { t: "select", cols: [], distinct: eat("DISTINCT") };
        do { if (peek() === "*") { next(); node.cols.push({ expr: { t: "star" } }); } else { const e = expr(); let alias = null; if (eat("AS")) alias = next(); else if (T[i] && !self.KW.has(peek()) && /^[A-Za-z_]/.test(T[i]) && peek() !== "FROM") alias = next(); node.cols.push({ expr: e, alias }); } } while (eat(","));
        expect("FROM"); node.from = []; do { const name = next(); let alias = null; if (eat("AS")) alias = next(); else if (T[i] && !self.KW.has(peek()) && /^[A-Za-z_]/.test(T[i]) && !/^[(),]/.test(T[i])) alias = next(); const f = { table: name, alias: alias || name }; node.from.push(f);
          while (peek() === "JOIN" || peek() === "INNER" || peek() === "LEFT") { const left = peek() === "LEFT"; next(); if (left) eat("OUTER"); if (left || peek() === "JOIN") eat("JOIN"); const jn = next(); let ja = null; if (eat("AS")) ja = next(); else if (T[i] && !self.KW.has(peek()) && /^[A-Za-z_]/.test(T[i])) ja = next(); expect("ON"); const on = expr(); node.from.push({ table: jn, alias: ja || jn, join: left ? "left" : "inner", on }); } } while (eat(","));
        if (eat("WHERE")) node.where = expr();
        if (eat("GROUP")) { expect("BY"); node.group = []; do node.group.push(expr()); while (eat(",")); }
        if (eat("HAVING")) node.having = expr();
        if (eat("ORDER")) { expect("BY"); node.order = []; do { const e = expr(); const dir = eat("DESC") ? "desc" : (eat("ASC"), "asc"); node.order.push({ expr: e, dir }); } while (eat(",")); }
        if (eat("LIMIT")) node.limit = Number(next());
        return node;
      }
      function expr() { return orE(); }
      function orE() { let l = andE(); while (eat("OR")) l = { t: "bin", op: "OR", l, r: andE() }; return l; }
      function andE() { let l = notE(); while (eat("AND")) l = { t: "bin", op: "AND", l, r: notE() }; return l; }
      function notE() { if (eat("NOT")) return { t: "not", e: notE() }; return cmp(); }
      function cmp() {
        if (peek() === "EXISTS") { next(); expect("("); const s = select(); expect(")"); return { t: "exists", sub: s }; }
        let l = add();
        if (peek() === "NOT" && (peek(1) === "IN" || peek(1) === "BETWEEN" || peek(1) === "LIKE")) { next(); const r = cmp2(l); r.neg = true; return r; }
        if (["IN", "BETWEEN", "LIKE", "IS"].includes(peek())) return cmp2(l);
        if (["=", "<>", "!=", "<", ">", "<=", ">="].includes(peek())) { const op = next(); return { t: "bin", op: op === "!=" ? "<>" : op, l, r: add() }; }
        return l;
      }
      function cmp2(l) {
        if (eat("IN")) { expect("("); if (peek() === "SELECT") { const s = select(); expect(")"); return { t: "in", e: l, sub: s }; } const list = []; do list.push(expr()); while (eat(",")); expect(")"); return { t: "in", e: l, list }; }
        if (eat("BETWEEN")) { const a = add(); expect("AND"); const b = add(); return { t: "between", e: l, a, b }; }
        if (eat("LIKE")) return { t: "like", e: l, p: add() };
        if (eat("IS")) { const neg = eat("NOT"); expect("NULL"); return { t: "isnull", e: l, neg }; }
        throw new Error("비교식 오류");
      }
      function add() { let l = mul(); while (peek() === "+" || peek() === "-") { const op = next(); l = { t: "ar", op, l, r: mul() }; } return l; }
      function mul() { let l = unary(); while (peek() === "*" || peek() === "/" || peek() === "%") { const op = next(); l = { t: "ar", op, l, r: unary() }; } return l; }
      function unary() { if (peek() === "-") { next(); return { t: "ar", op: "-", l: { t: "num", v: 0 }, r: unary() }; } return prim(); }
      function prim() {
        const tok = T[i]; if (tok === undefined) throw new Error("식이 끝나지 않았어요");
        if (tok === "(") { next(); if (peek() === "SELECT") { const s = select(); expect(")"); return { t: "sub", sub: s }; } const e = expr(); expect(")"); return e; }
        if (/^\d/.test(tok)) { next(); return { t: "num", v: Number(tok) }; }
        if (tok[0] === "'") { next(); return { t: "str", v: tok.slice(1, -1).replace(/''/g, "'") }; }
        if (peek() === "NULL") { next(); return { t: "null" }; }
        if (self.AGG.has(peek()) && T[i + 1] === "(") { const fn = next().toUpperCase(); next(); const distinct = eat("DISTINCT"); let arg; if (peek() === "*") { next(); arg = { t: "star" }; } else arg = expr(); expect(")"); return { t: "agg", fn, arg, distinct }; }
        next(); const parts = tok.split("."); return parts.length === 2 ? { t: "col", tbl: parts[0], name: parts[1] } : { t: "col", name: tok };
      }
      const ast = select(); if (i < T.length) throw new Error("남는 토큰: " + T.slice(i).join(" ")); return ast;
    },
    /* ---- 보기 좋게 다시 쓰기 (줄마다 번호, 서브쿼리는 들여쓰기). 각 절이 몇 째 줄인지도 기록 ---- */
    /* 식 하나를 글자로 (줄 번호는 건드리지 않음) */
    exprText(e) {
      const ex = (x) => this.exprText(x);
      {
        switch (e.t) {
          case "num": return String(e.v); case "str": return `'${e.v}'`; case "null": return "NULL"; case "star": return "*";
          case "col": return e.tbl ? `${e.tbl}.${e.name}` : e.name;
          case "agg": return `${e.fn}(${e.distinct ? "DISTINCT " : ""}${ex(e.arg)})`;
          case "ar": return `${ex(e.l)} ${e.op} ${ex(e.r)}`;
          case "bin": return `${ex(e.l)} ${e.op} ${ex(e.r)}`;
          case "not": return `NOT ${ex(e.e)}`;
          case "in": return `${ex(e.e)} ${e.neg ? "NOT " : ""}IN (${e.sub ? "…" : e.list.map(ex).join(", ")})`;
          case "exists": return `EXISTS (…)`;
          case "between": return `${ex(e.e)} ${e.neg ? "NOT " : ""}BETWEEN ${ex(e.a)} AND ${ex(e.b)}`;
          case "like": return `${ex(e.e)} ${e.neg ? "NOT " : ""}LIKE ${ex(e.p)}`;
          case "isnull": return `${ex(e.e)} IS ${e.neg ? "NOT " : ""}NULL`;
          case "sub": return "(…)";
        }
        return "?";
      }
    },
    pretty(ast) {
      const lines = []; const self = this; const ex = (e) => self.exprText(e);
      const subsOf = (e, out = []) => { if (!e || typeof e !== "object") return out; if (e.t === "sub" || e.t === "in" && e.sub || e.t === "exists") out.push(e.sub); ["l", "r", "e", "a", "b", "p", "arg"].forEach((k) => { if (e[k]) subsOf(e[k], out); }); return out; };
      const emit = (sel, ind) => {
        const pad = "  ".repeat(ind);
        sel.ln = {};
        sel.ln.select = lines.push(pad + "SELECT " + (sel.distinct ? "DISTINCT " : "") + sel.cols.map((c) => ex(c.expr) + (c.alias ? " AS " + c.alias : "")).join(", "));
        sel.ln.from = lines.push(pad + "FROM " + sel.from.map((f, k) => (k && f.join ? (f.join === "left" ? "LEFT JOIN " : "JOIN ") : k ? ", " : "") + f.table + (f.alias !== f.table ? " AS " + f.alias : "") + (f.on ? " ON " + ex(f.on) : "")).join(""));
        if (sel.where) { sel.ln.where = lines.push(pad + "WHERE " + ex(sel.where)); subsOf(sel.where).forEach((s) => emit(s, ind + 1)); }
        if (sel.group) sel.ln.group = lines.push(pad + "GROUP BY " + sel.group.map(ex).join(", "));
        if (sel.having) { sel.ln.having = lines.push(pad + "HAVING " + ex(sel.having)); subsOf(sel.having).forEach((s) => emit(s, ind + 1)); }
        if (sel.order) sel.ln.order = lines.push(pad + "ORDER BY " + sel.order.map((o) => ex(o.expr) + (o.dir === "desc" ? " DESC" : "")).join(", "));
        sel.cols.forEach((c) => subsOf(c.expr).forEach((s) => emit(s, ind + 1)));
      };
      emit(ast, 0); return lines;
    },
    /* ---- 실행 + 단계 기록 ---- */
    run(tables, sql, maxSteps = 600) {
      const ast = this.parse(sql); const lines = this.pretty(ast);
      const steps = []; const scope = [];      // scope: [{alias, table, rows, cur, marks}] 바깥 → 안쪽
      const results = [];                      // 생긴 가상 테이블·값 (라벨, 내용)
      const self = this; let depthNames = 0;
      const snap = (line, text, extra) => {
        if (steps.length >= maxSteps) throw { truncated: true };
        steps.push({ l: line, text, scope: scope.map((f) => ({ alias: f.alias, table: f.table, cols: f.cols, rows: f.rows, cur: f.cur, marks: { ...f.marks }, label: f.label })), results: results.map((r) => ({ ...r })), ...extra });
      };
      const fmt = (v) => v === null || v === undefined ? "NULL" : typeof v === "string" ? `'${v}'` : String(v);
      const findCol = (name, tbl) => {   // 안쪽 묶음부터 바깥으로 찾는다. 별명(A, A2)이 먼저, 테이블 이름은 그 별명이 없을 때만
        const byAlias = tbl && scope.some((f) => f.alias === tbl);
        for (let k = scope.length - 1; k >= 0; k--) { const f = scope[k]; if (tbl && (byAlias ? f.alias !== tbl : f.table !== tbl)) continue; if (f.cols.includes(name)) return { f, k }; }
        throw new Error(`열 ${tbl ? tbl + "." : ""}${name} 을 찾을 수 없어요`);
      };
      const val = (e, sel) => {   // 지금 집은 행들에 대해 식의 값
        switch (e.t) {
          case "num": case "str": return e.v; case "null": return null;
          case "col": { const { f } = findCol(e.name, e.tbl); if (f.cur === null) return null; return f.rows[f.cur][e.name]; }
          case "ar": { const a = val(e.l, sel), b = val(e.r, sel); if (a === null || b === null) return null; return e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : e.op === "/" ? (Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b) : a % b; }
          case "bin": {
            if (e.op === "AND") { const a = truth(e.l, sel); if (a === false) return false; const b = truth(e.r, sel); return a === null || b === null ? (b === false ? false : null) : b; }
            if (e.op === "OR") { const a = truth(e.l, sel); if (a === true) return true; const b = truth(e.r, sel); return a === null || b === null ? (b === true ? true : null) : b; }
            const a = val(e.l, sel), b = val(e.r, sel); if (a === null || b === null) return null;
            return e.op === "=" ? a == b : e.op === "<>" ? a != b : e.op === "<" ? a < b : e.op === ">" ? a > b : e.op === "<=" ? a <= b : a >= b;
          }
          case "not": { const a = truth(e.e, sel); return a === null ? null : !a; }
          case "between": { const x = val(e.e, sel), a = val(e.a, sel), b = val(e.b, sel); if (x === null || a === null || b === null) return null; const r = x >= a && x <= b; return e.neg ? !r : r; }
          case "like": { const x = val(e.e, sel), p = val(e.p, sel); if (x === null || p === null) return null; const re = new RegExp("^" + String(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i"); const r = re.test(String(x)); return e.neg ? !r : r; }
          case "isnull": { const x = val(e.e, sel); return e.neg ? x !== null : x === null; }
          case "in": {
            const x = val(e.e, sel); let list;
            if (e.sub) { const rows = evalSelect(e.sub, "IN 의 목록"); list = rows.map((r) => Object.values(r)[0]); }
            else list = e.list.map((v) => val(v, sel));
            if (x === null) return null; const hit = list.some((v) => v == x); const r = e.neg ? !hit : hit;
            if (e.sub) snap(sel.ln.where, `${ex(e.e)} = ${fmt(x)} 이(가) 목록 (${list.map(fmt).join(", ") || "비어 있음"}) 에 ${hit ? "있음" : "없음"} → ${r ? "참" : "거짓"}`); return r;
          }
          case "exists": { const rows = evalSelect(e.sub, "EXISTS"); return rows.length > 0; }
          case "sub": { const rows = evalSelect(e.sub, "스칼라 서브쿼리"); const v = rows.length ? Object.values(rows[0])[0] : null; snap(sel.ln.where, `서브쿼리 값 = ${fmt(v)}${rows.length ? "" : " (행이 없어서 NULL)"} 를 바깥 식에 넣음`); return v; }
          case "agg": throw new Error("집계 함수는 SELECT·HAVING 에서만");
        }
        throw new Error("식 평가 오류 " + e.t);
      };
      const truth = (e, sel) => { const v = val(e, sel); return v === null ? null : !!v; };
      const ex = (e) => self.exprText(e);   // 줄 번호를 건드리지 않고 식만 글자로
      const aggOf = (fn, vals, distinct) => { let v = vals.filter((x) => x !== null); if (distinct) v = [...new Set(v)]; if (fn === "COUNT") return v.length; if (!v.length) return null; if (fn === "SUM") return v.reduce((a, b) => a + b, 0); if (fn === "AVG") return v.reduce((a, b) => a + b, 0) / v.length; if (fn === "MAX") return v.reduce((a, b) => (a > b ? a : b)); return v.reduce((a, b) => (a < b ? a : b)); };
      const hasAgg = (e) => !!e && typeof e === "object" && (e.t === "agg" || ["l", "r", "e", "a", "b", "arg"].some((k) => hasAgg(e[k])));
      const evalAgg = (e, rowsScope, sel) => {   // 집계가 섞인 식: 집계는 묶음 전체로, 나머지는 첫 행 기준
        if (e.t === "agg") {
          const real = rowsScope.filter((p) => !p.dummy);
          if (e.arg.t === "star") return real.length;
          const vals = real.map((pick) => { pick(); return val(e.arg, sel); }); return aggOf(e.fn, vals, e.distinct);
        }
        if (["ar", "bin"].includes(e.t) && hasAgg(e)) { const a = evalAgg(e.l, rowsScope, sel), b = evalAgg(e.r, rowsScope, sel); if (e.t === "ar") { if (a === null || b === null) return null; return e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : e.op === "/" ? a / b : a % b; } if (a === null || b === null) return null; return e.op === "=" ? a == b : e.op === "<>" ? a != b : e.op === "<" ? a < b : e.op === ">" ? a > b : e.op === "<=" ? a <= b : e.op === ">=" ? a >= b : e.op === "AND" ? a && b : a || b; }
        if (e.t === "not" && hasAgg(e)) { const a = evalAgg(e.e, rowsScope, sel); return a === null ? null : !a; }
        rowsScope[0](); return val(e, sel);
      };
      // 서브쿼리가 바깥 묶음의 어떤 값에 기대는지 (상관 참조) → 그 값이 같으면 다시 계산하지 않는다
      const refKey = (sel) => {
        const parts = new Set();
        const walk = (e) => { if (!e || typeof e !== "object") return; if (Array.isArray(e)) { e.forEach(walk); return; }
          if (e.t === "col") { const byAlias = e.tbl && scope.some((f) => f.alias === e.tbl); for (let k = scope.length - 1; k >= 0; k--) { const f = scope[k]; if (f.hidden) continue; if (e.tbl && (byAlias ? f.alias !== e.tbl : f.table !== e.tbl)) continue; if (f.cols.includes(e.name)) { parts.add(`${f.alias}.${e.name} = ${fmt(f.cur === null ? null : f.rows[f.cur][e.name])}`); break; } } return; }
          Object.keys(e).forEach((k) => { if (k !== "ln" && k !== "_memo") walk(e[k]); }); };
        walk(sel.cols); walk(sel.from.map((f) => f.on)); walk(sel.where); walk(sel.having); return [...parts];
      };
      function evalSelect(sel, why) {
        const depth = scope.length;
        const keyParts = depth ? refKey(sel) : [], key = keyParts.join(" | ");
        if (depth && sel._memo && sel._memo.has(key)) {
          const rows = sel._memo.get(key);
          snap(sel.ln.select, `${why}: 바깥 값(${keyParts.join(", ") || "없음"})이 같아서 앞서 만든 가상 테이블 재사용 → (${rows.map((r) => fmt(Object.values(r)[0])).join(", ") || "비어 있음"})`);
          return rows;
        }
        // FROM: 묶음 등록 (JOIN 은 미리 곱집합/조건으로 한 묶음으로 만든다)
        let frames = sel.from.map((f) => { const t = tables[f.table]; if (!t) throw new Error(`테이블 ${f.table} 이 없어요`); return { alias: f.alias, table: f.table, cols: t.cols, rows: t.rows.map((r) => ({ ...r })), cur: null, marks: {}, on: f.on, join: f.join }; });
        let combo;   // 여러 테이블이면 곱집합 → 각 행은 {alias: row}
        if (frames.length === 1) { combo = null; scope.push(frames[0]); snap(sel.ln.from, `${why ? why + ": " : ""}${frames[0].table}${frames[0].alias !== frames[0].table ? " 을 " + frames[0].alias + " 이름으로" : ""} 등록 (${frames[0].rows.length}행)${depth ? " — 바깥 묶음은 그대로 둔 채 안쪽 묶음이 새로 생김" : ""}`); }
        else {
          combo = [{}]; frames.forEach((f, k) => { const nc = []; combo.forEach((c) => f.rows.forEach((r) => nc.push({ ...c, [f.alias]: r }))); combo = nc;
            if (f.on) { frames.forEach((g) => scope.includes(g) || scope.push(g)); const kept = combo.filter((c) => { frames.forEach((g) => { g.cur = c[g.alias] ? g.rows.indexOf(c[g.alias]) : null; }); return truth(f.on, sel) === true; }); if (f.join === "left") { const have = new Set(kept.map((c) => c[frames[0].alias])); frames[0].rows.forEach((r) => { if (!have.has(r)) kept.push({ ...Object.fromEntries(frames.map((g) => [g.alias, null])), [frames[0].alias]: r }); }); } combo = kept; frames.forEach((g) => { const idx = scope.indexOf(g); if (idx >= 0) scope.splice(idx, 1); }); } });
          const joined = { alias: sel.from.map((f) => f.alias).join("⋈"), table: sel.from.map((f) => f.table).join(" ⋈ "), cols: [], rows: [], cur: null, marks: {}, combo: true };
          const colsSeen = new Set(); frames.forEach((f) => f.cols.forEach((c) => { const nm = colsSeen.has(c) ? f.alias + "." + c : c; colsSeen.add(c); }));
          joined.cols = frames.flatMap((f) => f.cols.map((c) => frames.filter((g) => g.cols.includes(c)).length > 1 ? f.alias + "." + c : c));
          joined.rows = combo.map((c) => { const o = {}; frames.forEach((f) => f.cols.forEach((cc) => { const nm = frames.filter((g) => g.cols.includes(cc)).length > 1 ? f.alias + "." + cc : cc; o[nm] = c[f.alias] ? c[f.alias][cc] : null; })); return o; });
          joined.sub = frames; scope.push(joined); snap(sel.ln.from, `${sel.from.map((f) => f.table).join(" 과 ")} 를 ${sel.from.some((f) => f.on) ? "ON 조건으로 맞춰" : "모든 조합으로"} 한 묶음으로 등록 (${joined.rows.length}행)`);
        }
        const frame = scope[scope.length - 1];
        // 조인 묶음의 열 참조: alias.col 을 찾을 수 있게 가짜 묶음을 안쪽에 덧댄다
        const pick = (idx) => { frame.cur = idx; if (frame.sub) frame.sub.forEach((g) => { g.cur = idx === null ? null : g.rows.indexOf(combo[idx][g.alias]); }); };
        if (frame.sub) frame.sub.forEach((g) => { g.hidden = true; scope.splice(scope.length - 1, 0, g); });
        // WHERE: 행 하나씩
        let kept = [];
        if (sel.where) {
          for (let r = 0; r < frame.rows.length; r++) {
            pick(r); snap(sel.ln.where, `${frame.alias} 의 ${r + 1}행 (${frame.cols.slice(0, 4).map((c) => c + " " + fmt(frame.rows[r][c])).join(", ")}) 을 집고 조건 검사`);
            const tv = truth(sel.where, sel); const ok = tv === true; frame.marks[r] = ok ? "o" : "x"; if (ok) kept.push(r);
            snap(sel.ln.where, `${ex(sel.where)} → ${ok ? "참 ✓ 남김" : "거짓 X"}${tv === null ? " (NULL 비교라 거짓 취급)" : ""}`);
          }
        } else { kept = frame.rows.map((_, r) => r); pick(null); }
        pick(null);
        // GROUP BY / 집계 / 투영
        const colName = (c, k) => c.alias || (c.expr.t === "col" ? c.expr.name : c.expr.t === "star" ? "*" : ex(c.expr));
        let out = [];
        const groups = sel.group ? (() => { const m = new Map(); kept.forEach((r) => { pick(r); const key = JSON.stringify(sel.group.map((g) => val(g, sel))); if (!m.has(key)) m.set(key, []); m.get(key).push(r); }); return [...m.values()]; })() : (sel.cols.some((c) => hasAgg(c.expr)) ? [kept] : null);
        if (groups) {
          groups.forEach((rs) => {
            const rowsScope = rs.map((r) => () => pick(r)); if (!rs.length) { const d = () => pick(null); d.dummy = true; rowsScope.push(d); }
            if (sel.having) { const h = evalAgg(sel.having, rowsScope, sel); if (h !== true) { snap(sel.ln.having, `묶음 (${rs.length}행) HAVING 거짓 → 버림`); return; } }
            const o = {}; sel.cols.forEach((c, k) => { if (c.expr.t === "star") { pick(rs[0]); frame.cols.forEach((cc) => { o[cc] = frame.rows[rs[0]][cc]; }); } else o[colName(c, k)] = evalAgg(c.expr, rowsScope, sel); });
            out.push(o);
            const descr = sel.cols.filter((c) => hasAgg(c.expr)).map((c) => `${ex(c.expr)} = ${fmt(Object.values(o)[sel.cols.indexOf(c)])}`).join(", ");
            snap(sel.ln.select, `${sel.group ? "묶음 " + rs.length + "행" : "남은 " + rs.length + "행"}${rs.length ? " (" + rs.map((r) => r + 1).join(",") + "행)" : ""} 로 집계: ${descr || "열 뽑기"}${!rs.length && /AVG|SUM|MAX|MIN/.test(descr) ? " — 행이 없으면 COUNT 는 0, 나머지는 NULL" : ""}`);
          });
          pick(null);
        } else {
          kept.forEach((r) => { pick(r); const o = {}; sel.cols.forEach((c, k) => { if (c.expr.t === "star") frame.cols.forEach((cc) => { o[cc] = frame.rows[r][cc]; }); else o[colName(c, k)] = val(c.expr, sel); }); out.push(o); }); pick(null);
          if (sel.distinct) { const seen = new Set(); out = out.filter((o) => { const k = JSON.stringify(o); if (seen.has(k)) return false; seen.add(k); return true; }); }
          snap(sel.ln.select, `남은 ${kept.length}행에서 ${sel.cols.map((c) => ex(c.expr)).join(", ")} 뽑기${sel.distinct ? " (중복 제거)" : ""} → ${out.length}행`);
        }
        if (sel.order) { out.sort((a, b) => { for (const o of sel.order) { const key = o.expr.t === "col" ? o.expr.name : o.expr.t === "num" ? Object.keys(a)[o.expr.v - 1] : ex(o.expr); const x = a[key], y = b[key]; if (x == y) continue; const c = x === null ? -1 : y === null ? 1 : x < y ? -1 : 1; return o.dir === "desc" ? -c : c; } return 0; }); snap(sel.ln.order, `정렬: ${sel.order.map((o) => ex(o.expr) + (o.dir === "desc" ? " 내림차순" : " 오름차순")).join(", ")}`); }
        if (sel.limit !== undefined) out = out.slice(0, sel.limit);
        // 묶음 지우고 가상 테이블을 바깥으로
        if (frame.sub) frame.sub.forEach((g) => { const idx = scope.indexOf(g); if (idx >= 0) scope.splice(idx, 1); });
        scope.pop();
        const label = depth ? `가상 테이블 (${why || "서브쿼리"}, ${sel.ln.select}행 SELECT)` : "최종 결과";
        results.push({ label, cols: out.length ? Object.keys(out[0]) : sel.cols.map(colName), rows: out, depth });
        snap(depth ? sel.ln.select : sel.ln.select, depth ? `${frame.alias} 묶음 지움 → 가상 테이블 ${out.length}행 (${out.map((r) => fmt(Object.values(r)[0])).join(", ") || "비어 있음"}) 을 바깥으로 올림` : `최종 결과 ${out.length}행`);
        if (depth) results.pop();    // 바깥으로 올린 뒤에는 판에서 지운다 (값은 바깥 식에 들어감)
        if (depth) (sel._memo = sel._memo || new Map()).set(key, out);
        return out;
      }
      let status = "ok", error = null, result = null;
      try { result = evalSelect(ast, ""); } catch (e) { if (e && e.truncated) status = "truncated"; else { status = "error"; error = e.message || String(e); } }
      return { lines, steps, status, error, result };
    },
    /* ---- 그리기 ---- */
    fmtCell: (v) => (v === null || v === undefined ? `<i class="unset">NULL</i>` : esc(typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(3))) : String(v))),
    frameHtml(f, top) {
      const rows = f.rows.map((r, i) => `<tr class="${f.cur === i ? "cur" : ""} ${f.marks[i] === "x" ? "x" : f.marks[i] === "o" ? "o" : ""}"><td class="m">${f.marks[i] === "o" ? "✓" : f.marks[i] === "x" ? "✗" : f.cur === i ? "▶" : ""}</td>${f.cols.map((c) => `<td>${this.fmtCell(r[c])}</td>`).join("")}</tr>`).join("");
      return `<div class="fg${top ? " top" : ""}"><div class="fg-h"><b>${esc(f.alias)}</b><span>${f.alias !== f.table ? esc(f.table) + " 을 이 이름으로 · " : ""}${f.rows.length}행${f.cur !== null ? ` · 지금 ${f.cur + 1}행` : ""}</span></div><table class="sqt"><tr><th></th>${f.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${rows}</table></div>`;
    },
    boardHtml(st) {
      const frames = st.scope.filter((f) => !f.hidden);
      const parts = frames.map((f, i) => this.frameHtml(f, i === frames.length - 1));
      st.results.forEach((r) => { parts.push(`<div class="fg res"><div class="fg-h"><b>${esc(r.label)}</b><span>${r.rows.length}행</span></div><table class="sqt"><tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${r.rows.map((row) => `<tr>${r.cols.map((c) => `<td>${this.fmtCell(row[c])}</td>`).join("")}</tr>`).join("")}</table></div>`); });
      return `<div class="hb">${parts.join("") || `<div class="empty">아직 등록된 테이블이 없습니다</div>`}</div>`;
    },
    mount(box, tables, sql) {
      let run; try { run = this.run(tables, sql); } catch (e) { box.innerHTML = `<div class="trace-note">쿼리를 읽지 못했어요: ${esc(e.message || String(e))}</div>`; return; }
      const { lines, steps } = run; if (!steps.length) { box.innerHTML = `<div class="trace-note">${esc(run.error || "단계가 없습니다")}</div>`; return; }
      let k = 0;
      box.innerHTML = `<div class="trace-h"><b>SQL 판</b><span class="hint">FROM → WHERE → SELECT 순서로, 테이블 묶음이 생기고 지워지는 대로</span><span class="trace-ctl"><button data-t="first">⏮</button><button data-t="prev">◀</button><span class="pos" id="sqlpos"></span><button data-t="next">▶</button><button data-t="last">⏭</button></span></div>
        <input type="range" id="sqlrange" min="0" max="${steps.length - 1}" value="0">
        <div class="trace-code" id="sqlcode">${lines.map((ln, i) => `<div class="ln" data-l="${i + 1}"><span class="g">${i + 1}</span><span class="src">${esc(ln)}</span></div>`).join("")}</div>
        <div class="trace-now" id="sqlnow"></div><div id="sqlboard"></div>
        <div class="trace-note">${run.status === "error" ? `중간에 멈춤: ${esc(run.error)}. ` : run.status === "truncated" ? "단계가 너무 많아 앞부분만 기록했습니다. " : ""}▶ 는 지금 집은 행, ✓/✗ 는 조건 검사 결과. 안쪽 묶음(서브쿼리)은 바깥 행이 바뀔 때마다 새로 생겼다 지워집니다. NULL 과의 비교는 거짓으로 칩니다.</div>`;
      const show = (n) => {
        k = Math.max(0, Math.min(steps.length - 1, n)); const st = steps[k];
        box.querySelector("#sqlpos").textContent = `${k + 1} / ${steps.length}`; box.querySelector("#sqlrange").value = String(k);
        box.querySelectorAll("#sqlcode .ln").forEach((el) => el.classList.toggle("cur", Number(el.dataset.l) === st.l));
        box.querySelector("#sqlnow").innerHTML = `<span class="ev">${st.l ? st.l + "행" : ""}</span>${esc(st.text)}`;
        box.querySelector("#sqlboard").innerHTML = this.boardHtml(st);
      };
      box.querySelectorAll(".trace-ctl button").forEach((b) => b.addEventListener("click", () => show({ first: 0, prev: k - 1, next: k + 1, last: steps.length - 1 }[b.dataset.t])));
      box.querySelector("#sqlrange").addEventListener("input", (e) => show(Number(e.target.value)));
      box._show = (d) => show(k + d); box.dataset.ready = "1";
      show(0);
    },
    SAMPLE_TABLES: "A\nid x\n1 10\n2 20\n3 30\n4 40\n\nB\nid y\n1 5\n1 15\n2 20\n3 35\n5 50",
    SAMPLE_SQL: "SELECT COUNT(*) AS RESULT FROM A\nWHERE x > (SELECT AVG(y) FROM B WHERE B.id IN (SELECT A2.id FROM A AS A2 WHERE A2.x < A.x));",
  };
  function renderSqlView() {
    const app = $("#app"); S.sql = S.sql || {};
    app.innerHTML = `<div class="sess-head"><h1>SQL 판</h1><span class="hint">표와 쿼리를 넣으면 실행 흐름을 한 단계씩</span></div>
      <div class="sql-in"><label>표 (이름 줄 · 머리글 줄 · 행들, 표 사이는 빈 줄)<textarea id="sqlTables" rows="9" spellcheck="false">${esc(S.sql.tables || Sql.SAMPLE_TABLES)}</textarea></label>
      <label>SQL<textarea id="sqlText" rows="5" spellcheck="false">${esc(S.sql.sql || Sql.SAMPLE_SQL)}</textarea></label>
      <div class="acts"><button class="btn primary" id="sqlRun">추적</button><button class="btn ghost" id="sqlSample">예제로 되돌리기</button><span class="hint">지원: SELECT·WHERE·AND/OR/NOT·IN·EXISTS·BETWEEN·LIKE·IS NULL·서브쿼리·COUNT/SUM/AVG/MAX/MIN·GROUP BY·HAVING·ORDER BY·JOIN</span></div></div>
      <div class="trace" id="sqlTrace"></div>`;
    const runIt = () => { S.sql.tables = $("#sqlTables").value; S.sql.sql = $("#sqlText").value; Store.save(); const t = Sql.parseTables(S.sql.tables); Sql.mount($("#sqlTrace"), t, S.sql.sql); };
    $("#sqlRun").addEventListener("click", runIt);
    $("#sqlSample").addEventListener("click", () => { $("#sqlTables").value = Sql.SAMPLE_TABLES; $("#sqlText").value = Sql.SAMPLE_SQL; runIt(); });
    runIt();
  }

