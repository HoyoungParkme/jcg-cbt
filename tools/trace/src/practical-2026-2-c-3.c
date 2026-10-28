#include <stdio.h>

int c(int n) {
    if (n <= 1) return n;
    return c(n - 1) + c(n - 3);
}

int main() {
    printf("%d", c(5));
    return 0;
}
