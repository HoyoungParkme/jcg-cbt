"""손질된 소스를 컴파일·실행해 출력과 정답을 비교한다."""
import json, subprocess, re, os, sys, collections
metas = json.load(open("build/meta.json", encoding="utf-8"))
def norm(s): return re.sub(r"\s+", "", s).lower()
def clean_err(e): return "\n".join(l for l in (e or "").split("\n") if "JAVA_TOOL_OPTIONS" not in l).strip()[:400]
env = dict(os.environ); env.pop("JAVA_TOOL_OPTIONS", None)
res = []
for m in metas:
    d = os.path.dirname(m["src"]); out = ""; err = ""; status = "ok"
    try:
        if m["lang"] == "c":
            c = subprocess.run(["gcc", "-g", "-O0", "-w", "-std=gnu99", "-include", "unbuf.h", "-o", f"{d}/a.out", m["src"], "-lm"], capture_output=True, text=True, timeout=30)
            if c.returncode: status = "compile"; err = clean_err(c.stderr)
            else:
                r = subprocess.run([f"{d}/a.out"], capture_output=True, text=True, timeout=5, input=m["stdin"]); out = r.stdout; err = clean_err(r.stderr)
        elif m["lang"] == "java":
            c = subprocess.run(["javac", "-g", "-encoding", "UTF-8", "-d", d, m["src"]], capture_output=True, text=True, timeout=60, env=env)
            if c.returncode: status = "compile"; err = clean_err(c.stderr)
            elif m["skip"]: status = "nomain"
            else:
                r = subprocess.run(["java", "-cp", d, m["main_cls"]], capture_output=True, text=True, timeout=10, input=m["stdin"], env=env); out = r.stdout; err = clean_err(r.stderr)
                if r.returncode: status = "runtime"
        else:
            r = subprocess.run([sys.executable, "-I", m["src"]], capture_output=True, text=True, timeout=5, input=m["stdin"]); out = r.stdout; err = clean_err(r.stderr)
            if r.returncode: status = "runtime"
    except subprocess.TimeoutExpired: status = "timeout"
    except Exception as e: status = "error"; err = str(e)
    match = norm(out) == norm(m["answer"]) or (norm(out) and norm(out) in norm(m["answer"])) or (norm(m["answer"]) and norm(m["answer"]) in norm(out))
    res.append({"id": m["id"], "lang": m["lang"], "status": status, "out": out.strip(), "err": err, "match": bool(match), "fill": m["fill"]})
json.dump(res, open("run_results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("status:", dict(collections.Counter((r["lang"], r["status"]) for r in res)))
print("match :", dict(collections.Counter((r["lang"], r["match"]) for r in res if r["status"] == "ok")))
for r in res:
    if r["status"] not in ("ok", "nomain") or not r["match"]: print(f"  {r['id']} [{r['status']}] out={r['out'][:50]!r} | {r['err'][:150]!r}")
