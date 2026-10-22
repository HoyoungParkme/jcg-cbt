  /* ================= 계산 문제 풀이 판 (흥달쌤 방식) =================
     페이지 교체·프로세스 스케줄링·디스크 스케줄링·서브넷·chmod·LOC 문제를 찾아, 문제에서 숫자를 읽어 들이고
     흥달쌤이 칠판에 쓰는 모양(칸 선 없는 표, 참조열 위 + 프레임 아래, 순서열 + 실행 길이, 자릿값 줄 + 비트 줄, 장제법)으로 푼다.
     읽어 들인 값은 고칠 수 있어서 "값을 바꿔 다시 풀기"도 된다. */
  const Calc = {
    plain(q) { return (q.q || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/[ \t]+/g, " "); },
    detect(q) {
      const t = this.plain(q), one = t.replace(/\s+/g, " ");
      if (/(페이지\s*(교체|참조|순서|결함|부재)|FIFO|LRU|LFU|\bOPT\b)/i.test(one) && /(프레임|보관\s*구조|페이지를\s*수용|참조)/.test(one) && /(횟수|최종|상태|몇\s*번|구하)/.test(one)) return "page";
      if (/(스케줄링|FCFS|SJF|SRT|HRN|라운드\s*로빈|\bRR\b)/.test(one) && /(도착|서비스|실행|버스트|burst|arrival|작업\s*순서|처리되는|평균)/i.test(one) && !/(설명으로|설명이|명칭|아닌\s*것|계산식을\s*쓰)/.test(one)) return "sched";
      if (/(디스크|SSTF|SCAN|LOOK)/.test(one) && /(헤드|트랙)/.test(one) && !/(설명|아닌\s*것)/.test(one)) return "disk";
      if (/(서브넷|subnet|FLSM|VLSM|네트워크\s*주소|브로드캐스트|호스트\s*(수|개수)|CIDR)/i.test(one) && /\d+\.\d+\.\d+\.\d+/.test(one)) return "subnet";
      if (/(chmod|umask|권한.*(8진|명령어)|rwx|r-x|--x)/i.test(one)) return "chmod";
      if (/\bLOC\b|라인\s*수|라인수/.test(one) && /(생산성|개발자|프로그래머|인당|명)/.test(one) && /\d{3,}/.test(one)) return "loc";
      return null;
    },
    /* ---- 문제에서 값 읽기 ---- */
    parse(type, q) {
      const t = this.plain(q), one = t.replace(/\s+/g, " ");
      const nums = (s) => (s.match(/\d+/g) || []).map(Number);
      if (type === "page") {
        let seq = null; const m = /(참조\s*(순서|열|스트링)|페이지\s*순서|참조가\s*발생)[^0-9]{0,40}([\d\s,]+(?:\d))/.exec(one);
        if (m) seq = nums(m[3]); else { const runs = one.match(/(?:\d+\s*,\s*){4,}\d+/g); if (runs) seq = nums(runs.sort((a, b) => b.length - a.length)[0]); }
        if (!seq || seq.length < 4) { const sp = one.match(/(?:\b\d\s+){5,}\d\b/); if (sp) seq = nums(sp[0]); }
        const fm = /(\d+)\s*개의?\s*(페이지\s*)?(프레임|보관|페이지를\s*수용)|(프레임|보관\s*구조)(\s*수|\s*개수)?[가는은이]?\s*(\d+)\s*(개|이)/.exec(one);
        const frames = fm ? Number(fm[1] || fm[6]) : 3;
        const algos = []; [["FIFO", /FIFO|선입\s*선출/i], ["LRU", /LRU/i], ["LFU", /LFU/i], ["OPT", /\bOPT\b|최적/i]].forEach(([k, re]) => { if (re.test(one)) algos.push(k); });
        return { seq: (seq || []).join(" "), frames, algos: algos.length ? algos : ["FIFO"] };
      }
      if (type === "sched") {
        const rows = []; const re = /\b([A-Za-z]\w{0,3})\s+(\d+)\s+(\d+)(?:\s+(\d+))?(?=\s|$)/g; let m;
        const body = one.replace(/.*?(보기|자료|표)/, "");
        while ((m = re.exec(body))) { if (/^(ms|RR|CPU|SRT|SJF|HRN|FCFS)$/i.test(m[1])) continue; rows.push([m[1], Number(m[2]), Number(m[3])]); }
        const algo = /SRT|잔여|remaining/i.test(one) ? "SRT" : /SJF|짧은\s*작업/i.test(one) ? "SJF" : /HRN/i.test(one) ? "HRN" : /라운드|\bRR\b|퀀텀|quantum/i.test(one) ? "RR" : "FCFS";
        const qm = /(퀀텀|quantum|시간\s*할당량|time\s*slice)[^0-9]{0,12}(\d+)/i.exec(one);
        return { procs: rows.map((r) => r.join(" ")).join("\n"), algo, quantum: qm ? Number(qm[2]) : 4 };
      }
      if (type === "disk") {
        const hm = /헤드\s*(위치|의\s*위치)?[^0-9]{0,12}(\d+)/.exec(one); const head = hm ? Number(hm[2]) : 53;
        let queue = []; const qm = /(큐|요청|순서)[^0-9]{0,30}((?:\d+\s*[,\s]\s*){3,}\d+)/.exec(one); if (qm) queue = nums(qm[2]).filter((n) => n !== head);
        if (!queue.length && q.choices) { const ch = q.choices.map((c) => String(c).replace(/<[^>]+>/g, "")).find((c) => /^\s*\d+(\s*[-→,]\s*\d+){4,}/.test(c)); if (ch) queue = nums(ch).filter((n) => n !== head); }
        const dir = /(바깥|증가|큰\s*번호|오른쪽)/.test(one) ? "up" : /(안쪽|감소|작은\s*번호|왼쪽|0번)/.test(one) ? "down" : "up";
        const rm = /(\d+)\s*번\s*트랙|트랙[^0-9]{0,8}(\d+)/g; let max = 199, mm; while ((mm = rm.exec(one))) max = Math.max(max, Number(mm[1] || mm[2]));
        const algo = /SSTF/i.test(one) ? "SSTF" : /C-?SCAN/i.test(one) ? "C-SCAN" : /C-?LOOK/i.test(one) ? "C-LOOK" : /LOOK/i.test(one) ? "LOOK" : /SCAN/i.test(one) ? "SCAN" : "FCFS";
        return { queue: queue.join(" "), head, dir, max, algo };
      }
      if (type === "subnet") {
        const ips = one.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?/g) || [];
        const masks = ips.filter((x) => /^255\./.test(x)); const hosts = ips.filter((x) => !/^255\./.test(x));
        let ip = hosts[0] || "", mask = masks[0] || "";
        if (!mask && ip.includes("/")) { mask = "/" + ip.split("/")[1]; ip = ip.split("/")[0]; }
        const fm = /(\d+)\s*개의?\s*서브넷|서브넷\s*(\d+)\s*개|(\d+)\s*개로\s*(균등\s*)?분할|(\d+)\s*개\s*(의\s*)?(네트워크|서브넷)/.exec(one);
        return { ip: ip.replace(/\/\d+$/, ""), mask, split: fm ? Number(fm[1] || fm[2] || fm[3] || fm[5]) : 0 };
      }
      if (type === "chmod") {
        const um = /umask[^0-9]{0,10}(\d{3,4})/i.exec(one); const pm = /(\d{3})\s*(일|인)\s*경우|권한이\s*(\d{3})/.exec(one);
        const rw = { o: "", g: "", a: "" }; [["o", /(사용자|소유자|owner)[^)]*?([rwx-]{3})/i], ["g", /(그룹|group)[^)]*?([rwx-]{3})/i], ["a", /(기타|other)[^)]*?([rwx-]{3})/i]].forEach(([k, re]) => { const m = re.exec(one); if (m) rw[k] = m[2]; });
        return { owner: rw.o || "rwx", group: rw.g || "r-x", other: rw.a || "--x", umask: um ? um[1] : "", given: pm ? (pm[1] || pm[3]) : "" };
      }
      if (type === "loc") {
        const num = (re) => { const m = re.exec(one); return m ? Number(m[1].replace(/,/g, "")) : ""; };
        return { lines: num(/([\d,]{4,})\s*(라인|LOC|line)/i) || num(/(?:라인\s*수|LOC)[^0-9]{0,20}([\d,]{4,})/i), people: num(/(\d+)\s*(명|인)/), rate: num(/(?:생산성|인당|월\s*평균|월간)[^0-9]{0,20}([\d,]+)\s*라인/) || num(/([\d,]+)\s*라인\s*(\/|per|씩)?\s*(월|개월|달)/) };
      }
      return {};
    },
    /* ---- 풀이 ---- */
    solvePage(seq, frames, algo) {
      const cols = [], steps = []; let mem = []; let faults = 0; const last = {}, cnt = {}, order = [];
      seq.forEach((p, i) => {
        const before = mem.slice(); let fault = !mem.includes(p), out = null; let why = "";
        if (!fault) { why = `${i + 1}번째 참조 ${p}: 프레임에 있음 → 적중(X)`; }
        else if (mem.length < frames) { mem.push(p); why = `${i + 1}번째 참조 ${p}: 없음 → 부재(O), 빈 프레임 ${mem.length}에 넣음 → [${mem.join(", ")}]`; }
        else {
          let victim, reason;
          if (algo === "FIFO") { victim = order[0]; reason = `가장 먼저 들어온 것 (큐 ${order.join(" ")}) = ${victim}`; order.shift(); }
          else if (algo === "LRU") { victim = mem.reduce((a, b) => (last[a] < last[b] ? a : b)); reason = `마지막 사용 시점 ${mem.map((x) => `${x}→${last[x] + 1}번째`).join(", ")} → 가장 오래 안 쓴 ${victim}`; }
          else if (algo === "LFU") { victim = mem.reduce((a, b) => (cnt[a] < cnt[b] || (cnt[a] === cnt[b] && last[a] < last[b]) ? a : b)); reason = `사용 횟수 ${mem.map((x) => `${x}→${cnt[x]}회`).join(", ")} → 가장 적게 쓴 ${victim}${mem.filter((x) => cnt[x] === cnt[victim]).length > 1 ? " (같으면 더 오래 안 쓴 것)" : ""}`; }
          else { const nxt = (x) => { const j = seq.indexOf(x, i + 1); return j < 0 ? Infinity : j; }; victim = mem.reduce((a, b) => (nxt(a) > nxt(b) ? a : b)); reason = `다음 사용 ${mem.map((x) => `${x}→${nxt(x) === Infinity ? "안 씀" : nxt(x) + 1 + "번째"}`).join(", ")} → 가장 늦게 쓸 ${victim}`; }
          out = victim; mem[mem.indexOf(victim)] = p;
          why = `${i + 1}번째 참조 ${p}: 없음 → 부재(O). ${reason} 내보내고 ${p} 넣음 → [${mem.join(", ")}]`;
        }
        if (fault) { if (algo === "FIFO") order.push(p); faults++; }
        last[p] = i; cnt[p] = (cnt[p] || 0) + 1;
        cols.push({ p, mem: mem.slice(), fault, out, before, cnt: { ...cnt } }); steps.push(why);
      });
      return { cols, steps, faults, hits: seq.length - faults, final: mem.slice() };
    },
    solveSched(procs, algo, quantum) {
      const P = procs.map((r, i) => ({ n: r[0], at: r[1], bt: r[2], pr: r[3], i, rem: r[2], done: null }));
      const seg = []; let t = 0, left = P.length; const push = (n, s, e) => { const l = seg[seg.length - 1]; if (l && l.n === n && l.e === s) l.e = e; else seg.push({ n, s, e }); };
      const notes = []; const step = (x) => notes.push(x);
      if (algo === "RR") {
        const q = Math.max(1, quantum || 1); const queue = []; const arrived = new Set(); const addArrivals = (until) => { P.filter((p) => p.at <= until && !arrived.has(p.n)).sort((a, b) => a.at - b.at || a.i - b.i).forEach((p) => { arrived.add(p.n); queue.push(p); }); };
        addArrivals(t); if (!queue.length && left) { t = Math.min(...P.map((p) => p.at)); addArrivals(t); }
        while (left) {
          if (!queue.length) { const nt = Math.min(...P.filter((p) => !arrived.has(p.n)).map((p) => p.at)); step(`t=${t}: 큐가 비어 있음 → t=${nt} 까지 기다림`); t = nt; addArrivals(t); continue; }
          const p = queue.shift(); const run = Math.min(q, p.rem); const s0 = t;
          push(p.n, t, t + run); t += run; p.rem -= run;
          const newly = P.filter((x) => x.at > s0 && x.at <= t).map((x) => x.n);
          addArrivals(t);
          if (p.rem > 0) queue.push(p); else { p.done = t; left--; }
          step(`t=${s0}: 큐 맨 앞 ${p.n} 꺼내 ${run} 실행 (${s0}~${t})${p.rem > 0 ? `, 남은 ${p.rem} → 큐 뒤에 다시 넣음` : ` → 끝 (완료 ${t})`}${newly.length ? ` · 그 사이 도착 ${newly.join(", ")} 이 먼저 큐에 들어감` : ""} → 큐 [${queue.map((x) => x.n).join(" ") || "비어 있음"}]`);
        }
      } else if (algo === "SRT") {
        let running = null;
        while (left) {
          const ready = P.filter((p) => p.at <= t && p.rem > 0);
          if (!ready.length) { const nt = Math.min(...P.filter((p) => p.rem > 0).map((p) => p.at)); step(`t=${t}: 준비된 프로세스 없음 → t=${nt} 까지 기다림`); t = nt; continue; }
          const p = ready.reduce((a, b) => (a.rem < b.rem || (a.rem === b.rem && (a.at < b.at || (a.at === b.at && a.i < b.i))) ? a : b));
          const arrivedNow = P.filter((x) => x.at === t).map((x) => x.n);
          if (p !== running || arrivedNow.length) step(`t=${t}: ${arrivedNow.length ? `${arrivedNow.join(", ")} 도착. ` : ""}남은 시간 ${ready.map((x) => `${x.n}(${x.rem})`).join(" ")} → 가장 짧은 <b>${p.n}</b>${running && p !== running && running.rem > 0 ? ` (${running.n} 은 선점당함)` : ""}`);
          running = p; push(p.n, t, t + 1); t += 1; p.rem -= 1;
          if (p.rem === 0) { p.done = t; left--; step(`t=${t}: ${p.n} 끝 (완료 ${t})`); running = null; }
        }
      } else {   // FCFS · SJF · HRN · 우선순위 (비선점)
        while (left) {
          const ready = P.filter((p) => p.at <= t && p.done === null);
          if (!ready.length) { t = Math.min(...P.filter((p) => p.done === null).map((p) => p.at)); continue; }
          let p, reason;
          if (algo === "SJF") { p = ready.reduce((a, b) => (a.bt < b.bt || (a.bt === b.bt && a.at <= b.at) ? a : b)); reason = `실행 시간 ${ready.map((x) => `${x.n}(${x.bt})`).join(" ")} → 가장 짧은 ${p.n}`; }
          else if (algo === "HRN") { ready.forEach((x) => { x.hrn = (t - x.at + x.bt) / x.bt; }); p = ready.reduce((a, b) => (a.hrn >= b.hrn ? a : b)); reason = `우선순위 (대기+실행)/실행: ` + ready.map((x) => `${x.n} (${t - x.at}+${x.bt})/${x.bt} = ${+x.hrn.toFixed(2)}`).join(", ") + ` → 가장 큰 ${p.n}`; }
          else if (algo === "PRI") { p = ready.reduce((a, b) => ((a.pr ?? 0) <= (b.pr ?? 0) ? a : b)); reason = `우선순위 ${ready.map((x) => `${x.n}(${x.pr ?? "?"})`).join(" ")} → ${p.n}`; }
          else { p = ready.reduce((a, b) => (a.at < b.at || (a.at === b.at && a.i < b.i) ? a : b)); reason = `도착 순서 ${ready.map((x) => `${x.n}(${x.at})`).join(" ")} → 먼저 온 ${p.n}`; }
          step(`t=${t}: 준비 큐 {${ready.map((x) => x.n).join(", ")}}. ${reason} → ${t}~${t + p.bt} 실행, 완료 ${t + p.bt}`);
          push(p.n, t, t + p.bt); t += p.bt; p.done = t; left--;
        }
      }
      P.forEach((p) => { p.tat = p.done - p.at; p.wt = p.tat - p.bt; });
      const sumW = P.reduce((a, p) => a + p.wt, 0), sumT = P.reduce((a, p) => a + p.tat, 0);
      const calc = P.map((p) => `${p.n}: 반환 = 완료 ${p.done} − 도착 ${p.at} = ${p.tat}, 대기 = 반환 ${p.tat} − 실행 ${p.bt} = ${p.wt}`);
      return { P, seg, notes, calc, sumW, sumT, avgW: sumW / P.length, avgT: sumT / P.length };
    },
    solveDisk(queue, head, dir, max, algo) {
      const hops = [], steps = []; let pos = head, q = queue.slice(); let acc = 0;
      const go = (x, why) => { const d = Math.abs(x - pos); acc += d; hops.push({ to: x, d }); steps.push(`${pos} → ${x}: ${why ? why + ", " : ""}거리 |${x} − ${pos}| = ${d} (누적 ${acc})`); pos = x; };
      const jump = (x, why) => { const d = Math.abs(x - pos); acc += d; hops.push({ to: x, d, jump: true }); steps.push(`${pos} → ${x}: ${why}, 거리 ${d} (누적 ${acc})`); pos = x; };
      const dirName = dir === "up" ? "바깥쪽(큰 번호)" : "안쪽(작은 번호)";
      if (algo === "FCFS") { steps.push("큐에 들어온 순서 그대로 처리"); q.forEach((x) => go(x, "큐 순서")); }
      else if (algo === "SSTF") { steps.push("매번 현재 위치에서 가장 가까운 요청을 고른다"); while (q.length) { const x = q.reduce((a, b) => (Math.abs(a - pos) <= Math.abs(b - pos) ? a : b)); const cand = q.slice().sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos)).slice(0, 3).map((c) => `${c}(${Math.abs(c - pos)})`).join(" "); q.splice(q.indexOf(x), 1); go(x, `가까운 순 ${cand}${q.length + 1 > 3 ? " …" : ""} → ${x}`); } }
      else {
        const asc = q.slice().sort((a, b) => a - b), up = asc.filter((x) => x >= pos), down = asc.filter((x) => x < pos).reverse();
        steps.push(`요청을 정렬: ${asc.join(" ")} · 헤드 ${pos}, 처음 방향 ${dirName}`);
        const sweepUp = () => up.forEach((x) => go(x, "같은 방향 다음 요청")), sweepDown = () => down.forEach((x) => go(x, "같은 방향 다음 요청"));
        if (algo === "SCAN") { if (dir === "up") { sweepUp(); if (down.length) { go(max, "SCAN 은 끝 트랙까지 간 뒤 방향을 바꿈"); sweepDown(); } } else { sweepDown(); if (up.length) { go(0, "SCAN 은 끝 트랙까지 간 뒤 방향을 바꿈"); sweepUp(); } } }
        else if (algo === "LOOK") { if (dir === "up") { sweepUp(); if (down.length) { steps.push("LOOK 은 마지막 요청에서 바로 방향을 바꿈"); sweepDown(); } } else { sweepDown(); if (up.length) { steps.push("LOOK 은 마지막 요청에서 바로 방향을 바꿈"); sweepUp(); } } }
        else if (algo === "C-SCAN") { if (dir === "up") { sweepUp(); if (down.length) { go(max, "끝 트랙까지"); jump(0, "C-SCAN 은 반대쪽 끝으로 점프(거리를 세는 문제도 있음)"); down.reverse().forEach((x) => go(x, "같은 방향으로 다시")); } } else { sweepDown(); if (up.length) { go(0, "끝 트랙까지"); jump(max, "C-SCAN 은 반대쪽 끝으로 점프"); up.reverse().forEach((x) => go(x, "같은 방향으로 다시")); } } }
        else { if (dir === "up") { sweepUp(); if (down.length) { const first = down[down.length - 1]; jump(first, "C-LOOK 은 반대쪽 끝 요청으로 점프"); down.reverse().slice(1).forEach((x) => go(x, "같은 방향으로 다시")); } } else { sweepDown(); if (up.length) { const first = up[up.length - 1]; jump(first, "C-LOOK 은 반대쪽 끝 요청으로 점프"); up.reverse().slice(1).forEach((x) => go(x, "같은 방향으로 다시")); } } }
      }
      return { hops, steps, total: hops.reduce((a, h) => a + h.d, 0) };
    },
    ip2n: (s) => s.split(".").map(Number).reduce((a, b) => a * 256 + b, 0),
    n2ip: (n) => [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join("."),
    maskBits(mask) { if (/^\/?\d{1,2}$/.test(mask)) return Number(mask.replace("/", "")); const n = this.ip2n(mask); let b = 0; for (let i = 31; i >= 0 && (n >>> i) & 1; i--) b++; return b; },
    solveSubnet(ip, mask, split) {
      const bits = this.maskBits(mask); const n = this.ip2n(ip); const hostBits = 32 - bits;
      const maskN = bits === 0 ? 0 : (~0 << hostBits) >>> 0; const net = (n & maskN) >>> 0, bc = (net | (~maskN >>> 0)) >>> 0;
      const octet = Math.min(3, Math.floor(bits / 8)); const bitsInOctet = bits - octet * 8;   // 경계가 있는 옥텟과 그 안의 서브넷 비트 수
      const block = Math.pow(2, 8 - bitsInOctet);
      const ranges = []; for (let s = 0; s < 256; s += block) ranges.push({ sub: (s / block).toString(2).padStart(bitsInOctet, "0"), from: s, to: s + block - 1 });
      const ipOct = ip.split(".").map(Number)[octet];
      const r = { bits, hostBits, maskStr: this.n2ip(maskN), net: this.n2ip(net), bc: this.n2ip(bc), first: this.n2ip(net + 1), last: this.n2ip(bc - 1), hosts: Math.pow(2, hostBits) - 2, octet, bitsInOctet, block, ranges, ipOct };
      if (split > 1) { const sb = Math.ceil(Math.log2(split)); const nb = bits + sb; const size = Math.pow(2, 32 - nb); r.split = { count: split, sb, nb, size, subs: Array.from({ length: Math.pow(2, sb) }, (_, i) => ({ net: this.n2ip(net + i * size), bc: this.n2ip(net + i * size + size - 1), first: this.n2ip(net + i * size + 1), last: this.n2ip(net + i * size + size - 2) })) }; }
      return r;
    },
    /* ---- 그리기 ---- */
    cell: (x, cls) => `<td class="${cls || ""}">${esc(x)}</td>`,
    renderPage(v) {
      const seq = (v.seq.match(/\d+/g) || []).map(Number); if (seq.length < 2) return `<div class="hint">참조열을 입력하세요 (예: 1 2 3 1 2 4)</div>`;
      return v.algos.map((algo) => {
        const r = this.solvePage(seq, Number(v.frames) || 3, algo);
        const rows = []; for (let f = 0; f < (Number(v.frames) || 3); f++) rows.push(r.cols.map((c, i) => { const cur = c.mem[f], prev = i ? r.cols[i - 1].mem[f] : undefined; const changed = cur !== undefined && cur !== prev; return `<td class="${changed ? "chg" : ""}">${cur === undefined ? "" : changed && prev !== undefined ? `<s>${prev}</s>${cur}` : cur}</td>`; }).join(""));
        return `<div class="cb-sec"><h5>${algo}${algo === "FIFO" ? " (선입선출)" : algo === "LRU" ? " (가장 오래 안 쓴 것)" : algo === "LFU" ? " (가장 적게 쓴 것)" : " (앞으로 가장 늦게 쓸 것)"} · 프레임 ${v.frames}개</h5>
          <table class="cb-t page"><tr class="ref"><th>참조</th>${r.cols.map((c) => `<td>${c.p}</td>`).join("")}</tr>${rows.map((row, f) => `<tr><th>${f + 1}</th>${row}</tr>`).join("")}<tr class="fault"><th>부재</th>${r.cols.map((c) => `<td>${c.fault ? "O" : "X"}</td>`).join("")}</tr></table>
          <ol class="cb-steps">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <div class="cb-ans">부재(O) 세기: ${r.cols.map((c) => (c.fault ? "O" : "X")).join(" ")} → 부재 <b>${r.faults}</b>회 · 적중 ${r.hits}회 · 최종 프레임 [${r.final.join(", ")}]</div></div>`;
      }).join("");
    },
    renderSched(v) {
      const procs = v.procs.split("\n").map((l) => l.trim().split(/[\s,]+/)).filter((r) => r.length >= 3 && !isNaN(r[1]) && !isNaN(r[2])).map((r) => [r[0], Number(r[1]), Number(r[2]), r[3] !== undefined ? Number(r[3]) : undefined]);
      if (!procs.length) return `<div class="hint">프로세스를 한 줄에 하나씩 "이름 도착 실행" 으로 입력하세요</div>`;
      const r = this.solveSched(procs, v.algo, Number(v.quantum));
      const n = r.P.length; const div = (sum) => `<span class="ldiv">${n}<span class="dv">)${sum}</span> → <b>${+ (sum / n).toFixed(2)}</b></span>`;
      return `<div class="cb-sec"><h5>${v.algo}${v.algo === "RR" ? ` · 퀀텀 ${v.quantum}` : ""}</h5>
        <div class="cb-order"><div class="lbl">순서</div>${r.seg.map((s) => `<div class="seg"><b>${esc(s.n)}</b><span>${s.e - s.s}</span><i>${s.s}~${s.e}</i></div>`).join("")}</div>
        <ol class="cb-steps">${r.notes.map((x) => `<li>${x.replace(/<(?!\/?b>)[^>]*>/g, "")}</li>`).join("")}</ol>
        <table class="cb-t"><tr><th></th><th>도착</th><th>실행</th><th>완료</th><th>대기</th><th>반환</th>${v.algo === "HRN" ? "<th>우선순위</th>" : ""}</tr>
        ${r.P.map((p) => `<tr><th>${esc(p.n)}</th><td>${p.at}</td><td>${p.bt}</td><td>${p.done}</td><td class="k">${p.wt}</td><td>${p.tat}</td>${v.algo === "HRN" ? `<td>${p.hrn !== undefined ? +p.hrn.toFixed(2) : ""}</td>` : ""}</tr>`).join("")}
        <tr class="sum"><th>합</th><td></td><td></td><td></td><td>${r.sumW}</td><td>${r.sumT}</td>${v.algo === "HRN" ? "<td></td>" : ""}</tr></table>
        <ol class="cb-steps">${r.calc.map((x) => `<li>${esc(x)}</li>`).join("")}<li>대기 합 ${r.P.map((p) => p.wt).join(" + ")} = ${r.sumW}, 반환 합 ${r.P.map((p) => p.tat).join(" + ")} = ${r.sumT}</li></ol>
        <div class="cb-ans">평균 대기 ${div(r.sumW)} · 평균 반환 ${div(r.sumT)}<div class="hint">대기 = 완료 − 도착 − 실행 (도착 시간 빼는 것 잊지 말기), 반환 = 완료 − 도착</div></div></div>`;
    },
    renderDisk(v) {
      const queue = (v.queue.match(/\d+/g) || []).map(Number); if (!queue.length) return `<div class="hint">요청 큐를 입력하세요</div>`;
      const r = this.solveDisk(queue, Number(v.head), v.dir, Number(v.max), v.algo);
      return `<div class="cb-sec"><h5>${v.algo} · 헤드 ${v.head} · ${v.dir === "up" ? "바깥쪽(증가) 방향" : "안쪽(감소) 방향"}</h5>
        <div class="cb-order"><div class="seg head"><b>${v.head}</b><span>시작</span></div>${r.hops.map((h) => `<div class="seg ${h.jump ? "jump" : ""}"><b>${h.to}</b><span>${h.d}</span></div>`).join("")}</div>
        <ol class="cb-steps">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <div class="cb-ans">이동 거리 ${r.hops.map((h) => h.d).join(" + ")} = <b>${r.total}</b> · 처리 순서 ${r.hops.filter((h) => !h.jump || queue.includes(h.to)).map((h) => h.to).filter((x, i, a) => a.indexOf(x) === i).join(" → ")}</div></div>`;
    },
    renderSubnet(v) {
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(v.ip) || !v.mask) return `<div class="hint">IP 와 서브넷 마스크(255.255.255.192 또는 /26)를 입력하세요</div>`;
      const r = this.solveSubnet(v.ip, v.mask, Number(v.split) || 0);
      const weights = [128, 64, 32, 16, 8, 4, 2, 1]; const octBits = Array.from({ length: 8 }, (_, i) => (i < r.bitsInOctet ? 1 : 0));
      const ipBits = r.ipOct.toString(2).padStart(8, "0").split("").map(Number);
      const near = r.ranges.length > 8 ? r.ranges.filter((x) => Math.abs(x.from - Math.floor(r.ipOct / r.block) * r.block) <= r.block) : r.ranges;
      const maskBin = r.maskStr.split(".").map((o) => Number(o).toString(2).padStart(8, "0")).join(".");
      const ipBin = v.ip.split(".").map((o) => Number(o).toString(2).padStart(8, "0")).join(".");
      const pick = r.ranges.find((x) => r.ipOct >= x.from && x.to >= r.ipOct);
      const steps = [
        `마스크 ${r.maskStr} 를 2진수로: ${maskBin} → 1 이 ${r.bits}개 = /${r.bits} (네트워크 ${r.bits}비트, 호스트 ${r.hostBits}비트)`,
        `호스트 비트 ${r.hostBits}개 → 한 블록(서브넷)의 주소 수 2^${r.hostBits} = ${Math.pow(2, r.hostBits)}, 그중 네트워크·브로드캐스트 2개를 빼면 사용 가능 호스트 ${r.hosts}`,
        `경계가 있는 ${r.octet + 1}번째 옥텟: 앞 ${r.bitsInOctet}비트가 서브넷, 뒤 ${8 - r.bitsInOctet}비트가 호스트 → 블록 크기 ${r.block}, 서브넷 경우 ${r.bitsInOctet ? r.ranges.slice(0, 4).map((x) => x.sub).join(" / ") + (r.ranges.length > 4 ? " …" : "") : "없음"} → 범위 ${r.ranges.slice(0, 4).map((x) => `${x.from}~${x.to}`).join(" / ")}${r.ranges.length > 4 ? " …" : ""}`,
        `IP ${v.ip} 의 ${r.octet + 1}번째 옥텟 ${r.ipOct} = ${r.ipOct.toString(2).padStart(8, "0")} → 앞 ${r.bitsInOctet}비트 ${pick ? pick.sub || "·" : ""} → ${pick ? `${pick.from}~${pick.to}` : ""} 블록`,
        `네트워크 주소 = 블록 시작 ${r.net}, 브로드캐스트 = 블록 끝 ${r.bc}, 호스트는 그 사이 ${r.first} ~ ${r.last}`,
      ];
      if (r.split) steps.push(`FLSM ${r.split.count}개로 나누려면 서브넷 비트 ${r.split.sb}개 더 필요 (2^${r.split.sb} = ${Math.pow(2, r.split.sb)} ≥ ${r.split.count}) → /${r.split.nb}, 블록 크기 2^${32 - r.split.nb} = ${r.split.size}`);
      return `<div class="cb-sec"><h5>서브넷 마스크 ${r.maskStr} (/${r.bits}) · 네트워크 ${r.bits}비트 / 호스트 ${r.hostBits}비트</h5>
        <div class="hint">IP 2진수 ${ipBin}</div>
        <ol class="cb-steps">${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <table class="cb-t bits"><tr><th>자릿값</th>${weights.map((w) => `<td>${w}</td>`).join("")}</tr><tr><th>마스크 ${r.octet + 1}번째 옥텟</th>${octBits.map((b, i) => `<td class="${i < r.bitsInOctet ? "net" : "host"}">${b}</td>`).join("")}</tr><tr><th>IP ${r.octet + 1}번째 옥텟 (${r.ipOct})</th>${ipBits.map((b, i) => `<td class="${i < r.bitsInOctet ? "net" : "host"}">${b}</td>`).join("")}</tr></table>
        <div class="hint">앞 ${r.bitsInOctet}비트 = 서브넷(N), 뒤 ${8 - r.bitsInOctet}비트 = 호스트(H) · 블록 크기 2^${8 - r.bitsInOctet} = ${r.block}</div>
        <table class="cb-t ranges">${near.map((x) => `<tr class="${r.ipOct >= x.from && r.ipOct <= x.to ? "pick" : ""}"><th>${x.sub || "·"}</th><td>${x.from} ~ ${x.to}</td></tr>`).join("")}</table>
        <div class="cb-ans">네트워크 주소 <b>${r.net}</b> · 브로드캐스트 <b>${r.bc}</b> · 호스트 ${r.first} ~ ${r.last} · 사용 가능 호스트 2^${r.hostBits} − 2 = <b>${r.hosts}</b></div>
        ${r.split ? `<h5>FLSM ${r.split.count}개 분할 → 서브넷 비트 ${r.split.sb}개 더 (/${r.split.nb}, 블록 ${r.split.size})</h5><table class="cb-t"><tr><th>#</th><th>네트워크</th><th>호스트 범위</th><th>브로드캐스트</th></tr>${r.split.subs.map((s, i) => `<tr><th>${i + 1}</th><td>${s.net}</td><td>${s.first} ~ ${s.last}</td><td>${s.bc}</td></tr>`).join("")}</table>` : ""}</div>`;
    },
    renderChmod(v) {
      const tri = (s) => { s = (s || "---").padEnd(3, "-").slice(0, 3); const b = ["r", "w", "x"].map((c, i) => (s[i] === c ? 1 : 0)); return { b, n: b[0] * 4 + b[1] * 2 + b[2] }; };
      const parts = [["소유자", tri(v.owner)], ["그룹", tri(v.group)], ["기타", tri(v.other)]];
      let out = `<div class="cb-sec"><h5>chmod</h5><table class="cb-t bits"><tr><th></th>${parts.map(() => `<td>4</td><td>2</td><td>1</td><td class="sum"></td>`).join("")}</tr><tr><th></th>${parts.map(([n]) => `<td colspan="4">${n}</td>`).join("")}</tr><tr><th></th>${parts.map(() => `<td>r</td><td>w</td><td>x</td><td></td>`).join("")}</tr><tr><th>비트</th>${parts.map(([, t]) => `<td>${t.b[0]}</td><td>${t.b[1]}</td><td>${t.b[2]}</td><td class="sum">${t.n}</td>`).join("")}</tr></table>
        <ol class="cb-steps">${parts.map(([n, t]) => `<li>${n}: ${["r", "w", "x"].map((c, i) => `${c}=${t.b[i] ? [4, 2, 1][i] : 0}`).join(" + ")} = ${t.n}</li>`).join("")}<li>세 숫자를 이어 쓰면 ${parts.map(([, t]) => t.n).join("")}</li></ol>
        <div class="cb-ans">chmod <b>${parts.map(([, t]) => t.n).join("")}</b> 파일명</div>`;
      if (v.umask) { const u = v.umask.slice(-3).split("").map(Number); const f = [6, 6, 6].map((x, i) => x - u[i]), d = [7, 7, 7].map((x, i) => x - u[i]); out += `<h5>umask ${v.umask}</h5><div class="cb-ans">파일 666 − ${u.join("")} = <b>${f.join("")}</b> · 디렉터리 777 − ${u.join("")} = <b>${d.join("")}</b></div>`; }
      if (v.given) { const g = v.given.split("").map(Number); out += `<h5>권한 ${v.given} 이면 umask</h5><div class="cb-ans">파일 기준 666 − ${v.given} = <b>${[6, 6, 6].map((x, i) => x - g[i]).join("")}</b></div>`; }
      return out + `</div>`;
    },
    renderLoc(v) {
      const L = Number(String(v.lines).replace(/,/g, "")), p = Number(v.people), r = Number(String(v.rate).replace(/,/g, ""));
      if (!L || !r) return `<div class="hint">총 라인 수와 생산성(라인/월)을 입력하세요</div>`;
      const mm = L / r; const months = p ? L / (p * r) : null;
      return `<div class="cb-sec"><h5>LOC</h5><ol class="cb-steps"><li>총 라인 ${L} 을 한 사람이 한 달에 ${r} 라인씩 짜면 ${L} ÷ ${r} = ${+mm.toFixed(2)} 인월(사람·달)</li>${p ? `<li>${p}명이 나눠 하면 ${+mm.toFixed(2)} ÷ ${p} = ${+months.toFixed(2)} 개월 (한 번에 ${L} ÷ (${p} × ${r}) 로 계산해도 같음)</li>` : ""}</ol>
        <div class="cb-ans">노력 = 총 라인 ÷ 생산성 = <span class="ldiv">${r}<span class="dv">)${L}</span></span> = <b>${+mm.toFixed(2)}</b> 인월(man-month)</div>
        ${months !== null ? `<div class="cb-ans">기간 = 총 라인 ÷ (인원 × 생산성) = ${L} ÷ (${p} × ${r} = ${p * r}) = <span class="ldiv">${p * r}<span class="dv">)${L}</span></span> = <b>${+months.toFixed(2)}</b> 개월</div>` : ""}</div>`;
    },
    form(type, v) {
      const inp = (k, label, extra = "") => `<label>${label}<input data-k="${k}" value="${esc(v[k] ?? "")}" ${extra}></label>`;
      const sel = (k, label, opts) => `<label>${label}<select data-k="${k}">${opts.map((o) => `<option value="${o[0]}" ${String(v[k]) === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></label>`;
      if (type === "page") return inp("seq", "참조열", 'class="wide"') + inp("frames", "프레임 수", 'type="number" min="1" class="n"') + `<span class="chk">${["FIFO", "LRU", "LFU", "OPT"].map((a) => `<label><input type="checkbox" data-algo="${a}" ${v.algos.includes(a) ? "checked" : ""}>${a}</label>`).join("")}</span>`;
      if (type === "sched") return `<label>프로세스 (이름 도착 실행)<textarea data-k="procs" rows="4">${esc(v.procs)}</textarea></label>` + sel("algo", "알고리즘", [["FCFS", "FCFS"], ["SJF", "SJF (비선점)"], ["SRT", "SRT (선점)"], ["RR", "RR"], ["HRN", "HRN"], ["PRI", "우선순위 (작은 수 우선, 4번째 열)"]]) + inp("quantum", "퀀텀", 'type="number" min="1" class="n"');
      if (type === "disk") return inp("queue", "요청 큐", 'class="wide"') + inp("head", "헤드", 'type="number" class="n"') + sel("dir", "방향", [["up", "바깥쪽(증가)"], ["down", "안쪽(감소)"]]) + inp("max", "끝 트랙", 'type="number" class="n"') + sel("algo", "알고리즘", [["FCFS", "FCFS"], ["SSTF", "SSTF"], ["SCAN", "SCAN"], ["C-SCAN", "C-SCAN"], ["LOOK", "LOOK"], ["C-LOOK", "C-LOOK"]]);
      if (type === "subnet") return inp("ip", "IP") + inp("mask", "마스크 (255.x 또는 /n)") + inp("split", "FLSM 분할 수", 'type="number" min="0" class="n"');
      if (type === "chmod") return inp("owner", "소유자 rwx") + inp("group", "그룹") + inp("other", "기타") + inp("umask", "umask") + inp("given", "주어진 권한(→umask)");
      if (type === "loc") return inp("lines", "총 라인 수") + inp("people", "인원") + inp("rate", "생산성 (라인/월)");
      return "";
    },
    render(type, v) { return { page: this.renderPage, sched: this.renderSched, disk: this.renderDisk, subnet: this.renderSubnet, chmod: this.renderChmod, loc: this.renderLoc }[type].call(this, v); },
    mount(q, type) {
      const box = $("#calc"); if (!box) return;
      S.calc = S.calc || {}; let v = S.calc[q.id] || this.parse(type, q);
      const title = { page: "페이지 교체", sched: "프로세스 스케줄링", disk: "디스크 스케줄링", subnet: "서브넷 계산", chmod: "리눅스 권한", loc: "LOC 산정" }[type];
      const draw = () => {
        let html = ""; try { html = this.render(type, v); } catch (e) { html = `<div class="hint">값을 읽지 못했어요. 위 칸을 고쳐 주세요.</div>`; }
        $("#calcOut").innerHTML = html;
      };
      box.innerHTML = `<div class="trace-h"><b>풀이 판 · ${title}</b><span class="hint">문제에서 읽은 값 (고쳐서 다시 풀 수 있음)</span></div><div class="cb-form" id="calcForm">${this.form(type, v)}</div><div id="calcOut"></div>`;
      const sync = () => { $$("#calcForm [data-k]").forEach((el) => { v[el.dataset.k] = el.value; }); if (type === "page") v.algos = $$("#calcForm [data-algo]").filter((c) => c.checked).map((c) => c.dataset.algo); S.calc[q.id] = v; Store.save(); draw(); };
      $("#calcForm").addEventListener("input", sync); $("#calcForm").addEventListener("change", sync);
      draw();
    },
  };

