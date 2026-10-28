import (     ).*;
public class Test {
    public static void main(String[] args) {
        Random rand = new Random( );
        int a[] = new int[6];
        for(int i = 0; i < 6; i++)
            a[i] = rand.nextInt(10);
    }
}
