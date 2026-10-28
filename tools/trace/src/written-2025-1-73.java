public class ovr {
    public static void main(String[ ] args) {
        int a = 1, b = 2, c = 3, d = 4;
        int mx, mn;
        mx = a < b ? b : a;
        if (mx == 1) {
            mn = a > mx ? b : a;
        }
        else {
            mn = b < mx ? d : c;
        }
        System.out.println(mn);
    }
}
