"""필기·실기 코드 문항(C/Java/Python)의 소스를 파일로 뽑고, 정답을 함께 기록한다.

실기는 C언어·Java·Python 단원, 필기는 프로그래밍 언어 활용 과목에서 코드 블록이 있는 문항을 고른다.
정답은 실기면 모범답안, 필기면 정답 보기의 글이다 (run_all.py 가 실행 출력과 비교한다).
"""
import json, glob, re, html, os
OUT = "src"
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")
UNITS = {"practical": ("C언어", "Java", "Python"), "written": ("프로그래밍 언어 활용",)}
LANG = {"c": "c", "java": "java", "python": "py", "py": "py"}
def unesc(s): return html.unescape(re.sub(r"<br\s*/?>", "\n", s))
def plain(s): return unesc(re.sub(r"<[^>]+>", " ", s)).strip()
os.makedirs(OUT, exist_ok=True)
items = []
for track, units in UNITS.items():
    for f in sorted(glob.glob(os.path.join(DATA, track, "*.js"))):
        rid = f.split("/")[-1][:-3]; s = open(f, encoding="utf-8").read(); qs = json.loads(s[s.index("]=")+2:].rstrip().rstrip(";"))["questions"]
        for q in qs:
            if q["unit"] not in units: continue
            m = re.search(r'<pre class="qcode"><code(?: class="language-(\w+)")?>(.*?)</code></pre>', q["q"], re.S)
            if not m:
                if track == "practical": items.append({"id": q["id"], "lang": None})
                continue
            code = unesc(re.sub(r"</?u>", "", m.group(2))).replace("\r\n", "\n").rstrip() + "\n"   # 밑줄 표시(<u>)는 지우고 코드만
            lang = LANG.get(m.group(1)) or ("c" if re.search(r"#include|printf\(", code) else None)
            if not lang:   # 언어를 알 수 없는 코드: 실기는 빠뜨리지 않고 lang 없음으로 남긴다
                if track == "practical": items.append({"id": q["id"], "lang": None})
                continue
            path = f"{OUT}/{q['id']}.{lang}"
            open(path, "w", encoding="utf-8").write(code)
            answer = plain(q["answer"]) if track == "practical" else plain(q["choices"][q["ans"] - 1])
            items.append({"id": q["id"], "round": rid, "no": q["no"], "lang": lang, "path": path, "answer": answer, "stem": re.sub(r"<[^>]+>", " ", q["q"].split("<pre")[0]).strip()})
json.dump(items, open("items.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
import collections; print(collections.Counter((i["id"].split("-")[0], i["lang"]) for i in items))
