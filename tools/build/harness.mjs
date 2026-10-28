// 뷰어의 판 만들기 함수를 브라우저 없이 모든 추적 데이터에 돌려서 예외·속도를 확인한다
import fs from "fs"; import vm from "vm";
const js = fs.readFileSync("src/trace_viewer.js", "utf8");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const factory = new Function("window", "document", "S", "Store", "esc", "$", "$$", js + "\nreturn { expandTrace, codeInfo, addrInfo, buildBoard, boardHtml, describeBoard, lineNotes };");
const dir = "data/trace"; let bad = 0, total = 0, slow = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "index.js")) {
  const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(dir + "/" + f, "utf8"), sandbox);
  const id = f.slice(0, -3); const c = sandbox.window.CBT_TRACE[id];
  const V = factory({ CBT_TRACE_INDEX: {}, CBT_TRACE: {} }, {}, {}, { save() {} }, esc, () => null, () => []);
  try {
    const steps = V.expandTrace(c), info = V.codeInfo(c.code, c.lang);
    const T = { steps, lang: c.lang, info, addr: null, regionOf: () => null };
    if (c.lang === "c") { T.addr = V.addrInfo(steps, info); T.regionOf = T.addr.regionOf; }
    const t0 = Date.now();
    for (let k = 0; k < steps.length; k++) { const B = V.buildBoard(T, k); const html = V.boardHtml(B, k, T, false); V.describeBoard(B, k, T, steps[k - 1], steps[k]); if (steps[k].e !== "end") V.lineNotes((T.info.lines[steps[k].l - 1] || "").trim(), B, T); if (/undefined|NaN|\[object/.test(html.replace(/undefined\s*행/g, ""))) { console.log("SUSPECT", id, "step", k, html.match(/.{0,40}(undefined|NaN|\[object).{0,40}/)[0]); break; } }
    const ms = Date.now() - t0; if (ms > 1500) slow.push([id, steps.length, ms]); total++;
  } catch (e) { bad++; console.log("ERROR", id, e.message.split("\n")[0], e.stack.split("\n")[1]); }
}
console.log("ok:", total, "bad:", bad, "slow:", slow);
