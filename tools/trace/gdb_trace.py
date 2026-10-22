"""gdb 안에서 실행되는 C 추적 스크립트.
main 에 멈춘 뒤 한 줄씩 step 하면서 (줄, 스택 프레임의 지역변수(이름·타입·주소·값), 포인터가 가리키는 값, 전역변수, 출력)을 기록한다.

사용: gdb -q -batch -x gdb_trace.py --args ./a  (환경변수 TRACE_OUT=출력파일, TRACE_STDOUT=프로그램 stdout 파일)
"""
import gdb, json, os, re

MAX_STEPS = int(os.environ.get("TRACE_MAX", "400"))
OUT = os.environ.get("TRACE_OUT", "trace.json")
PROG_OUT = os.environ.get("TRACE_STDOUT", "prog_out.txt")
SRC = os.path.basename(os.environ.get("TRACE_SRC", "a.c"))   # 우리 소스 파일명: 이 파일 밖(라이브러리)으로 들어가면 바로 빠져나온다
def in_src(frame):
    try:
        sal = frame.find_sal()
        return sal.symtab is not None and os.path.basename(sal.symtab.filename) == SRC
    except Exception: return False
GLOBALS = [g for g in os.environ.get("TRACE_GLOBALS", "").split(",") if g]

def val_str(v, depth=0):
    """gdb.Value → 사람이 읽을 값. 포인터는 주소 + 가리키는 값, 배열/구조체는 펼친다."""
    try:
        t = v.type.strip_typedefs()
        code = t.code
        if code == gdb.TYPE_CODE_PTR:
            target = t.target().strip_typedefs()
            if target.code == gdb.TYPE_CODE_INT and target.sizeof == 1:   # char*
                try: return {"p": hex(int(v)), "s": v.string(errors="replace")[:60]} if int(v) else {"p": "NULL"}
                except Exception: return {"p": hex(int(v))}
            if int(v) == 0: return {"p": "NULL"}
            if target.code == gdb.TYPE_CODE_FUNC or target.code == gdb.TYPE_CODE_VOID: return {"p": hex(int(v))}
            try:
                out = {"p": hex(int(v)), "d": val_str(v.dereference(), depth + 1) if depth < 3 else "…"}
                if target.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION): out["ts"] = target.sizeof   # 구조체 블록 크기 (힙 번호 매기기용)
                return out
            except Exception: return {"p": hex(int(v))}
        if code == gdb.TYPE_CODE_ARRAY:
            lo, hi = t.range()
            n = hi - lo + 1
            elem = t.target().strip_typedefs()
            if elem.code == gdb.TYPE_CODE_INT and elem.sizeof == 1:   # char 배열 → 문자열
                try: return {"arr": [val_str(v[i], depth + 1) for i in range(min(n, 16))], "s": v.string(errors="replace")[:60]}
                except Exception: pass
            return {"arr": [val_str(v[i], depth + 1) for i in range(min(n, 24))] + (["…"] if n > 24 else [])}
        if code == gdb.TYPE_CODE_STRUCT or code == gdb.TYPE_CODE_UNION:
            return {"st": {f.name: val_str(v[f.name], depth + 1) for f in t.fields() if f.name}}
        if code == gdb.TYPE_CODE_FLT: return round(float(v), 6)
        if code == gdb.TYPE_CODE_INT:
            if t.sizeof == 1:
                c = int(v)
                return "'%s' (%d)" % (chr(c) if 32 <= c < 127 else "\\x%02x" % (c & 0xff), c)
            return int(v)
        if code == gdb.TYPE_CODE_BOOL: return bool(v)
        return str(v)[:60]
    except Exception as e:
        return "?"

def elem_size(t):
    """배열의 '가장 안쪽' 원소 크기: 2차원 배열 m[3][3] 도 원소(int) 단위로 100, 101, 102… 번호를 매기기 위해"""
    et = t.target().strip_typedefs()
    while et.code == gdb.TYPE_CODE_ARRAY: et = et.target().strip_typedefs()
    return et.sizeof

def frame_vars(frame):
    out = []
    try: block = frame.block()
    except RuntimeError: return out
    seen = set()
    while block and not block.is_global and not block.is_static:
        for sym in block:
            if not (sym.is_variable or sym.is_argument) or sym.name in seen: continue
            seen.add(sym.name)
            try:
                v = sym.value(frame)
                entry = {"k": sym.name, "t": str(sym.type), "x": val_str(v)}
                try: entry["a"] = hex(int(v.address)) if v.address is not None else None
                except Exception: entry["a"] = None
                try:
                    st = v.type.strip_typedefs(); entry["sz"] = st.sizeof
                    if st.code == gdb.TYPE_CODE_ARRAY: entry["es"] = elem_size(st)
                except Exception: pass
                out.append(entry)
            except Exception: out.append({"k": sym.name, "t": str(sym.type), "x": "?"})
        block = block.superblock
    return out

