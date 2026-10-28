// 펜 모드 확인: 펜슬(pointerType pen) 합성 이벤트로 획을 긋고, 저장·복원·손가락 탭 통과·레이아웃을 본다
import { chromium } from "playwright";
const base = "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });   // 아이패드 가로
const errors = []; page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
await page.goto(base); await page.waitForSelector(".study"); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForSelector(".study");
await page.locator('#trackSeg button[data-track="practical"]').click(); await page.locator('[data-mode="open"]').click(); await page.locator("#startBtn").click(); await page.waitForSelector(".round");
await page.locator('[data-round="2024-2"]').click(); await page.waitForSelector(".paper");
const idx = await page.evaluate(() => { const d = Object.values(window.CBT_DATA).find((d) => d.questions.some((q) => q.id === "practical-2024-2-c-2")); return d.questions.findIndex((q) => q.id === "practical-2024-2-c-2"); });
await page.selectOption("#posSel", String(idx)); await page.waitForSelector("#trace[data-ready]");
// 펜 켜기
await page.locator("#penBtn").click();
console.log("penmode body:", await page.evaluate(() => document.body.className), "| bar shown:", await page.locator("#penbar.show").count(), "| overlay on:", await page.locator("#paper .ink.on").count(), "| pad:", await page.locator("#paper .ink-pad").evaluate((e) => e.style.height));
// 펜슬로 획 긋기 (합성 PointerEvent)
const drawn = await page.evaluate(() => {
  const box = document.querySelector("#paper .ink"); const r = box.getBoundingClientRect();
  const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerType: "pen", pointerId: 7, isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pressure: .5 }));
  ev("pointerdown", 420, 120); for (let i = 1; i <= 30; i++) ev("pointermove", 420 + i * 4, 120 + Math.sin(i / 3) * 10); ev("pointerup", 540, 120);
  ev("pointerdown", 430, 160); ev("pointermove", 480, 170); ev("pointerup", 480, 170);
  return { paths: box.querySelectorAll("path").length, saved: Object.keys(JSON.parse(localStorage.getItem("cbtdesk.ink.v1") || "{}")) };
});
console.log("strokes:", drawn.paths, "| saved for:", drawn.saved);
// 지우개로 두 번째 획 지우기
await page.locator('#penbar [data-tool="erase"]').click();
const afterErase = await page.evaluate(() => {
  const box = document.querySelector("#paper .ink"); const r = box.getBoundingClientRect();
  const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerType: "pen", pointerId: 8, isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y }));
  ev("pointerdown", 455, 165); ev("pointerup", 455, 165); return box.querySelectorAll("path").length;
});
console.log("after erase:", afterErase, "| undo:", await (async () => { await page.locator('#penbar [data-act="undo"]').click(); return page.locator("#paper .ink path").count(); })());
// 손가락 탭 → 아래 버튼 눌림 (저장 버튼)
const tapped = await page.evaluate(() => {
  const box = document.querySelector("#paper .ink"); const b = document.querySelector("#markBtn"); const r = b.getBoundingClientRect();
  const ev = (type) => box.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 9, isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  ev("pointerdown"); ev("pointerup"); return document.querySelector("#markBtn").className;
});
console.log("finger tap on 저장 →", tapped);
await page.screenshot({ path: "s_pen_on.png", fullPage: false });
// 다른 문항 갔다가 돌아와도 획이 남는지
await page.locator("#prevBtn").click(); await page.locator("#nextBtn").click(); await page.waitForSelector("#paper .ink");
console.log("restored strokes:", await page.locator("#paper .ink path").count());
// 펜 끄기: 레이어는 남고 입력은 막힘
await page.locator('#penbar [data-act="off"]').click();
console.log("after off → overlay on:", await page.locator("#paper .ink.on").count(), "| strokes still shown:", await page.locator("#paper .ink path").count(), "| body:", await page.evaluate(() => document.body.className));
// 좁은 화면(아이패드 세로)
await page.setViewportSize({ width: 820, height: 1180 }); await page.locator("#penBtn").click(); await page.waitForTimeout(200);
await page.screenshot({ path: "s_pen_portrait.png", fullPage: false });
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
