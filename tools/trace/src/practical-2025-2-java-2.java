public static class Parent {
    public int x(int i) { return i + 2; }
    public static String id() { return "P"; }
}
public static class Child extends Parent {
    public int x(int i) { return i + 3; }
    public String x(String s) { return s + "R"; }
    public static String id() { return "C"; }
}
public static void main(String[] args) {
    Parent ref = new Child();
    System.out.println(ref.x(2) + ref.id());
}
