"""실기 코드 문항(C/Java/Python)의 소스를 파일로 뽑고, 정답을 함께 기록한다."""
import json, glob, re, html, os
OUT = "src"
def unesc(s): return html.unescape(re.sub(r"<br\s*/?>", "\n", s))
items = []
for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "practical", "*.js"))):
    rid = f.split("/")[-1][:-3]; s = open(f, encoding="utf-8").read(); qs = json.loads(s[s.index("]=")+2:].rstrip().rstrip(";"))["questions"]
    for q in qs:
        if q["unit"] not in ("C언어", "Java", "Python"): continue
        m = re.search(r'<pre class="qcode"><code class="language-(\w+)">(.*?)</code></pre>', q["q"], re.S)
        if not m: items.append({"id": q["id"], "lang": None}); continue
        lang = {"c": "c", "java": "java", "python": "py", "py": "py"}.get(m.group(1), m.group(1))
        code = unesc(m.group(2)).replace("\r\n", "\n").rstrip() + "\n"
        name = q["id"].replace("/", "_")
        path = f"{OUT}/{name}.{lang}"
        open(path, "w", encoding="utf-8").write(code)
        items.append({"id": q["id"], "round": rid, "no": q["no"], "lang": lang, "path": path, "answer": unesc(re.sub(r"<[^>]+>", " ", q["answer"])).strip(), "stem": re.sub(r"<[^>]+>", " ", q["q"].split("<pre")[0]).strip()})
json.dump(items, open("items.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
import collections; print(collections.Counter(i["lang"] for i in items))
