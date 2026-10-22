"""Python 코드 실행 추적기.
한 줄 실행될 때마다 (현재 줄, 호출 스택의 지역변수, 힙 객체, 지금까지의 출력)을 기록한다.
객체 주소는 id()를 작은 가짜 주소(0x1000부터)로 바꿔서 보여 준다.

사용: python3 trace_py.py <소스> [<stdin파일>]  → JSON 을 표준출력으로
"""
import sys, io, json, types

MAX_STEPS = 400
src_path = sys.argv[1]
stdin_text = open(sys.argv[2], encoding="utf-8").read() if len(sys.argv) > 2 else ""
code = open(src_path, encoding="utf-8").read()

addr_map = {}          # id(obj) → 가짜 주소
def addr(obj):
    k = id(obj)
    if k not in addr_map: addr_map[k] = "0x%04x" % (0x1000 + 0x10 * len(addr_map))
    return addr_map[k]

PRIM = (int, float, bool, str, type(None))
def is_prim(v): return isinstance(v, PRIM)

def short(v, depth=0):
    """값을 짧은 문자열로. 컨테이너·객체는 주소 참조로 바꾸고 heap 에 따로 적는다."""
    if is_prim(v): return repr(v) if isinstance(v, str) else str(v)
    if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, type, types.ModuleType)): return getattr(v, "__name__", str(type(v).__name__))
    return "→" + addr(v)

heap_seen = {}
def heap_entry(v):
    """리스트/튜플/딕셔너리/집합/인스턴스를 힙 객체로 기록"""
    a = addr(v)
    if isinstance(v, (list, tuple)):
        return {"a": a, "t": type(v).__name__, "v": [short(x) for x in v]}
    if isinstance(v, dict):
        return {"a": a, "t": "dict", "v": {str(k): short(x) for k, x in v.items()}}
    if isinstance(v, (set, frozenset)):
        return {"a": a, "t": type(v).__name__, "v": [short(x) for x in v]}
    if hasattr(v, "__dict__"):
        return {"a": a, "t": type(v).__name__, "v": {k: short(x) for k, x in vars(v).items() if not k.startswith("__")}}
    return {"a": a, "t": type(v).__name__, "v": repr(v)[:60]}

def collect_heap(roots):
    """루트 값에서 닿는 컨테이너/객체를 전부 모은다 (얕게 2단계)"""
    out = {}; stack = list(roots); seen = set()
    while stack:
        v = stack.pop()
        if is_prim(v) or id(v) in seen: continue
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, type, types.ModuleType)): continue
        seen.add(id(v))
        e = heap_entry(v); out[e["a"]] = e
        children = list(v) if isinstance(v, (list, tuple, set, frozenset)) else list(v.values()) if isinstance(v, dict) else list(vars(v).values()) if hasattr(v, "__dict__") else []
        for c in children:
            if not is_prim(c): stack.append(c)
    return out

out_buf = io.StringIO()
steps = []
def snapshot(frame, event, line, ret=None):
    frames = []; f = frame
    while f is not None and f.f_code.co_filename == "<quiz>":
        loc = {k: v for k, v in f.f_locals.items() if not k.startswith("__") and not isinstance(v, (types.ModuleType, types.FunctionType, type))}
        frames.append({"n": f.f_code.co_name if f.f_code.co_name != "<module>" else "main(모듈)", "l": f.f_lineno,
                       "v": [{"k": k, "t": type(v).__name__, "x": short(v)} for k, v in loc.items()]})
        f = f.f_back
    frames.reverse()
    roots = []
    ff = frame
    while ff is not None and ff.f_code.co_filename == "<quiz>":
        roots += [v for k, v in ff.f_locals.items() if not k.startswith("__")]; ff = ff.f_back
    # 함수의 기본값 객체(def f(x, y=[]) 의 리스트)는 호출이 끝나도 살아 있다 — 흥달쌤도 지우지 않는다
    for v in list(g.values()):
        if isinstance(v, types.FunctionType) and v.__defaults__: roots += list(v.__defaults__)
    heap = collect_heap(roots)
    st = {"l": line, "e": event, "f": frames, "h": heap, "o": out_buf.getvalue()}
    # 함수가 값을 돌려주는 순간: 이름과 반환값을 함께 기록 (모듈/클래스 본문의 return 은 제외)
    if event == "return" and ret is not None and frame.f_code.co_name != "<module>" and "__module__" not in frame.f_locals:
        st["r"] = {"n": frame.f_code.co_name, "x": short(ret)}
    steps.append(st)

class Stop(Exception): pass
def tracer(frame, event, arg):
    if frame.f_code.co_filename != "<quiz>": return None
    if event in ("line", "return", "call"):
        if len(steps) >= MAX_STEPS: raise Stop()
        if event == "line": snapshot(frame, "line", frame.f_lineno)
        elif event == "call": snapshot(frame, "call", frame.f_lineno)
        elif event == "return": snapshot(frame, "return", frame.f_lineno, ret=arg)
    return tracer

g = {"__name__": "__main__"}
real_stdout = sys.stdout
sys.stdout = out_buf
sys.stdin = io.StringIO(stdin_text)
status = "ok"; err = ""
try:
    compiled = compile(code, "<quiz>", "exec")
    sys.settrace(tracer)
    exec(compiled, g)
except Stop: status = "truncated"
except SystemExit: pass
except Exception as e: status = "error"; err = f"{type(e).__name__}: {e}"
finally:
    sys.settrace(None); sys.stdout = real_stdout
# 마지막 상태 (종료)
steps.append({"l": 0, "e": "end", "f": [], "h": {}, "o": out_buf.getvalue()})
print(json.dumps({"lang": "python", "status": status, "err": err, "out": out_buf.getvalue(), "steps": steps}, ensure_ascii=False))
