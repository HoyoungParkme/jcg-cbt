#include <stdio.h>
main() {
    int i = 0;
    while (1) {
        if (i == 4)
            break;
        i++;
    }
    printf("%d", i);
}
