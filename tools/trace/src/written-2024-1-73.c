#include <stdio.h>
main() {
    int sum = 0;
    for (int i = 1; i < 20; i *= 2)
        sum += i;
    printf("%d", sum);
}
