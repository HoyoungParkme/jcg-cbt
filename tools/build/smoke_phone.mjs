// 핸드폰 크기(아이폰 390×844)에서 홈·코드 문항(추적 판)·계산 문항·펜 모드가 가로 넘침 없이 나오는지
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false });
const errors = []; page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
const overflow = async (label) => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, wide: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed").slice(0, 4).map((el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "")) })); console.log(label, "| scrollWidth", r.sw, "/ innerWidth", r.iw, r.sw > r.iw + 1 ? "OVERFLOW " + r.wide.join(", ") : "ok"); };
await page.goto(base); await page.waitForSelector(".study"); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForSelector(".study");
await overflow("home"); await page.screenshot({ path: "s_phone_home.png", fullPage: false });
const open = async (id) => {
  const track = id.startsWith("written") ? "written" : "practical"; const round = id.replace(/^(written|practical)-/, "").replace(/-(\d+|t-\d+|[a-z]+-\d+)$/, "");
  await page.goto(base); await page.waitForSelector(".study");
  await page.locator(`#trackSeg button[data-track="${track}"]`).click(); await page.locator('[data-mode="open"]').click(); await page.locator("#startBtn").click(); await page.waitForSelector(".round");
  await page.locator(`[data-round="${round}"]`).click(); await page.waitForSelector(".paper");
  const idx = await page.evaluate((id) => { const d = Object.values(window.CBT_DATA).find((d) => d.questions.some((q) => q.id === id)); return d.questions.findIndex((q) => q.id === id); }, id);
  await page.selectOption("#posSel", String(idx)); await page.waitForTimeout(300);
};
await open("practical-2024-2-c-2"); await page.waitForSelector("#trace[data-ready]");
await page.evaluate(() => { const r = document.querySelector("#trange"); r.value = "3"; r.dispatchEvent(new Event("input")); });
await overflow("code question"); await page.screenshot({ path: "s_phone_code.png", fullPage: true });
await open("practical-2024-2-t-9"); await overflow("calc question"); await page.screenshot({ path: "s_phone_calc.png", fullPage: true });
await open("practical-2021-3-c-1"); await page.waitForSelector("#trace[data-ready]"); await page.evaluate(() => { const r = document.querySelector("#trange"); r.value = "5"; r.dispatchEvent(new Event("input")); }); await overflow("struct table");
await page.locator("#penBtn").click(); await page.waitForTimeout(200); await overflow("pen mode"); await page.screenshot({ path: "s_phone_pen.png", fullPage: false });
await open("written-2022-1-75"); await overflow("written question"); await page.screenshot({ path: "s_phone_written.png", fullPage: false });
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