def file_globals():
    """우리 소스 파일의 전역·파일 static 변수 이름 (심볼 테이블에서 읽는다)"""
    names = []
    try:
        symtab = gdb.newest_frame().find_sal().symtab
        for block in (symtab.global_block(), symtab.static_block()):
            for sym in block:
                if sym.is_variable and sym.addr_class == gdb.SYMBOL_LOC_STATIC and sym.symtab and os.path.basename(sym.symtab.filename) == SRC and sym.name not in names:
                    names.append(sym.name)
    except Exception: pass
    return names

def read_globals():
    g = []
    for name in GLOBALS:
        try:
            v = gdb.parse_and_eval(name)
            ge = {"k": name, "t": str(v.type), "x": val_str(v), "a": hex(int(v.address)) if v.address is not None else None}
            try:
                st = v.type.strip_typedefs(); ge["sz"] = st.sizeof
                if st.code == gdb.TYPE_CODE_ARRAY: ge["es"] = elem_size(st)
            except Exception: pass
            g.append(ge)
        except Exception: pass
    return g

def heap_from_frames(frames):
    """malloc 등으로 만든 포인터 대상은 val_str 안에 'd' 로 이미 들어 있으므로 별도 heap 은 생략"""
    return {}

def prog_output():
    try: return open(PROG_OUT, encoding="utf-8", errors="replace").read()
    except Exception: return ""

steps = []
pending_rets = []      # 방금 끝난 함수의 (이름, 반환값) — 다음 스냅샷에 붙인다
class ReturnWatch(gdb.FinishBreakpoint):
    """함수에 들어갈 때 걸어 두면, 그 함수가 돌아오는 순간 멈추고 반환값을 알려 준다"""
    def __init__(self, frame, name):
        super().__init__(frame, internal=True); self.fname = name; self.silent = True
    def stop(self):
        try: rv = val_str(self.return_value) if self.return_value is not None else None
        except Exception: rv = None
        if rv is not None: pending_rets.append({"n": self.fname, "x": rv})   # void 함수는 반환값 없음
        return True
    def out_of_scope(self): pass
def depth_in_src():
    n = 0; f = gdb.newest_frame()
    while f is not None:
        if in_src(f): n += 1
        f = f.older()
    return n
def snapshot(event):
    frames = []
    f = gdb.newest_frame(); depth = 0
    while f is not None and depth < 12:
        sal = f.find_sal()
        fn = f.name() or "?"
        if not in_src(f): f = f.older(); continue
        frames.append({"n": fn, "l": sal.line, "v": frame_vars(f)})
        f = f.older(); depth += 1
    frames.reverse()
    cur = gdb.newest_frame().find_sal()
    st = {"l": cur.line, "e": event, "f": frames, "g": read_globals(), "o": prog_output()}
    if pending_rets: st["r"] = pending_rets[-1]; del pending_rets[:]
    steps.append(st)

gdb.execute("set pagination off")
gdb.execute("set print pretty off")
gdb.execute("set confirm off")
gdb.execute("break main")
gdb.execute("run > " + PROG_OUT + " < /dev/null")
GLOBALS = file_globals() + [g for g in GLOBALS if g not in file_globals()]
status = "ok"
prev_depth = 1
try:
    snapshot("call")
    while len(steps) < MAX_STEPS:
        try: gdb.execute("step", to_string=True)
        except gdb.error as e:
            status = "exit"; break
        try:
            f = gdb.newest_frame()
        except gdb.error:
            status = "exit"; break
        # 라이브러리 안으로 들어갔으면 우리 소스로 돌아올 때까지 빠져나온다
        guard = 0
        while not in_src(gdb.newest_frame()) and guard < 20:
            guard += 1
            try: gdb.execute("finish", to_string=True)
            except gdb.error: status = "exit"; break
        if status == "exit": break
        if not in_src(gdb.newest_frame()): status = "exit"; break
        d = depth_in_src()
        if d > prev_depth:      # 새 함수에 들어왔다: 돌아올 때 반환값을 잡도록 감시 걸기
            try: ReturnWatch(gdb.newest_frame(), gdb.newest_frame().name() or "?")
            except Exception: pass
        prev_depth = d
        snapshot("line")
    else:
        status = "truncated"
except Exception as e:
    status = "exit" if "No registers" in str(e) or "not being run" in str(e) else "error: " + str(e)
try: gdb.execute("kill", to_string=True)
except Exception: pass
steps.append({"l": 0, "e": "end", "f": [], "g": [], "o": prog_output()})
json.dump({"lang": "c", "status": status, "out": prog_output(), "steps": steps}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
