"""src/page.base.html(뷰어 교체 전 원본) + trace_viewer·pen_mode·calc_board(css/js) + sql_trace.js + theme_b.css(B 디자인, 맨 뒤라 앞 규칙을 덮음) → src/page.html, 그리고 index.html 까지 다시 만든다."""
import subprocess
s = open("src/page.base.html", encoding="utf-8").read()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:70]; s = s.replace(old, new)
css = open("src/trace_viewer.css", encoding="utf-8").read() + open("src/pen_mode.css", encoding="utf-8").read() + open("src/calc_board.css", encoding="utf-8").read() + open("src/theme_b.css", encoding="utf-8").read()
js = open("src/trace_viewer.js", encoding="utf-8").read() + open("src/pen_mode.js", encoding="utf-8").read() + open("src/calc_board.js", encoding="utf-8").read() + open("src/sql_trace.js", encoding="utf-8").read()
a = s.index("/* ---------- 실행 추적 뷰어 ---------- */"); b = s.index("</style>", a); s = s[:a] + css + s[b:]
a = s.index("  /* ================= 실행 추적 뷰어 ================= */"); b = s.index("  /* ================= 키보드 ================= */", a); s = s[:a] + js + s[b:]
# 펜 모드 연결: 머리글 버튼 + 툴바, 문제 카드가 그려질 때 덧씌우기, 화면을 떠나면 레이아웃 원복
rep('''        <button class="btn sm omr-toggle" id="omrToggle">답안 현황</button>''',
    '''        <button class="btn sm" id="penBtn" title="애플펜슬로 문제 위에 직접 쓰기">✎ 펜</button>
        <button class="btn sm omr-toggle" id="omrToggle">답안 현황</button>''')
rep('''      <div class="kbd">단축키 <kbd>1</kbd>–<kbd>4</kbd> 선택 · <kbd>Enter</kbd> 채점/다음 · <kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>B</kbd> 저장 · <kbd>[</kbd><kbd>]</kbd> 실행 추적 단계</div>`;''',
    '''      <div class="kbd">단축키 <kbd>1</kbd>–<kbd>4</kbd> 선택 · <kbd>Enter</kbd> 채점/다음 · <kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>B</kbd> 저장 · <kbd>[</kbd><kbd>]</kbd> 실행 추적 단계</div>
      <div class="penbar" id="penbar"></div>`;
    document.body.classList.toggle("penmode", !!(S.pen && S.pen.on)); document.body.classList.toggle("penwide", !!(S.pen && S.pen.on && S.pen.wide));
    if (S.pen && S.pen.on) $("#penBtn").classList.add("on");''')
rep('''    $("#panel").innerHTML = panel;
    if (revealed && TI[q.id]) mountTrace(q.id);''',
    '''    const calcType = revealed ? Calc.detect(q) : null;   // 계산 문제: 흥달쌤식 풀이 판
    if (calcType) { const calcHtml = `<div class="trace calc" id="calc"></div>`; panel = panel.includes('<div class="explain">') ? panel.replace('<div class="explain">', calcHtml + '<div class="explain">') : panel + calcHtml; }
    $("#panel").innerHTML = panel;
    if (revealed && TI[q.id]) mountTrace(q.id);
    if (calcType) Calc.mount(q, calcType);''')
rep('''    html += `<div class="paper-acts" id="paperActs"></div>`;
    $("#paper").innerHTML = html;''',
    '''    html += `<div class="paper-acts" id="paperActs"></div>`;
    $("#paper").innerHTML = html;
    Ink.mount(q.id);   // 펜 모드 필기 레이어''')
rep('''  function go(v) {
    view = v;
    stopTimer();''',
    '''  function go(v) {
    view = v;
    stopTimer();
    if (v !== "session") document.body.classList.remove("penmode", "penwide");''')
open("src/page.html", "w", encoding="utf-8").write(s)
subprocess.run(["python3", "tools/build/build_index.py", "src/page.html", "index.html"], check=True)
