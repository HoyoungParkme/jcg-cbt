"""원본 사이트 API(문제·정답·단원) + 깃허브(해설·정답률·자동채점 규칙)를 합쳐 앱 데이터로 변환한다."""
import json, glob, re, os, sys, collections
# 사용법: python3 tools/build/convert_site.py <사이트 API 덤프 폴더> <hj0304/cert 의 data 폴더>
SITE, GH = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")

def plain(h):
    s = re.sub(r"<[^>]+>", " ", str(h or ""))
    s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&nbsp;", " ").replace("&quot;", '"').replace("&#39;", "'")
    return re.sub(r"\s+", " ", s).strip()
def grams(s, n=3):
    s = re.sub(r"[\s\W_]+", "", plain(s).lower())
    return {s[i:i+n] for i in range(max(0, len(s) - n + 1))}
def sim(a, b):
    A, B = grams(a), grams(b)
    return len(A & B) / max(1, len(A | B))

def load_gh(cert, rnd):
    p = f"{GH}/{cert}/exam{rnd}.js"
    if not os.path.exists(p): return []
    s = open(p, encoding="utf-8").read(); s = s[s.index("={", s.index("CERT_DATA[")) + 1:].rstrip().rstrip(";")
    return json.loads(s)["questions"]

def gh_text(g):   # 깃허브 문항 전체 텍스트 (문제 + 지문 + 보기)
    t = g["subject"] + " " + (g.get("extra") or "")
    if g.get("choices"): t += " " + " ".join(c["html"] for c in g["choices"])
    return t
def site_text(q):
    return q["body_html"] + " " + " ".join(c["html"] for c in (q.get("choices") or []))

def norm(s):   # 단답 정규화 (앱의 normAnswer 와 동일해야 함)
    return re.sub(r"[;.]+$", "", re.sub(r"\s+", "", re.sub(r"[,，、·]", " ", re.sub(r"[“”\"'‘’`]", "", str(s or "").lower()))))

def fix_img(h):
    return re.sub(r'src="/api/images/[^"]*/([^"/]+)"', r'src="data/img/\1"', h)

def grams2(s):
    s = re.sub(r"[\s\W_]+", "", plain(s).lower()); return {s[i:i+2] for i in range(max(0, len(s) - 1))}
def asim(a, b):   # 정답 유사도: 정규화해서 같으면 1, 아니면 2-gram 자카드
    na, nb = norm(plain(a)), norm(plain(b))
    if na and na == nb: return 1.0
    A, B = grams2(a), grams2(b); return len(A & B) / max(1, len(A | B))
def head(a):   # 정답의 머리 용어: 괄호·줄바꿈 앞부분
    return norm(re.split(r"[(\n/,]", plain(a))[0])
def match_round(site_qs, gh_qs):
    """같은 회차 안에서 문제 본문 + 정답 유사도로 1:1 매칭 (깃허브 복원본은 표현이 달라 번호로는 못 맞춘다)."""
    cand = []
    for q in site_qs:
        for j, g in enumerate(gh_qs):
            qs = sim(site_text(q), gh_text(g))
            as_ = asim(q.get("answer_text") or str(q.get("answer_no")), g.get("shortAnswer") or str((g.get("answer") or [""])[0])) if "answer_text" in q or "answer" in g else 0
            if q.get("answer_text"):   # 용어 문제: 정답 머리말이 같거나, 상대 문제 본문에 그 용어가 들어 있으면 같은 문제로 본다
                hs, hg = head(q["answer_text"]), head(g.get("shortAnswer") or "")
                if hs and hs == hg: as_ = max(as_, 1.0)
                elif hs and len(hs) >= 3 and (hs in norm(plain(g["subject"])) or (hg and len(hg) >= 3 and hg in norm(plain(q["body_html"])))): as_ = max(as_, 0.9)
            sc = 0.6 * qs + 0.4 * as_ if q.get("answer_text") else qs
            cand.append((sc, qs, as_, q["ref"], j))
    cand.sort(reverse=True); out = {}; used = set()
    for sc, qs, as_, ref, j in cand:
        if ref in out or j in used: continue
        if sc >= 0.28 or as_ >= 0.9 or qs >= 0.35: out[ref] = (gh_qs[j], sc); used.add(j)
    return out

def clean(s):
    return s.replace("\ufffd-sub", "⊂").replace("\ufffd", "")

