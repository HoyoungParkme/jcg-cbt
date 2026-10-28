class Parent {
    int x, y;
    Parent(int x, int y) { // ①
        this.x = x; this.y = y;
    }
    int getT() { // ②
        return x * y;
    }
}
class Child extends Parent {
    int x;
    Child(int x) { // ③
        super(x+1, x); this.x = x;
    }
    int getT(int n) { // ④
        return super.getT() + n;
    }
}
class Main {
    public static void main(String[] args) { // ⑤
        Parent parent = new Child(3); // ⑥
        System.out.println(parent.getT()); // ⑦
    }
}
