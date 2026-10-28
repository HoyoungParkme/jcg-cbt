class Base {
    int x = 3;
    int getX() { return x * 2; }
}
class Derivate extends Base {
    int x = 7;
    int getX() { return x * 3; }
}
public class Main {
    public static void main(String[] args) {
        Base a = new Derivate();
        Derivate b = new Derivate();
        System.out.print(
            a.getX() + a.x + b.getX() + b.x);
    }
}
