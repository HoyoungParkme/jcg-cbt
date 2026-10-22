"""추적 결과 후처리.
1) C: 실제 주소를 흥달쌤식 간단 주소로 바꾼다 — 변수마다 100, 200, 300…, 배열 원소는 100, 101, 102…
   포인터 값도 같은 규칙으로 바꾸고(가리키는 변수의 번호), 아직 값이 정해지지 않은 변수는 "?" 로 표시한다.
2) Python/Java: 객체 참조(0x1000, @460)도 등장 순서대로 100, 200… 으로 바꾼다.
"""
import re, json

TYPE_SIZE = {"char": 1, "short": 2, "int": 4, "long": 8, "float": 4, "double": 8, "unsigned": 4, "long long": 8}

C_TYPES = {"int", "char", "long", "short", "double", "float", "unsigned", "signed", "void", "static", "const", "struct", "union", "enum", "size_t", "bool", "_Bool"}
def _typedef_names(code):
    names = set(re.findall(r"typedef\s[^;]*?\b([A-Za-z_]\w*)\s*;", code, flags=re.S))
    names |= set(re.findall(r"\}\s*([A-Za-z_]\w*)\s*;", code))      # typedef struct {...} Name;
    return names

def _decl_lines(code):
    """소스에서 변수 선언 줄과 대입 줄을 찾는다.
    반환: decls {이름: [{"decl": 줄, "init": 초기화식 있음, "static": static 여부}, …]}, assigns {이름: [대입 줄들]}"""
    tnames = C_TYPES | _typedef_names(code)
    decls, assigns, elem_assigns = {}, {}, {}
    lines = code.split("\n")
    for i, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line or line.startswith("#") or re.match(r"^(return|if|else|for|while|do|switch|case|printf|scanf|puts|break|continue)\b", line) and not re.match(r"^for\s*\(\s*(int|char|long|double|float|unsigned)\b", line):
            pass
        else:
            m = re.match(r"^(?:(?:static|const|unsigned|signed)\s+)*(struct\s+\w+|[A-Za-z_]\w*)\s+(?P<decls>[^;{()]*(?:\([^;]*\))?[^;{]*);\s*(//.*)?$", line)
            body = None
            if m and (m.group(1) in tnames or m.group(1).startswith("struct ")): body = m.group("decls")
            fm = re.match(r"^for\s*\(\s*(?:int|char|long|double|float|unsigned)\s+(?P<decls>[^;]*);", line)
            if fm: body = fm.group("decls")
            if body is not None:
                for d in re.split(r",(?![^(\[]*[)\]])", body):
                    nm = re.match(r"\s*\**\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])*\s*(=)?", d)
                    if nm and nm.group(1) not in tnames:
                        decls.setdefault(nm.group(1), []).append({"decl": i, "init": bool(nm.group(3)), "static": line.startswith("static ")})
        # 배열 원소 대입: arr[0] = …, arr[i] = … (원소별 초기화 판정용, 인덱스 글자도 기억)
        for em in re.finditer(r"\b([A-Za-z_]\w*)\s*\[([^\]]*)\]\s*(?:\[[^\]]*\]\s*)*(?:=(?!=)|\+\+|--|[+\-*/%]=)", line):
            if em.group(1) not in tnames: elem_assigns.setdefault(em.group(1), []).append((i, em.group(2).strip()))
        # 대입이 일어나는 줄: x = …, x++, x += …, scanf(…, &x), gets(x)/strcpy(x, …)
        names = set(re.findall(r"\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\])*\s*(?:=(?!=)|\+\+|--|[+\-*/%]=)", line)) | set(re.findall(r"(?:\+\+|--)\s*([A-Za-z_]\w*)", line))
        names |= set(re.findall(r"&\s*([A-Za-z_]\w*)", line)) if re.match(r"^scanf\b", line) else set()
        names |= set(re.findall(r"(?:gets|fgets|strcpy|strcat|sprintf)\s*\(\s*([A-Za-z_]\w*)", line))
        for nm in names:
            if nm in tnames: continue
            assigns.setdefault(nm, []).append(i)
    return decls, assigns, elem_assigns

def _func_ranges(code):
    """함수별 범위: {이름: (시작줄, 끝줄, [매개변수 이름])} — 정의 줄을 찾고 중괄호 짝으로 끝을 찾는다"""
    lines = code.split("\n"); out = {}; i = 0
    while i < len(lines):
        ln = lines[i]
        m = re.match(r"^\s*(?:[A-Za-z_][\w\s\*]*?)\b([A-Za-z_]\w*)\s*\(([^;{)]*)\)\s*\{?\s*$", ln)
        if m and not re.match(r"^\s*(if|for|while|switch|return|else|do)\b", ln) and m.group(1) not in ("if", "for", "while", "switch", "sizeof"):
            params = []
            for prm in m.group(2).split(","):
                pm = re.search(r"([A-Za-z_]\w*)\s*(\[[^\]]*\])*\s*$", prm.strip())
                if pm and pm.group(1) not in C_TYPES and pm.group(1) != "void": params.append(pm.group(1))
            j = i; depth = 0; started = False
            while j < len(lines):
                for ch in lines[j]:
                    if ch == "{": depth += 1; started = True
                    elif ch == "}": depth -= 1
                if started and depth <= 0: break
                j += 1
            out[m.group(1)] = (i + 1, j + 1, params); i = j + 1; continue
        i += 1
    return out

