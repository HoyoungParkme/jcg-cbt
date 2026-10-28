class A {
    private int a;

    public A(int a) {
        this.a = a;
    }

    void print() {
        System.out.print(a + "a");
    }
}

class B extends A {
    private int b;

    B(int a, int b) {
        super(a);
        this.b = b;
    }

    void print() {
        super.print();
        System.out.print(b + "b");
    }
}

public class Main {
    public static void main(String[] args) {
        B obj = new B(10, 20);
        obj.print();
    }
}