def format_ai(html, answer_terms):
    """한 덩어리 문단을 문장 단위로 쪼개고, 정답을 말하는 문장과 정답 용어를 굵게 표시한다."""
    html = clean(html)
    paras = re.findall(r"<p>(.*?)</p>", html, flags=re.S) or [re.sub(r"</?p>", "", html)]
    out = []
    for para in paras:
        text = re.sub(r"\s+", " ", para).strip()
        if not text: continue
        # 문장 분리: 종결어미 + 마침표/물음표 뒤 공백 (숫자 소수점·영문 약어는 보호)
        sents = re.split(r"(?<=[다요음임함됨죠네까])[.!?]\s+|(?<=[.!?])\s+(?=[가-힣A-Z])", text)
        for s_ in sents:
            s_ = s_.strip()
            if not s_: continue
            if not re.search(r"[.!?]$", s_): s_ += "."
            key = bool(re.match(r"(따라서|그러므로|즉|결론적으로|정답은|정답:)", s_)) or "정답" in s_
            for term in answer_terms:
                if term and len(term) >= 2 and term in s_:
                    s_ = s_.replace(term, "<b>" + term + "</b>")
            out.append(f'<p class="{"key" if key else ""}">{s_}</p>')
    return "".join(out)
def explain_of(g, answer_terms=()):
    ex = g.get("explain") or {}; e = {}
    if ex.get("mine"): e["mine"] = ex["mine"]
    if ex.get("user"): e["user"] = ex["user"] if isinstance(ex["user"], str) else "<br>".join(ex["user"])
    if ex.get("ai"):   e["ai"] = format_ai("".join(ex["ai"]) if isinstance(ex["ai"], list) else ex["ai"], answer_terms)
    return {k: clean(v) for k, v in e.items()}

