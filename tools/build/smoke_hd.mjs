// 흥달쌤식 손풀이 판 확인: 문항별로 특정 단계까지 가서 추적 영역만 캡처한다
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = "http://127.0.0.1:8765/index.html";
const targets = JSON.parse(process.argv[2]);   // [[id, stepIndex|"last"|"half"], ...]
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 1000 } });
const errors = []; page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
for (const [id, where] of targets) {
  const round = id.match(/practical-(\d{4}-\d)-/)[1];
  await page.goto(base); await page.waitForSelector(".study");
  await page.evaluate(() => localStorage.clear());
  await page.goto(base); await page.waitForSelector(".study");
  await page.locator('#trackSeg button[data-track="practical"]').click();
  await page.locator('[data-mode="open"]').click(); await page.locator("#startBtn").click(); await page.waitForSelector(".round");
  await page.locator(`[data-round="${round}"]`).click(); await page.waitForSelector(".paper");
  const idx = await page.evaluate((id) => { const d = Object.values(window.CBT_DATA).find((d) => d.questions.some((q) => q.id === id)); return d.questions.findIndex((q) => q.id === id); }, id);
  await page.selectOption("#posSel", String(idx)); await page.waitForSelector("#trace[data-ready]", { timeout: 15000 });
  const total = Number((await page.locator("#tpos").innerText()).split("/")[1]);
  let k = where === "last" ? total - 1 : where === "half" ? Math.floor(total / 2) : String(where).startsWith("line:") ? -1 : Math.min(Number(where), total - 1);
  if (k < 0) {   // "line:N" → 그 줄에 처음(또는 n번째) 도착하는 단계
    const [, ln, nth] = String(where).split(":"); let hits = 0;
    for (let i = 0; i < total; i++) { await page.evaluate((i) => { const r = document.querySelector("#trange"); r.value = String(i); r.dispatchEvent(new Event("input")); }, i);
      const cur = await page.evaluate(() => (document.querySelector("#tcode .ln.cur") || {}).dataset?.l); if (cur === ln && ++hits >= Number(nth || 1)) { k = i; break; } }
    if (k < 0) k = 0;
  }
  await page.evaluate((k) => { const r = document.querySelector("#trange"); r.value = String(k); r.dispatchEvent(new Event("input")); }, k);
  await page.waitForTimeout(100);
  const now = (await page.locator("#tnow").innerText()).replace(/\n/g, " ").slice(0, 200);
  console.log(`${id} step ${k + 1}/${total} | ${now}`);
  await page.locator("#trace").screenshot({ path: `s_hd_${id.replace("practical-", "")}_${k + 1}.png` });
}
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
