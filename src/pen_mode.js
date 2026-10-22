  /* ================= 펜 모드 (애플펜슬 손풀이) =================
     문제 카드 위에 투명 SVG 를 얹는다. 펜슬(pointerType "pen")과 마우스는 그리고, 손가락은 스크롤·탭(버튼 누르기)으로 쓴다.
     획은 문항별로 저장하고, 좌표는 카드 너비에 대한 비율로 적어 두어 창 크기가 달라져도 같은 자리에 그린다. */
  const INK_KEY = "cbtdesk.ink.v1";
  const Ink = {
    data: (() => { try { return JSON.parse(localStorage.getItem(INK_KEY) || "{}"); } catch (e) { return {}; } })(),
    COLORS: { ink: "var(--ink-ink)", orange: "#e07b00", blue: "#2563eb", red: "#d93025", hl: "#ffd54f" },
    qid: null, box: null, svg: null, hist: [], redo: [],
    save() {
      Object.keys(this.data).forEach((k) => { const r = this.data[k]; if (r && !r.s.length && !r.pad) delete this.data[k]; });   // 빈 기록은 버린다
      try { localStorage.setItem(INK_KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    cfg() { return (S.pen = S.pen || { on: false, tool: "pen", color: "ink", width: 2.2, finger: false, wide: false }); },
    rec() { return this.data[this.qid] || (this.data[this.qid] = { pad: 0, s: [] }); },
    W() { return this.box ? this.box.clientWidth || 1 : 1; },
    // 획 → SVG 경로. 저장된 좌표(너비 비율)에 지금 너비를 곱한다
    d(st) {
      const w = this.W(), p = st.p; if (p.length < 2) return "";
      let d = `M${(p[0] * w).toFixed(1)} ${(p[1] * w).toFixed(1)}`;
      if (p.length === 2) return d + ` l0.1 0`;
      for (let i = 2; i < p.length; i += 2) d += ` L${(p[i] * w).toFixed(1)} ${(p[i + 1] * w).toFixed(1)}`;
      return d;
    },
    pathEl(st) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", this.d(st)); el.setAttribute("stroke", this.COLORS[st.c] || st.c); el.setAttribute("stroke-width", st.w);
      if (st.t === "hl") el.setAttribute("class", "hl");
      return el;
    },
    redraw() { if (!this.svg) return; this.svg.innerHTML = ""; this.rec().s.forEach((st) => this.svg.appendChild(this.pathEl(st))); },
    // 문제 카드가 새로 그려질 때마다 덧씌운다
    mount(qid) {
      const paper = $("#paper"); if (!paper) return;
      this.qid = qid; const rec = this.rec(), cfg = this.cfg();
      paper.querySelectorAll(".ink, .ink-pad").forEach((e) => e.remove());
      const pad = document.createElement("div"); pad.className = "ink-pad";
      const padPx = cfg.on ? Math.max(280, rec.pad) : rec.pad;
      if (padPx) { pad.style.height = padPx + "px"; if (cfg.on) pad.innerHTML = `<span>필기 공간</span>`; }
      paper.appendChild(pad);
      const box = document.createElement("div"); box.className = "ink" + (cfg.on ? " on" : "") + (cfg.on && cfg.tool === "erase" ? " erase" : "");
      box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`; paper.appendChild(box);
      this.box = box; this.svg = box.firstElementChild; this.hist = []; this.redo = [];
      this.redraw(); this.bind(box); this.syncBar();
    },
    push() { this.hist.push(JSON.stringify(this.rec().s)); if (this.hist.length > 80) this.hist.shift(); this.redo = []; },
    undo() { if (!this.hist.length) return; this.redo.push(JSON.stringify(this.rec().s)); this.rec().s = JSON.parse(this.hist.pop()); this.redraw(); this.save(); this.syncBar(); },
    redoFn() { if (!this.redo.length) return; this.hist.push(JSON.stringify(this.rec().s)); this.rec().s = JSON.parse(this.redo.pop()); this.redraw(); this.save(); this.syncBar(); },
    clear() { if (!this.rec().s.length) return; this.push(); this.rec().s = []; this.redraw(); this.save(); this.syncBar(); },
    // 지우개: 닿은 획을 통째로 지운다 (흥달쌤이 지우개로 쓱 지우듯)
    eraseAt(x, y) {
      const w = this.W(), r2 = 14 * 14, s = this.rec().s; let hit = false;
      const segDist2 = (ax, ay, bx, by) => {   // 점(x,y)에서 선분 ab 까지 거리의 제곱
        const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
        const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2)) : 0;
        const dx = ax + t * vx - x, dy = ay + t * vy - y; return dx * dx + dy * dy;
      };
      for (let i = s.length - 1; i >= 0; i--) {
        const p = s[i].p; let near = false;
        if (p.length === 2) near = segDist2(p[0] * w, p[1] * w, p[0] * w, p[1] * w) < r2;
        for (let k = 2; k < p.length && !near; k += 2) near = segDist2(p[k - 2] * w, p[k - 1] * w, p[k] * w, p[k + 1] * w) < r2;
        if (near) { s.splice(i, 1); hit = true; }
      }
      if (hit) this.redraw();
      return hit;
    },
    // 손가락 탭은 아래에 있는 버튼·입력칸으로 넘긴다
    tapThrough(x, y) {
      this.box.style.pointerEvents = "none"; const el = document.elementFromPoint(x, y); this.box.style.pointerEvents = "";
      const t = el && el.closest("button, a, input, textarea, select, label, summary"); if (!t) return;
      if (t.matches("input, textarea, select")) t.focus(); else t.click();
    },
    bind(box) {
      let drawing = null, scroll = null;
      const pos = (ev) => { const r = box.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
      box.addEventListener("pointerdown", (e) => {
        const cfg = this.cfg(); if (!cfg.on) return;
        const draws = e.pointerType === "pen" || e.pointerType === "mouse" || (e.pointerType === "touch" && cfg.finger);
        if (draws) {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (drawing) return;
          e.preventDefault(); try { box.setPointerCapture(e.pointerId); } catch (err) {}
          const [x, y] = pos(e);
          if (cfg.tool === "erase") { this.push(); drawing = { id: e.pointerId, erase: true, hit: this.eraseAt(x, y) }; return; }
          const st = { t: cfg.tool, c: cfg.tool === "hl" ? "hl" : cfg.color, w: cfg.tool === "hl" ? cfg.width * 7 : cfg.width, p: [x / this.W(), y / this.W()] };
          const path = this.pathEl(st); this.svg.appendChild(path);
          drawing = { id: e.pointerId, st, path, last: [x, y], mouse: e.pointerType === "mouse", t0: Date.now(), cx: e.clientX, cy: e.clientY };
        } else if (e.pointerType === "touch" && !drawing) {
          try { box.setPointerCapture(e.pointerId); } catch (err) {}
          scroll = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: Date.now(), moved: false };
        }
      });
      box.addEventListener("pointermove", (e) => {
        if (drawing && e.pointerId === drawing.id) {
          const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs.push(e);
          for (const ev of evs) {
            const [x, y] = pos(ev);
            if (drawing.erase) { if (this.eraseAt(x, y)) drawing.hit = true; continue; }
            const [lx, ly] = drawing.last; if (Math.hypot(x - lx, y - ly) < 1.2) continue;
            drawing.st.p.push(x / this.W(), y / this.W()); drawing.last = [x, y];
          }
          if (!drawing.erase) drawing.path.setAttribute("d", this.d(drawing.st));
        } else if (scroll && e.pointerId === scroll.id) {
          const dx = e.clientX - scroll.x, dy = e.clientY - scroll.y; scroll.x = e.clientX; scroll.y = e.clientY;
          if (Math.hypot(e.clientX - scroll.sx, e.clientY - scroll.sy) > 8) scroll.moved = true;
          if (scroll.moved) window.scrollBy(-dx, -dy);
        }
      });
      const end = (e) => {
        if (drawing && e.pointerId === drawing.id) {
          if (drawing.erase) { if (!drawing.hit) this.hist.pop(); else this.save(); }
          else if (drawing.mouse && drawing.st.p.length <= 4 && Date.now() - drawing.t0 < 300) { drawing.path.remove(); this.tapThrough(drawing.cx, drawing.cy); }   // 마우스 '클릭'은 그리지 않고 아래 버튼으로 넘긴다
          else { this.push(); this.rec().s.push(drawing.st); this.save(); }
          drawing = null; this.syncBar();
        } else if (scroll && e.pointerId === scroll.id) {
          if (!scroll.moved && Date.now() - scroll.t < 500) this.tapThrough(e.clientX, e.clientY);
          scroll = null;
        }
      };
      box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
    },
    // 툴바
    barHtml() {
      const c = this.cfg();
      return `<button data-tool="pen" class="${c.tool === "pen" ? "on" : ""}">✎ 펜</button><button data-tool="hl" class="${c.tool === "hl" ? "on" : ""}">▬ 형광</button><button data-tool="erase" class="${c.tool === "erase" ? "on" : ""}">◫ 지우개</button><span class="sep"></span>
        ${["ink", "orange", "blue", "red"].map((k) => `<button class="sw c-${k} ${c.color === k ? "on" : ""}" data-color="${k}" title="${{ ink: "기본", orange: "주황", blue: "파랑", red: "빨강" }[k]}"></button>`).join("")}<span class="sep"></span>
        ${[[1.4, 6], [2.2, 9], [3.6, 13]].map(([w, px]) => `<button data-width="${w}" class="${Math.abs(c.width - w) < .01 ? "on" : ""}" title="굵기"><i class="wd" style="width:${px}px;height:${px}px"></i></button>`).join("")}<span class="sep"></span>
        <button data-act="undo" title="되돌리기">↶</button><button data-act="redo" title="다시 실행">↷</button><button data-act="clear">모두 지우기</button><span class="sep"></span>
        <button data-act="pad">여백 +</button><button data-act="finger" class="${c.finger ? "on" : ""}" title="손가락으로도 그리기 (끄면 손가락은 스크롤·탭)">손가락 쓰기</button><button data-act="wide" class="${c.wide ? "on" : ""}" title="해설 패널을 숨겨 카드를 넓게">넓게</button><span class="sep"></span>
        <button data-act="off">✕ 펜 끄기</button>`;
    },
    syncBar() {
      const bar = $("#penbar"); if (!bar) return;
      const c = this.cfg(); bar.classList.toggle("show", !!c.on); if (!c.on) return;
      bar.innerHTML = this.barHtml();
      bar.querySelector('[data-act="undo"]').disabled = !this.hist.length; bar.querySelector('[data-act="redo"]').disabled = !this.redo.length;
      const pb = $("#penBtn"); if (pb) pb.classList.toggle("on", !!c.on);
    },
    toggle(on) {
      const c = this.cfg(); c.on = on === undefined ? !c.on : on; Store.save();
      document.body.classList.toggle("penmode", c.on); document.body.classList.toggle("penwide", c.on && c.wide);
      const pb = $("#penBtn"); if (pb) pb.classList.toggle("on", c.on);
      if (this.qid) this.mount(this.qid); else this.syncBar();
    },
    act(b) {
      const c = this.cfg();
      if (b.dataset.tool) { c.tool = b.dataset.tool; if (this.box) this.box.classList.toggle("erase", c.tool === "erase"); }
      else if (b.dataset.color) { c.color = b.dataset.color; if (c.tool === "erase") c.tool = "pen"; }
      else if (b.dataset.width) { c.width = Number(b.dataset.width); if (c.tool === "erase") c.tool = "pen"; }
      else if (b.dataset.act === "undo") return this.undo();
      else if (b.dataset.act === "redo") return this.redoFn();
      else if (b.dataset.act === "clear") return this.clear();
      else if (b.dataset.act === "pad") { const r = this.rec(); r.pad = Math.max(280, r.pad) + 240; this.save(); const pad = $("#paper .ink-pad"); if (pad) pad.style.height = r.pad + "px"; return; }
      else if (b.dataset.act === "finger") c.finger = !c.finger;
      else if (b.dataset.act === "wide") { c.wide = !c.wide; document.body.classList.toggle("penwide", c.wide); }
      else if (b.dataset.act === "off") { this.toggle(false); return; }
      Store.save(); this.syncBar();
    },
  };
  document.addEventListener("click", (e) => { const b = e.target.closest("#penbar button"); if (b) { e.preventDefault(); Ink.act(b); } });
  document.addEventListener("click", (e) => { if (e.target.closest("#penBtn")) Ink.toggle(); });
  window.addEventListener("resize", () => { clearTimeout(Ink._rt); Ink._rt = setTimeout(() => Ink.redraw(), 120); });

