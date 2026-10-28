class Parent {
    public void show() {
        System.out.println("Parent");
    }
}

class Child extends Parent {
    public void show() {
        System.out.println("Child");
    }
}

public class good {
    public static void main(String[] args) {
        Parent pa = ____ Child();
        pa.show();
    }
}
