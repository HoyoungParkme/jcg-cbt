public class Test {
    public static void main(String[] args) {
        int x = 7, y = 0;
        while(x-- > 0) {
            if (x%3 == 0)
                continue;
            y++;
        }
        System.out.print(y);
    }
}
