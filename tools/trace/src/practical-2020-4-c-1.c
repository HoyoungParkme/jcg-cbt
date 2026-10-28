#include <stdio.h>

void main() {
    char *p = "KOREA";
    printf("%s\n", p);
    printf("%s\n", p + 3);
    printf("%c\n", *p);
    printf("%c\n", *(p + 3));
    printf("%c\n", *p + 2);
}
