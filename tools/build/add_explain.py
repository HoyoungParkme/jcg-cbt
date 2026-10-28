"""직접 쓴 해설 JSON 을 회차 데이터 파일(data/<track>/<round>.js)의 문항에 exp 로 넣는다.

사용법: python3 tools/build/add_explain.py 해설1.json [해설2.json ...]
해설 JSON 은 [{"id": "written-2026-1-1", "concept": ..., "choices"|"steps": ..., "keywords": ..., "memo": ..., "doubt"?: ...}, ...]
"""
import json, os, re, sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")
KEYS = ("concept", "choices", "steps", "keywords", "memo", "doubt")

def load(path):
    s = open(path, encoding="utf-8").read()
    i = s.index('"]=') + 3
    return s[:i], json.loads(s[i:].rstrip().rstrip(";"))

def check(e, q, track):
    """해설 한 개의 모양을 검사한다. 문제가 있으면 이유를 돌려준다."""
    if not str(e.get("concept", "")).strip(): return "concept 없음"
    if not e.get("keywords"): return "keywords 없음"
    if track == "written":
        ch = e.get("choices") or []
        if len(ch) != len(q["choices"]): return f"choices {len(ch)}개 (보기 {len(q['choices'])}개)"
        right = [k + 1 for k, c in enumerate(ch) if c.get("verdict") == "정답"]
        if len(right) != 1: return f"정답 판정 {len(right)}개"
        if right[0] != q["ans"] and not e.get("doubt"): return f"정답 {q['ans']}번과 해설의 정답 {right[0]}번이 다른데 doubt 없음"
    elif not e.get("steps"): return "steps 없음"
    # 코드 설명의 <stdio.h>, a<b 같은 글은 허용하고 실제 HTML 태그만 막는다
    if re.search(r"</?(br|p|div|span|b|i|u|em|strong|pre|code|table|tr|td|th|ul|ol|li|img|a)(\s+[\w-]+(=(\"[^\"]*\"|'[^']*'|[^\s>]*))?)*\s*/?>", json.dumps(e, ensure_ascii=False), re.I): return "HTML 태그 포함"
    return None

def round_of(qid):
    """문항 id 가 속한 (트랙, 회차 파일). 2020-1-2 처럼 회차에 '-' 가 들어간 경우가 있어 가장 긴 파일 이름으로 맞춘다."""
    track = qid.split("-", 1)[0]
    rounds = [f[:-3] for f in os.listdir(os.path.join(DATA, track)) if f.endswith(".js")]
    return track, max((r for r in rounds if qid.startswith(f"{track}-{r}-")), key=len, default=None)

by_file = {}
failed = 0
for src in sys.argv[1:]:
    for e in json.load(open(src, encoding="utf-8")):
        track, rnd = round_of(e["id"])
        if rnd is None: print("회차 파일 없음:", e["id"]); failed += 1; continue
        by_file.setdefault((track, rnd), []).append(e)

for (track, rnd), items in sorted(by_file.items()):
    path = os.path.join(DATA, track, rnd + ".js")
    head, obj = load(path)
    qs = {q["id"]: q for q in obj["questions"]}
    n = 0
    for e in items:
        q = qs.get(e["id"])
        if not q: print("문항 없음:", e["id"]); failed += 1; continue
        why = check(e, q, track)
        if why: print("건너뜀:", e["id"], why); failed += 1; continue
        q["exp"] = {k: e[k] for k in KEYS if e.get(k)}
        n += 1
    open(path, "w", encoding="utf-8").write(head + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";")
    print(f"{track}/{rnd}: {n}/{len(items)} 문항에 해설 넣음")
sys.exit(1 if failed else 0)
