// 계산 풀이 판 확인: 문항을 열어 #calc 를 캡처하고 읽은 값·답 줄을 찍는다
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = "http://127.0.0.1:8765/index.html";
const ids = JSON.parse(process.argv[2]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 1100 } });
const errors = []; page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
for (const id of ids) {
  const track = id.startsWith("written") ? "written" : "practical";
  const round = id.replace(/^(written|practical)-/, "").replace(/-(\d+|t-\d+|[a-z]+-\d+)$/, "");
  await page.goto(base); await page.waitForSelector(".study");
  await page.evaluate(() => localStorage.clear());
  await page.goto(base); await page.waitForSelector(".study");
  await page.locator(`#trackSeg button[data-track="${track}"]`).click();
  await page.locator('[data-mode="open"]').click(); await page.locator("#startBtn").click(); await page.waitForSelector(".round");
  await page.locator(`[data-round="${round}"]`).click(); await page.waitForSelector(".paper");
  const idx = await page.evaluate((id) => { const d = Object.values(window.CBT_DATA).find((d) => d.questions.some((q) => q.id === id)); return d ? d.questions.findIndex((q) => q.id === id) : -1; }, id);
  if (idx < 0) { console.log(id, "NOT FOUND in round", round); continue; }
  await page.selectOption("#posSel", String(idx)); await page.waitForTimeout(150);
  const has = await page.locator("#calc").count();
  if (!has) { console.log(id, "| no calc board"); continue; }
  const form = await page.evaluate(() => [...document.querySelectorAll("#calcForm [data-k]")].map((e) => e.dataset.k + "=" + e.value.replace(/\n/g, "|")).join("  "));
  const ans = (await page.locator("#calcOut").innerText()).replace(/\s+/g, " ").slice(0, 260);
  console.log(`${id} | ${form}\n    → ${ans}`);
  await page.locator("#calc").screenshot({ path: `s_calc_${id}.png` });
}
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
