#include <stdio.h>
main() {
    char* s = "Sinagong";
    for (int i = 5; i > 0; i--)
        printf("%c", *(s + i));
}
