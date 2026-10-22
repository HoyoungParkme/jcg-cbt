"""추적 단계를 '이전 단계와 달라진 것만' 남기는 형태로 줄인다 (뷰어에서 순서대로 적용해 복원)."""
import json
def compress(trace):
    steps = trace["steps"]; out = []; prev = None
    for s in steps:
        cur = {"l": s["l"], "e": s["e"]}
        # 프레임: 이름 목록이 같으면 바뀐 변수만, 다르면 전체
        same_frames = prev is not None and [f["n"] for f in prev["f"]] == [f["n"] for f in s["f"]]
        if same_frames:
            dv = []
            for i, (pf, cf) in enumerate(zip(prev["f"], s["f"])):
                pv = {v["k"]: v for v in pf["v"]}
                for v in cf["v"]:
                    if v["k"] not in pv or json.dumps(pv[v["k"]], sort_keys=True) != json.dumps(v, sort_keys=True): dv.append([i, v])
                removed = [k for k in pv if k not in {v["k"] for v in cf["v"]}]
                for k in removed: dv.append([i, {"k": k, "del": True}])
                if pf["l"] != cf["l"]: dv.append([i, {"line": cf["l"]}])
            if dv: cur["dv"] = dv
        else:
            cur["f"] = s["f"]
        for key in ("h", "g", "s"):
            if key in s and (prev is None or json.dumps(prev.get(key), sort_keys=True) != json.dumps(s.get(key), sort_keys=True)): cur[key] = s[key]
        if prev is None or s["o"] != prev["o"]: cur["o"] = s["o"]
        if "r" in s: cur["r"] = s["r"]      # 반환값은 그 단계에만 붙는다
        out.append(cur); prev = s
    return {k: v for k, v in trace.items() if k != "steps"} | {"steps": out, "n": len(out)}
if __name__ == "__main__":
    import sys
    t = json.load(open(sys.argv[1], encoding="utf-8")); c = compress(t)
    print(len(json.dumps(t)), "->", len(json.dumps(c, ensure_ascii=False)))
