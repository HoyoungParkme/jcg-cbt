#include <stdio.h>
main() {
    int a = 3, b = 4, c = 5;
    int r1, r2, r3;
    r1 = a < 4 && b <= 4;
    r2 = a > 3 || b <= 5;
    r3 = !c;
    printf("%d", r1 - r2 + r3);
}
