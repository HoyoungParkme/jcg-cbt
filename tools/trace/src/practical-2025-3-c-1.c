#include <stdio.h>
int main(void) {
    char str[] = "REPUBLICOFKOREA";
    int a = 0;
    while (str[a] != '\0') ++a;
    putchar(str[a - 2]);
    return 0;
}
