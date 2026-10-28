class A {
    int a;
    private int b;
    protected int c;

    void set(int aa, int bb, int cc) {
        a = aa;
        b = bb;
        c = cc;
    }

    int hap() { return a + b + c; }
}

class B extends A {
    public int hap() { return a * c; }
}

public class Main {
    public static void main(String[] args) {
        A aaa = new A();
        B bbb = new B();

        aaa.set(1, 5, 3);
        bbb.set(10, 30, 50);

        System.out.print(aaa.hap() + bbb.hap());
    }
}
