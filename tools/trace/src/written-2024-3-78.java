public class Test {
    public static void main(String args[]) {
        String str = "Message Queueing";
        char s[] = str.toCharArray();
        int r = 0;
        for (char c:s)
            if (c == 'e')
                r++;
        System.out.print(r);
    }
}
