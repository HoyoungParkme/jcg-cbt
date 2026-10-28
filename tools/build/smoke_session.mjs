// 세션 흐름 회귀 점검: 스와이프 리스너 중복, 끝낸 회독의 부활, '정답 보기' 뒤 판정 표시
import { chromium } from "playwright";
const base = "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, hasTouch: true });
const errors = []; page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
let failed = 0;
const check = (label, ok, detail) => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", label, detail === undefined ? "" : "| " + detail); };
const fresh = async () => { await page.goto(base); await page.waitForSelector(".study"); await page.evaluate(() => localStorage.clear()); await page.goto(base); await page.waitForSelector(".study"); };
const startRound = async (track, mode) => {
  await page.locator(`#trackSeg button[data-track="${track}"]`).click(); await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator("#startBtn").click(); await page.waitForSelector(".round"); await page.locator("[data-round]").first().click(); await page.waitForSelector("#paper .qmeta");
};
const swipeLeft = (sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
  el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [mk(300)], changedTouches: [mk(300)] }));
  el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [mk(150)] }));
}, sel);

// 1) 세션에 세 번 들어가도 스와이프 한 번에 한 문항, 홈에서 스와이프해도 에러 없음
await fresh();
for (let n = 1; n <= 3; n++) {
  await startRound("written", "practice");
  await swipeLeft("#paper .qmeta"); await page.waitForTimeout(50);
  const pos = Number(await page.locator("#posSel").inputValue()) + 1;
  check(`스와이프 (세션 진입 ${n}회째)`, pos === 2, `${pos}번 문항`);
  await page.locator("#exitBtn").click(); await page.waitForSelector(".round");   // 새로고침 없이 화면만 옮겨야 리스너가 쌓이는지 보인다
  if (n < 3) { await page.locator('#nav button[data-view="home"]').click(); await page.waitForSelector(".study"); }
}
const before = errors.length; await swipeLeft("#app"); await page.waitForTimeout(50);
check("목록 화면 스와이프", errors.length === before, errors.slice(before).join(", "));

// 2) 회독을 마친 뒤 탭을 전환해도 '이어서 풀기'가 생기지 않음
await fresh(); await startRound("written", "open");
await page.selectOption("#posSel", String(await page.locator("#posSel option").count() - 1)); await page.locator("#doneBtn").click();
const resurrected = await page.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange"));
  return JSON.parse(localStorage.getItem("cbtdesk.v2")).session;
});
check("회독 마친 뒤 탭 전환", !resurrected, resurrected ? resurrected.title : "세션 없음");

// 3) 답을 적고 '정답 보기' → 오답이 아니라 '정답만 봄', 인정 버튼 없음, 기록에도 안 들어감
await fresh(); await startRound("practical", "practice");
const idx = await page.evaluate(() => Object.values(window.CBT_DATA).find((d) => d.questions[0].id.startsWith("practical")).questions.findIndex((q) => q.grade && q.grade.t !== "self" && q.grade.t !== "multi"));
await page.selectOption("#posSel", String(idx)); await page.locator("#shortInput").fill("아무거나"); await page.locator("#revealBtn").click();
const label = await page.locator("#panel .feedback span").first().innerText();
check("'정답 보기' 판정", label === "정답만 봄", label);
check("'정답 보기' 뒤 인정 버튼", (await page.locator('[data-self="1"]').count()) === 0);
check("'정답 보기'는 기록에 안 남음", await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("cbtdesk.v2")).hist).length === 0));
// 자동 채점 오답은 여전히 '정답으로 인정' 가능
await page.locator("#retryBtn").click(); await page.locator("#shortInput").fill("아무거나"); await page.locator("#checkBtn").click();
check("오답 판정", (await page.locator("#panel .feedback span").first().innerText()) === "오답");
await page.locator('[data-self="1"]').click();
check("'정답으로 인정' 동작", (await page.locator("#panel .feedback span").first().innerText()) === "정답");

check("페이지 에러 없음", errors.length === 0, errors.join(", "));
await browser.close();
process.exit(failed ? 1 : 0);