manifest = {}; stats = collections.Counter()
exams_meta = {}
for track, slug in (("written", "written"), ("practical", "practical")):
    em = json.load(open(f"{SITE}/exams-{slug}.json", encoding="utf-8"))
    for grp in em["groups"]:
        for e in grp["exams"]: exams_meta[e["ref"]] = e
    units_api = json.load(open(f"{SITE}/units-{slug}.json", encoding="utf-8"))["units"]
    units = [u["name"] for u in units_api]
    rounds = []; unit_counts = {u: {} for u in units}
    os.makedirs(f"{OUT}/{track}", exist_ok=True)
    for f in sorted(glob.glob(f"{SITE}/{slug}-*.json")):
        d = json.load(open(f, encoding="utf-8"))
        rid = d["questions"][0]["ref"].rsplit("-", 1)[0].replace(f"info-processing-{slug}-", "") if track == "written" else re.sub(r"-(t|c|java|py|sql|db|net|sec|os|etc|\w+)-\d+$", "", d["questions"][0]["ref"]).replace(f"info-processing-{slug}-", "")
        # ref 형식: written-2024-1-7 / practical-2024-1-t-1 → 회차 id 는 파일명에서 가져오는 게 안전
        rid = os.path.basename(f)[len(slug) + 1:-5]
        gh_round = "2020-1" if rid == "2020-1-2" else rid
        gh_qs = load_gh("engineer" if track == "written" else "practical", gh_round)
        matched = match_round(d["questions"], gh_qs) if gh_qs else {}
        qs = []
        for q in d["questions"]:
            o = {"id": q["ref"].replace("info-processing-", ""), "no": q["number"], "unit": q["unit_name"], "q": fix_img(q["body_html"])}
            g, s = matched.get(q["ref"], (None, 0))
            if track == "written":
                o["choices"] = [fix_img(c["html"]) for c in sorted(q["choices"], key=lambda c: c["no"])]
                o["ans"] = q["answer_no"]
                if g:
                    if g.get("rate") is not None: o["rate"] = g["rate"]
                    if g["answer"][0] != q["answer_no"]: stats["answer-mismatch-written"] += 1; o["warn"] = (o.get("warn") or []) + ["doubt"]
            else:
                o["answer"] = q["answer_text"]; o["points"] = q.get("points") or 5
                if g and g.get("grade"):
                    gr = dict(g["grade"])
                    if gr.get("t") == "one": gr["a"] = sorted(set(gr["a"] + [norm(q["answer_text"])]))
                    o["grade"] = gr
                else:
                    o["grade"] = {"t": "one", "a": [norm(q["answer_text"])]} if len(plain(q["answer_text"])) <= 40 and not re.search(r"\(\d\)|[①②③]|\n", q["answer_text"]) else {"t": "self"}
                    stats["grade-fallback"] += 1
            if g and g.get("extra") and re.search(r"<(pre|img|table)\b", g["extra"]) and not re.search(r"<(pre|img|table|svg|code)\b", q["body_html"]) and "q-spec" not in q["body_html"]:
                o["q"] += '<div class="q-spec q-from-gh">' + g["extra"] + "</div>"; stats["extra-from-gh"] += 1
            if g:
                terms = [plain(q["choices"][q["answer_no"] - 1])] if track == "written" else [plain(q["answer_text"]), head(q["answer_text"])]
                terms = [x for x in {re.sub(r"\s*\(.*?\)\s*", "", x).strip() for x in terms if x} if 2 <= len(x) <= 40]
                e = explain_of(g, terms)
                if e: o["explain"] = e
                if g.get("wiki"): o["wiki"] = g["wiki"]
                keep = [w for w in (g.get("exWarn") or []) if w in ("doubt", "ambiguous")]
                if keep: o["warn"] = sorted(set((o.get("warn") or []) + keep))
                stats[f"matched-{track}"] += 1
                if s < 0.6: stats[f"lowsim-{track}"] += 1
            elif gh_qs:
                stats[f"unmatched-{track}"] += 1
                if track == "practical" and stats[f"unmatched-{track}"] <= 8:
                    best = max(gh_qs, key=lambda g: sim(site_text(q), gh_text(g)))
                    print("  UNMATCHED", rid, q["number"], plain(q["body_html"])[:40], "| best gh:", best["subject"][:40], "| ans:", plain(q["answer_text"])[:20], "vs", plain(best["shortAnswer"])[:20])
            qs.append(o)
            unit_counts[q["unit_name"]][rid] = unit_counts[q["unit_name"]].get(rid, 0) + 1
        y, *rest = rid.split("-")
        meta = exams_meta.get(f"info-processing-{slug}-{rid}", {})
        rounds.append({"id": rid, "label": f"{y}년 {'·'.join(rest)}회", "n": len(qs), "avg": meta.get("avg_score")})
        with open(f"{OUT}/{track}/{rid}.js", "w", encoding="utf-8") as w:
            w.write(f'window.CBT_DATA=window.CBT_DATA||{{}};window.CBT_DATA["{track}/{rid}"]=' + json.dumps({"track": track, "round": rid, "questions": qs}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    rounds.sort(key=lambda r: [int(x) for x in r["id"].split("-")[:2]])
    manifest[track] = {"rounds": rounds, "total": sum(r["n"] for r in rounds),
                       "units": [{"name": u["name"], "no": u["number"], "n": u["count"]} for u in units_api], "unitCounts": unit_counts}
# 검증 완료 문항: 웹 검색·직접 계산으로 사이트 정답이 맞음을 확인 → 경고 제거
VERIFIED = {"written/2022-1": [76, 78], "written/2021-1": [44], "written/2020-3": [53, 54], "written/2022-2": [80], "written/2020-4": [76], "written/2021-2": [7, 21], "written/2021-3": [19, 32, 34, 70, 76],
            "practical/2020-2": [12], "practical/2022-1": [5], "practical/2022-3": [16, 18], "practical/2024-1": [15]}
# 복원 오타 수정 (사이트 데이터의 명백한 표기 오류)
FIX_CHOICE = {("written/2021-3", 70, 2): "10.3.2.14"}
for key, nos in VERIFIED.items():
    track, rid = key.split("/"); path = f"{OUT}/{track}/{rid}.js"
    txt = open(path, encoding="utf-8").read(); head_, body = txt.split("=", 1) if False else (txt[:txt.index("]=") + 2], txt[txt.index("]=") + 2:].rstrip().rstrip(";"))
    d = json.loads(body)
    for q in d["questions"]:
        if q["no"] in nos: q.pop("warn", None)
        for (k, no, ci), v in FIX_CHOICE.items():
            if k == key and q["no"] == no: q["choices"][ci - 1] = v
    open(path, "w", encoding="utf-8").write(head_ + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
with open(f"{OUT}/manifest.js", "w", encoding="utf-8") as w:
    w.write("window.CBT_MANIFEST=" + json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + ";\n")
for t in manifest: print(t, "rounds:", [(r["id"], r["n"]) for r in manifest[t]["rounds"]], "total", manifest[t]["total"])
print("stats:", dict(stats))
