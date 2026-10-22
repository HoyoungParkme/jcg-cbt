// Java 실행 추적기 (JDI 사용). 대상 프로그램을 디버그 모드로 띄워 한 줄씩 step 하면서
// 스택 프레임의 지역변수, 참조된 객체의 필드, 사용자 클래스의 static 필드, 지금까지의 출력을 JSON 으로 기록한다.
// 사용: java JdiTrace <classpath> <MainClass> <stdin파일|-> <maxSteps>   → JSON 을 표준출력으로
import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class JdiTrace {
    static StringBuilder out = new StringBuilder();           // 프로그램 표준출력 누적
    static List<String> steps = new ArrayList<>();
    static Map<Long, String> objs = new LinkedHashMap<>();    // 객체 id → JSON 조각
    static int maxSteps = 400;
    static String pendingRet = null;                          // 방금 끝난 메서드의 {"n":이름,"x":반환값} — 다음 스냅샷에 붙인다

    static String q(String s) {   // JSON 문자열 이스케이프
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': b.append("\\\""); break; case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break; case '\r': b.append("\\r"); break; case '\t': b.append("\\t"); break;
                default: if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }
    static boolean userType(String name) {
        return !(name.startsWith("java.") || name.startsWith("javax.") || name.startsWith("sun.") || name.startsWith("jdk.") || name.startsWith("com.sun."));
    }
    static String shortType(String t) { int i = t.lastIndexOf('.'); return i >= 0 ? t.substring(i + 1) : t; }

    // 값 → 표시 문자열. 객체는 "→@id" 로 참조하고 objs 에 필드를 기록한다 (depth 로 중첩 제한)
    static String val(Value v, int depth) {
        if (v == null) return "null";
        if (v instanceof StringReference) return q(((StringReference) v).value()).replace("\"", "'");
        if (v instanceof PrimitiveValue) {
            if (v instanceof CharValue) { char c = ((CharValue) v).value(); return "'" + c + "'(" + (int) c + ")"; }
            return v.toString();
        }
        if (v instanceof ArrayReference) {
            ArrayReference a = (ArrayReference) v; long id = a.uniqueID();
            if (!objs.containsKey(id)) {
                objs.put(id, null);
                List<Value> vals = a.getValues(); StringBuilder b = new StringBuilder("[");
                for (int i = 0; i < Math.min(vals.size(), 30); i++) { if (i > 0) b.append(","); b.append(q(val(vals.get(i), depth + 1))); }
                if (vals.size() > 30) b.append(",\"…\"");
                b.append("]");
                objs.put(id, "{\"t\":" + q(shortType(a.referenceType().name())) + ",\"v\":" + b + ",\"n\":" + vals.size() + "}");
            }
            return "@" + id;
        }
        if (v instanceof ObjectReference) {
            ObjectReference o = (ObjectReference) v; long id = o.uniqueID(); String tn = o.referenceType().name();
            if (!userType(tn)) {
                // 라이브러리 객체(ArrayList 등)는 toString 비슷하게 간단히
                if (!objs.containsKey(id)) objs.put(id, "{\"t\":" + q(shortType(tn)) + ",\"v\":\"(라이브러리 객체)\"}");
                return "@" + id;
            }
            if (!objs.containsKey(id)) {
                objs.put(id, null);
                StringBuilder b = new StringBuilder("{");
                boolean first = true;
                List<Field> fields = new ArrayList<>();
                for (Field f : o.referenceType().allFields()) if (!f.isStatic()) fields.add(f);
                Map<String, Integer> cnt = new HashMap<>();
                for (Field f : fields) cnt.merge(f.name(), 1, Integer::sum);
                // 부모 필드부터(위쪽 클래스가 먼저) 쓰고, 이름이 겹치면 "A.x" 처럼 클래스 접두어를 붙인다
                java.util.Collections.reverse(fields);
                for (Field f : fields) {
                    if (!first) b.append(","); first = false;
                    Value fv = null; try { fv = o.getValue(f); } catch (Exception e) {}
                    String nm = cnt.get(f.name()) > 1 ? shortType(f.declaringType().name()) + "." + f.name() : f.name();
                    b.append(q(nm)).append(":").append(q(depth < 3 ? val(fv, depth + 1) : "…"));
                }
                b.append("}");
                objs.put(id, "{\"t\":" + q(shortType(tn)) + ",\"v\":" + b + "}");
            }
            return "@" + id;
        }
        return v.toString();
    }

    static String snapshot(ThreadReference th, String ev, VirtualMachine vm) {
        StringBuilder frames = new StringBuilder("[");
        int line = 0;
        try {
            List<StackFrame> fs = th.frames();
            List<String> parts = new ArrayList<>();
            for (int i = fs.size() - 1; i >= 0; i--) {     // 오래된 프레임부터
                StackFrame f = fs.get(i); Location loc = f.location();
                if (!userType(loc.declaringType().name())) continue;
                StringBuilder vars = new StringBuilder("[");
                try {
                    boolean first = true;
                    ObjectReference self = f.thisObject();
                    if (self != null) { vars.append("{\"k\":\"this\",\"t\":").append(q(shortType(self.referenceType().name()))).append(",\"x\":").append(q(val(self, 0))).append("}"); first = false; }
                    for (LocalVariable lv : f.visibleVariables()) {
                        Value v = null; try { v = f.getValue(lv); } catch (Exception e) { continue; }
                        if (!first) vars.append(","); first = false;
                        vars.append("{\"k\":").append(q(lv.name())).append(",\"t\":").append(q(shortType(lv.typeName()))).append(",\"x\":").append(q(val(v, 0))).append("}");
                    }
                } catch (AbsentInformationException e) { }
                vars.append("]");
                String name = shortType(loc.declaringType().name()) + "." + loc.method().name();
                parts.add("{\"n\":" + q(name) + ",\"l\":" + loc.lineNumber() + ",\"v\":" + vars + "}");
                if (i == 0) line = loc.lineNumber();
            }
            frames.append(String.join(",", parts));
        } catch (IncompatibleThreadStateException e) { }
        frames.append("]");
        // static 필드 (사용자 클래스)
        StringBuilder st = new StringBuilder("[");
        boolean first = true;
        for (ReferenceType rt : vm.allClasses()) {
            if (!userType(rt.name()) || !rt.isInitialized()) continue;
            for (Field f : rt.allFields()) {
                if (!f.isStatic() || f.isSynthetic()) continue;
                Value v = null; try { v = rt.getValue(f); } catch (Exception e) { continue; }
                if (!first) st.append(","); first = false;
                st.append("{\"k\":").append(q(shortType(rt.name()) + "." + f.name())).append(",\"t\":").append(q(shortType(f.typeName()))).append(",\"x\":").append(q(val(v, 0))).append("}");
            }
        }
        st.append("]");
        StringBuilder heap = new StringBuilder("{");
        first = true;
        for (Map.Entry<Long, String> e : objs.entrySet()) {
            if (e.getValue() == null) continue;
            if (!first) heap.append(","); first = false;
            heap.append(q("@" + e.getKey())).append(":").append(e.getValue());
        }
        heap.append("}");
        objs.clear();   // 매 스냅샷마다 도달 가능한 객체만 다시 모은다
        String ret = pendingRet != null ? ",\"r\":" + pendingRet : ""; pendingRet = null;
        return "{\"l\":" + line + ",\"e\":" + q(ev) + ",\"f\":" + frames + ",\"h\":" + heap + ",\"s\":" + st + ret + ",\"o\":" + q(out.toString()) + "}";
    }

    public static void main(String[] args) throws Exception {
        String cp = args[0], mainCls = args[1], stdinFile = args[2]; maxSteps = Integer.parseInt(args[3]);
        VirtualMachineManager vmm = Bootstrap.virtualMachineManager();
        LaunchingConnector lc = vmm.defaultConnector();
        Map<String, Connector.Argument> cargs = lc.defaultArguments();
        cargs.get("main").setValue(mainCls);
        cargs.get("options").setValue("-cp " + cp + " -Dfile.encoding=UTF-8");
        VirtualMachine vm = lc.launch(cargs);
        Process proc = vm.process();
        // 표준입력 공급, 표준출력 수집
        if (!stdinFile.equals("-")) { try (OutputStream os = proc.getOutputStream()) { os.write(java.nio.file.Files.readAllBytes(new File(stdinFile).toPath())); } }
        else proc.getOutputStream().close();
        Thread reader = new Thread(() -> {
            try (InputStream is = proc.getInputStream()) {
                byte[] buf = new byte[4096]; int n;
                while ((n = is.read(buf)) > 0) synchronized (out) { out.append(new String(buf, 0, n, StandardCharsets.UTF_8)); }
            } catch (IOException e) { }
        });
        reader.setDaemon(true); reader.start();
        Thread err = new Thread(() -> { try (InputStream is = proc.getErrorStream()) { byte[] b = new byte[4096]; while (is.read(b) > 0) {} } catch (IOException e) {} });
        err.setDaemon(true); err.start();

        EventRequestManager erm = vm.eventRequestManager();
        ClassPrepareRequest cpr = erm.createClassPrepareRequest(); cpr.addClassFilter(mainCls); cpr.enable();
        String status = "ok"; StepRequest step = null; boolean done = false;
        EventQueue queue = vm.eventQueue();
        while (!done) {
            EventSet set;
            try { set = queue.remove(20000); } catch (InterruptedException e) { break; }
            if (set == null) { status = "timeout"; break; }
            for (Event ev : set) {
                if (ev instanceof MethodExitEvent) {
                    MethodExitEvent me = (MethodExitEvent) ev; Method m = me.method();
                    if (!m.isConstructor() && !m.isStaticInitializer() && !m.isSynthetic() && !m.name().equals("main") && vm.canGetMethodReturnValues()) {
                        try { Value rv = me.returnValue(); if (rv != null && !(rv instanceof VoidValue)) pendingRet = "{\"n\":" + q(m.name()) + ",\"x\":" + q(val(rv, 0)) + "}"; } catch (Exception e) { }
                    }
                }
            }
            for (Event ev : set) {
                if (ev instanceof ClassPrepareEvent) {
                    ReferenceType rt = ((ClassPrepareEvent) ev).referenceType();
                    for (Method m : rt.methodsByName("main")) { BreakpointRequest br = erm.createBreakpointRequest(m.location()); br.enable(); }
                } else if (ev instanceof BreakpointEvent) {
                    ThreadReference th = ((BreakpointEvent) ev).thread();
                    Thread.sleep(5);
                    steps.add(snapshot(th, "call", vm));
                    step = erm.createStepRequest(th, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                    for (String ex : new String[]{"java.*", "javax.*", "sun.*", "com.sun.*", "jdk.*"}) step.addClassExclusionFilter(ex);
                    step.enable();
                    // 사용자 메서드가 끝날 때 반환값을 받기 위한 요청
                    MethodExitRequest mer = erm.createMethodExitRequest(); mer.addThreadFilter(th);
                    for (String ex : new String[]{"java.*", "javax.*", "sun.*", "com.sun.*", "jdk.*"}) mer.addClassExclusionFilter(ex);
                    mer.enable();
                } else if (ev instanceof StepEvent) {
                    ThreadReference th = ((StepEvent) ev).thread();
                    Thread.sleep(3);   // 출력 파이프가 따라올 시간
                    steps.add(snapshot(th, "line", vm));
                    if (steps.size() >= maxSteps) { status = "truncated"; step.disable(); done = true; }
                } else if (ev instanceof VMDeathEvent || ev instanceof VMDisconnectEvent) { done = true; }
            }
            if (!done) set.resume(); else try { vm.resume(); } catch (Exception e) {}
        }
        try { vm.dispose(); } catch (Exception e) {}
        try { proc.waitFor(); } catch (Exception e) {}
        try { reader.join(1000); } catch (Exception e) {}
        steps.add("{\"l\":0,\"e\":\"end\",\"f\":[],\"h\":{},\"s\":[],\"o\":" + q(out.toString()) + "}");
        System.out.println("{\"lang\":\"java\",\"status\":" + q(status) + ",\"out\":" + q(out.toString()) + ",\"steps\":[" + String.join(",", steps) + "]}");
    }
}
