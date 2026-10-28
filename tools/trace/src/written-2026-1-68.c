#include <stdio.h>
main( ) {
    int sum = 0;
    for (int i = 0; i <= 10; i++) {
        if (i % 2 == 0)
            continue;
        sum = sum + i;
    }
    printf("%d", sum);
}