def _plain_array(raw):
    """숫자·문자·포인터로 된 1차원 배열인지 (구조체 배열·2차원 배열은 제외)"""
    return isinstance(raw, dict) and "arr" in raw and bool(raw["arr"]) and (not isinstance(raw["arr"][0], dict) or "p" in raw["arr"][0])

def _strip_d(x):
    """포인터가 '가리키는 내용'(d)은 빼고 비교한다 — 가리키는 곳이 바뀐 것과 포인터 값이 바뀐 것은 다르다"""
    if isinstance(x, dict):
        drop = ("d", "s") if "p" in x else ()      # 포인터의 가리키는 값(d)·문자열(s)은 비교에서 뺀다
        return {k: _strip_d(v) for k, v in x.items() if k not in drop}
    if isinstance(x, list): return [_strip_d(e) for e in x]
    return x

def simplify_c(trace):
    code = trace.get("code", ""); decls, assigns, elem_assigns = _decl_lines(code); ranges = _func_ranges(code)
    regions = []          # (real_base, size, elem_size or None, simple_base)
    next_num = [100]
    def region_for(addr, size, es):
        for r in regions:
            if r[0] == addr: return r
        base = next_num[0]
        span = max(1, (size // es) if es else 1)
        next_num[0] += 100 * ((span + 99) // 100)
        r = (addr, size, es, base); regions.append(r); return r
    def map_ptr(p):
        """실제 주소 → 간단 주소 문자열"""
        try: v = int(p, 16)
        except Exception: return p
        for base, size, es, sb in regions:
            if base <= v < base + max(size, 1):
                off = v - base
                if es: return str(sb + off // es)
                return str(sb) if off == 0 else f"{sb}+{off}"
        return None
    unknown = {}
    def map_unknown(p, ts=None):
        """스택 변수가 아닌 곳(힙, 문자열 상수): 구조체 블록은 블록마다 새 번호, 그 밖은 4바이트 단위로 이어서 번호를 준다"""
        v = int(p, 16)
        for ub, unit, sb, span in unknown.values():
            if ub <= v < ub + unit * span: return str(sb + (v - ub) // unit)
        sb = next_num[0]; next_num[0] += 100
        if ts and ts > 8: unknown[v] = (v, ts, sb, 1)       # 구조체 한 덩어리 = 번호 하나
        else: unknown[v] = (v, 4, sb, 100)
        return str(sb)
    def conv_val(x):
        if isinstance(x, dict):
            if "p" in x:
                y = {k: v for k, v in x.items() if k != "ts"}
                if x["p"] not in ("NULL",):
                    m = map_ptr(x["p"]); y["p"] = m if m is not None else map_unknown(x["p"], x.get("ts"))
                if "d" in y: y["d"] = conv_val(y["d"])
                return y
            if "arr" in x: return {**x, "arr": [conv_val(e) for e in x["arr"]]}
            if "st" in x: return {"st": {k: conv_val(v) for k, v in x["st"].items()}}
        return x
    # 1차: 모든 단계의 변수 주소에 번호 부여 (등장 순서대로)
    for st in trace["steps"]:
        for fr in st.get("f", []):
            for v in fr.get("v", []):
                if v.get("a") and v.get("sz"): region_for(int(v["a"], 16), v["sz"], v.get("es"))
        for v in st.get("g", []):
            if v.get("a") and v.get("sz"): region_for(int(v["a"], 16), v["sz"], v.get("es"))
    # 2차: 값/주소 치환 + 미초기화 표시
    #   변수는 (a) 그 함수의 매개변수이거나 (b) static 이거나 (c) 초기화식이 있는 선언 줄을 지났거나 (d) 대입 줄을 지났거나 (e) 값이 바뀌면 '값 있음'
    executed = {}      # 프레임(깊이) → 지나간 줄 집합
    last_line = {}     # 프레임(깊이) → 직전 단계의 줄
    init = {}          # (깊이, 이름) → 값 있음 여부
    elem_init = {}     # (깊이, 배열이름) → 값이 들어온 원소 번호들
    prev_elems = {}
    prev_vals = {}
    prev_depth = -1
    for st in trace["steps"]:
        frames = st.get("f", [])
        n = len(frames)
        for depth, fr in enumerate(frames):
            if depth not in executed or depth > prev_depth:      # 새로 생긴 프레임: 기록 초기화
                executed[depth] = set(); last_line[depth] = None
                for k in [k for k in init if k[0] == depth]: del init[k]
                for k in [k for k in prev_vals if k[0] == depth]: del prev_vals[k]
                for k in [k for k in elem_init if k[0] == depth]: del elem_init[k]
                for k in [k for k in prev_elems if k[0] == depth]: del prev_elems[k]
            if last_line.get(depth) is not None and last_line[depth] != fr["l"]: executed[depth].add(last_line[depth])
            last_line[depth] = fr["l"]
            rng = ranges.get(fr["n"])
            for v in fr.get("v", []):
                key = (depth, v["k"])
                if v.get("a"):
                    try: v["a"] = str(region_for(int(v["a"], 16), v.get("sz", 1), v.get("es"))[3])
                    except Exception: pass
                raw = json.dumps(_strip_d(v["x"]), sort_keys=True)
                changed = key in prev_vals and prev_vals[key] != raw
                prev_vals[key] = raw
                # 이 함수 안의 선언/대입만 본다
                in_rng = (lambda ln: rng is None or rng[0] <= ln <= rng[1])
                d = next((e for e in decls.get(v["k"], []) if in_rng(e["decl"])), None)
                asg = [a for a in assigns.get(v["k"], []) if in_rng(a)]
                is_param = (rng is not None and v["k"] in rng[2]) or (rng is None and not d and not asg) or (d is not None and d["static"]) or (d is None and rng is not None and not asg)
                if key not in init: init[key] = bool(is_param)
                if not init[key]:
                    ok = changed
                    if d and d["init"] and d["decl"] in executed[depth]: ok = True
                    if any(a in executed[depth] for a in asg): ok = True
                    if ok: init[key] = True
                raw_x = v["x"]
                v["x"] = conv_val(v["x"])
                if not init[key]: v["x"] = "?"; v["u"] = True
                elif d and not d["init"] and not d["static"] and not is_param and _plain_array(raw_x):
                    # 초기화 없는 1차원 배열(숫자·문자·포인터): 대입 줄이 지나갔거나 값이 바뀐 원소만 '값 있음'
                    n = len(raw_x["arr"]); ek = (depth, v["k"])
                    done = elem_init.setdefault(ek, set())
                    for (ln, idx) in [e for e in elem_assigns.get(v["k"], []) if in_rng(e[0])]:
                        if ln in executed[depth]:
                            if re.fullmatch(r"\d+", idx): done.add(int(idx))
                            else: done.update(range(n))
                    if any(a in executed[depth] for a in asg if a not in [e[0] for e in elem_assigns.get(v["k"], [])]): done.update(range(n))   # gets/scanf/strcpy 로 통째로
                    prev_e = prev_elems.get(ek)
                    cur_e = [json.dumps(_strip_d(e), sort_keys=True) for e in raw_x["arr"]]
                    if prev_e:
                        for i2, (pe, ce) in enumerate(zip(prev_e, cur_e)):
                            if pe != ce: done.add(i2)
                    prev_elems[ek] = cur_e
                    if len(done) < n:
                        v["x"] = {**v["x"], "arr": [e if i2 in done else "?" for i2, e in enumerate(v["x"]["arr"])]}
                for k2 in ("sz", "es"): v.pop(k2, None)
        prev_depth = n - 1
        if st.get("r") and st["r"].get("x") is not None: st["r"]["x"] = conv_val(st["r"]["x"])
        for v in st.get("g", []):
            if v.get("a"):
                try: v["a"] = str(region_for(int(v["a"], 16), v.get("sz", 1), v.get("es"))[3])
                except Exception: pass
            v["x"] = conv_val(v["x"]); v.pop("sz", None); v.pop("es", None)
    trace["addr"] = "simple"
    return trace

def simplify_refs(trace, pattern):
    """Python(→0x1000) / Java(@460) 참조를 등장 순서대로 100, 200… 으로"""
    table = {}
    def num(tok):
        if tok not in table: table[tok] = str(100 * (len(table) + 1))
        return table[tok]
    def walk(x):
        if isinstance(x, str):
            return re.sub(pattern, lambda m: m.group(1) + num(m.group(2)), x)
        if isinstance(x, list): return [walk(e) for e in x]
        if isinstance(x, dict): return {walk(k) if isinstance(k, str) else k: walk(v) for k, v in x.items()}
        return x
    # 힙 키(주소)도 같은 표로
    for st in trace["steps"]:
        st["f"] = walk(st.get("f", [])); st["s"] = walk(st.get("s", [])); st["g"] = walk(st.get("g", []))
        if "r" in st: st["r"] = walk(st["r"])
        if "h" in st:
            st["h"] = {walk(k): walk(v) for k, v in st["h"].items()}
    trace["addr"] = "simple"
    return trace

def postprocess(trace):
    if trace["lang"] == "c": return simplify_c(trace)
    if trace["lang"] == "python": return simplify_refs(trace, r"(→?)(0x[0-9a-f]{4,})")
    if trace["lang"] == "java": return simplify_refs(trace, r"(@)(\d+)")
    return trace
