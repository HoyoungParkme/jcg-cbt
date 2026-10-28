#include <stdio.h>
main() {
    int a[10];
    a[0] = 0;
    a[1] = 1;
    for (int i = 0; i < 8; i++)
        a[i + 2] = a[i + 1] + a[i];
    printf("%d", a[9]);
}
