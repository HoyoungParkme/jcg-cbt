"""모든 코드 문항의 실행 추적을 만들어 data/trace/<id>.js 로 저장한다."""
import json, subprocess, os, sys, re, collections
from compress import compress
from post import postprocess
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "trace"); os.makedirs(OUT, exist_ok=True)
metas = json.load(open("build/meta.json", encoding="utf-8"))
results = {r["id"]: r for r in json.load(open("run_results.json", encoding="utf-8"))}
env = dict(os.environ); env.pop("JAVA_TOOL_OPTIONS", None)
MAX = 1500
index = {}; stat = collections.Counter()
ONLY = os.environ.get("TRACE_ONLY")
for m in metas:
    if ONLY and m["lang"] != ONLY: continue
    r = results.get(m["id"], {})
    if r.get("status") not in ("ok",) or m.get("skip"): stat["skip"] += 1; continue
    d = os.path.dirname(m["src"]); tr = None
    try:
        if m["lang"] == "py":
            p = subprocess.run([sys.executable, "-I", "trace_py.py", m["src"], f"{d}/stdin.txt"], capture_output=True, text=True, timeout=60, env={**env, "TRACE_MAX": str(MAX)})
            tr = json.loads(p.stdout)
        elif m["lang"] == "c":
            open(f"{d}/stdin.txt", "w", encoding="utf-8").write(m["stdin"])
            e = {**env, "TRACE_SRC": os.path.basename(m["src"]), "TRACE_OUT": f"{d}/trace.json", "TRACE_STDOUT": f"{d}/prog_out.txt", "TRACE_MAX": str(MAX)}
            # gdb 는 run > file < stdin 형태로 실행: 스크립트 안의 run 명령에 stdin 파일을 넘긴다
            script = open("gdb_trace.py", encoding="utf-8").read().replace('"run > " + PROG_OUT + " < /dev/null"', f'"run > " + PROG_OUT + " < {d}/stdin.txt"')
            open(f"{d}/gdb_trace.py", "w", encoding="utf-8").write(script)
            subprocess.run(["gdb", "-q", "-batch", "-x", f"{d}/gdb_trace.py", "--args", f"{d}/a.out"], capture_output=True, text=True, timeout=180, env=e, cwd=os.path.dirname(m["src"]) and ".")
            tr = json.load(open(f"{d}/trace.json", encoding="utf-8"))
        else:
            stdin = f"{d}/stdin.txt" if m["stdin"] else "-"
            p = subprocess.run(["java", "-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8", "JdiTrace", d, m["main_cls"], stdin, str(MAX)], capture_output=True, text=True, timeout=240, env=env)
            tr = json.loads(p.stdout)
    except Exception as ex:
        stat["fail"] += 1; print("FAIL", m["id"], str(ex)[:120]); continue
    if not tr or not tr.get("steps"): stat["empty"] += 1; print("EMPTY", m["id"]); continue
    tr["code"] = m["code"]; tr["fill"] = m["fill"]; tr["stdin"] = m["stdin"]
    tr = postprocess(tr)
    c = compress(tr)
    qid = m["id"].replace("practical-", "practical/", 1)    # 앱의 문항 id: "practical-2024-1-c-2" 그대로 쓴다
    js = 'window.CBT_TRACE=window.CBT_TRACE||{};window.CBT_TRACE[' + json.dumps(m["id"]) + ']=' + json.dumps(c, ensure_ascii=False, separators=(",", ":")).replace("\ufffd", "?") + ";\n"   # 깨진 바이트는 ? 로
    open(f"{OUT}/{m['id']}.js", "w", encoding="utf-8").write(js)
    index[m["id"]] = {"n": c["n"], "st": tr["status"], "lang": tr["lang"]}
    stat[(m["lang"], tr["status"])] += 1
if ONLY and os.path.exists(f"{OUT}/index.js"):
    old = json.loads(open(f"{OUT}/index.js", encoding="utf-8").read().split("=", 1)[1].rstrip().rstrip(";"))
    old.update(index); index = old
json.dump(index, open(f"{OUT}/index.json", "w", encoding="utf-8"), ensure_ascii=False)
open(f"{OUT}/index.js", "w", encoding="utf-8").write("window.CBT_TRACE_INDEX=" + json.dumps(index, ensure_ascii=False) + ";\n")
print("done:", dict(stat)); print("total size:", sum(os.path.getsize(f"{OUT}/{f}") for f in os.listdir(OUT)) // 1024, "KB")
