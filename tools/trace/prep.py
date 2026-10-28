"""문항별 소스를 '실행 가능한' 형태로 손질한다.
- 줄번호 접두어 제거, 빈칸 문항은 정답을 채워 넣기(수동 표), 조각 코드는 main/클래스로 감싸기, 표준입력 값 지정.
결과: build/<id>/ (소스, stdin.txt, meta.json)
"""
import json, re, os, shutil
items = json.load(open("items.json", encoding="utf-8"))
FILL = {   # 빈칸 문항: (찾을 정규식, 넣을 값). 정답 기준으로 채운다.
    "practical-2022-1-c-3": [(r"\(\s*①\s*\)", ">"), (r"\(\s*②\s*\)", "%"), (r"\(\s*③\s*\)", "/")],
    "practical-2023-1-c-3": [(r"\(a\)\(b\)", "% 10")],
    "practical-2023-2-c-3": [(r"\(\s{2,}\)", ">")],
    "practical-2023-2-c-4": [(r"\(\s{4,}\)", "n[(i+1) % 5]")],
    "practical-2023-3-c-2": [(r"\(\s*\)(?=(name|age))", "->"), (r"\(\s*\)(?=(name|age))", "->")],
    "practical-2020-4-java-3": [(r"\(\s*\(1\)\s*\)", "(n > 0)"), (r"\(\s*\(2\)\s*\)", "(n % 2)")],
    "practical-2022-1-java-2": [(r"new\s*\(\s+\)\(\)", "new Car()")],
    "practical-2023-1-java-4": [(r"\(\s*①\s*\)", "idx2"), (r"\(\s*②\s*\)", "nx")],
    "practical-2023-2-java-2": [(r"\(\s{3,}\)", "m / 1000"), (r"\(\s{3,}\)", "(m % 1000) / 500"), (r"\(\s{3,}\)", "(m % 500) / 100"), (r"\(\s{3,}\)", "(m % 100) / 10")],
    "practical-2020-4-java-2": [(r"\(1\)", "3"), (r"\(2\)", "5")],
    "practical-2021-2-java-2": [(r"\(\s{2,}\)", "static")],
    "practical-2025-3-java-2": [(r"____", "super")],
    "practical-2025-3-java-3": [(r"\(____빈칸____\)", "implements")],
    "practical-2020-2-java-1": [(r"____", "new")],
    "practical-2023-3-py-1": [(r"____", "split")],
    # 필기: 빈칸은 정답 보기로, 복원하며 띄어 쓴 비교 연산자(= =)는 붙인다
    "written-2025-1-72": [(r"\(\s{4,}\)", 'scanf("%d", &n);')],
    "written-2025-3-68": [(r"import\s*\(\s*\)", "import java.util")],
    "written-2026-1-75": [(r"=\s=", "=="), (r"=\s=", "==")],
}
STDIN = {"written-2022-3-64": "53t44\n", "written-2025-1-67": "53t44\n", "written-2025-2-67": "53t44\n", "written-2026-1-76": "53t44\n",
         "written-2022-3-80": "c\n", "written-2026-1-71": "c\n", "written-2025-1-72": "5\n",
         "practical-2022-1-c-2": "5\n", "practical-2023-2-c-4": "5\n4\n3\n2\n1\n", "practical-2023-2-c-2": "홍길동\n김철수\n박영희\n", "practical-2026-1-py-1": "HumanDev\n", "practical-2023-3-py-1": "2 3\n"}
NO_MAIN_OK = {"practical-2025-3-java-2", "practical-2025-3-java-3", "practical-2023-3-java-3"}   # main 이 없거나 일부러 틀린 코드: 추적 대상 아님
# 필기에서 추적하지 않는 문항: 오류 찾기(일부러 틀린 코드), "..생략.." 조각, 화면 그리기(turtle), 끝나지 않는 반복
NO_TRACE = {"written-2024-2-62", "written-2025-2-72", "written-2024-3-80", "written-2025-1-79", "written-2023-1-64"}

def strip_linenos(code):
    lines = code.split("\n")
    numbered = sum(1 for l in lines if re.match(r"^\s*\d+\s{2,}", l))
    if numbered >= max(3, len(lines) // 2): return "\n".join(re.sub(r"^\s*\d+\s{2}", "", l) for l in lines)
    return code

def prep_c(code):
    if "main(" not in code: code = "int main() {\n" + code + "\nreturn 0;\n}\n"
    if "#include" not in code: code = "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n" + code
    return code

def split_methods(code):
    """최상위에 섞여 있는 메서드/클래스 정의와 실행문을 분리한다 (중괄호 균형으로 범위를 찾는다)."""
    members, stmts, i, n = [], [], 0, len(code)
    sig = re.compile(r"^[ \t]*(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)+(?:class\s+\w+|interface\s+\w+|[\w<>\[\],.]+\s+\w+\s*\([^)]*\))[^{;]*\{", re.M)
    field = re.compile(r"^[ \t]*(?:(?:public|private|protected|static|final)\s+)+[\w<>\[\],.]+\s+\w+\s*(?:=[^;]*)?;[ \t]*$", re.M)
    for fm in field.finditer(code):
        depth = code[:fm.start()].count("{") - code[:fm.start()].count("}")
        if depth != 0: continue
        members.append(fm.group(0)); code = code[:fm.start()] + " " * (fm.end() - fm.start()) + code[fm.end():]
    pos = 0
    for m in sig.finditer(code):
        if m.start() < pos: continue
        # 중괄호 균형으로 끝 찾기
        depth, j = 0, m.end() - 1
        while j < n:
            if code[j] == "{": depth += 1
            elif code[j] == "}":
                depth -= 1
                if depth == 0: break
            j += 1
        stmts.append(code[pos:m.start()]); members.append(code[m.start():j + 1]); pos = j + 1
    stmts.append(code[pos:])
    return "\n".join(members), "\n".join(s_ for s_ in stmts if s_.strip())

def prep_java(code):
    code = strip_linenos(code)
    has_class = re.search(r"^\s*(public\s+|abstract\s+|final\s+)?(class|interface|enum)\s+\w+", code, re.M) is not None
    has_main = re.search(r"static\s+void\s+main\s*\(", code) is not None
    top_members = re.search(r"^(public\s+static|static\s+\w|private\s+static|public\s+static\s+class|static\s+class|static\s+interface|public\s+static\s+void\s+main)", code, re.M) is not None
    def wrap(inner):   # 감쌀 때 안쪽 클래스는 static 중첩 클래스로 (정적 main 에서 new 할 수 있게)
        inner = re.sub(r"^(\s*)(?:public\s+|private\s+)?(?!static)(class|interface)\s", r"\1static \2 ", inner, flags=re.M)
        return "public class Main {\n" + inner + "\n}\n"
    if not has_class:
        if has_main:
            members, stmts = split_methods(code)
            code = wrap(members) if not stmts.strip() else wrap(members + "\n  public static void main(String[] args) {\n" + stmts + "\n  }\n")
        else:
            members, stmts = split_methods(code)
            code = wrap(members + "\n  public static void main(String[] args) {\n" + stmts + "\n  }\n")
    elif top_members:
        code = wrap(code)
    # public 클래스는 파일명과 같아야 하므로 이름을 알아낸다
    m = re.search(r"public\s+class\s+(\w+)", code)
    pub = m.group(1) if m else None
    mm = None
    for cm in re.finditer(r"(?:^|\n)\s*(?:public\s+|final\s+|abstract\s+)?class\s+(\w+)[^{]*\{", code):
        body_start = cm.end()
        # 이 클래스 본문 안(중첩 포함)에 main 이 있는지: 다음 top-level class 전까지
        nxt = re.search(r"\n(?:public\s+|final\s+|abstract\s+)?class\s+\w+", code[body_start:])
        seg = code[body_start: body_start + (nxt.start() if nxt else len(code))]
        if re.search(r"static\s+void\s+main\s*\(", seg): mm = cm.group(1); break
    main_cls = mm or pub or "Main"
    file_cls = pub or main_cls
    return code, file_cls, main_cls

def statics_of(code):
    """최상위 클래스의 static 필드 이름 (메서드 제외)"""
    names = []
    for m in re.finditer(r"^\s{0,8}(?:public\s+|private\s+|protected\s+)?static\s+(?:final\s+)?[\w<>\[\],\s]+?\s+(\w+)\s*(=|;)", code, re.M):
        names.append(m.group(1))
    return names

shutil.rmtree("build", ignore_errors=True); os.makedirs("build")
metas = []
for it in items:
    if not it.get("lang"): continue
    code = open(it["path"], encoding="utf-8").read()
    for pat, rep in FILL.get(it["id"], []): code = re.sub(pat, rep, code, count=1)
    d = f"build/{it['id']}"; os.makedirs(d)
    meta = {**it, "stdin": STDIN.get(it["id"], ""), "fill": it["id"] in FILL, "skip": it["id"] in NO_MAIN_OK or it["id"] in NO_TRACE}
    if it["lang"] == "c":
        code = prep_c(code); meta["src"] = f"{d}/main.c"
    elif it["lang"] == "java":
        code, file_cls, main_cls = prep_java(code); meta["src"] = f"{d}/{file_cls}.java"; meta["main_cls"] = main_cls; meta["statics"] = statics_of(code)
    else:
        meta["src"] = f"{d}/main.py"
    open(meta["src"], "w", encoding="utf-8").write(code)
    open(f"{d}/stdin.txt", "w", encoding="utf-8").write(meta["stdin"])
    meta["code"] = code
    metas.append(meta)
json.dump(metas, open("build/meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("prepared", len(metas))
