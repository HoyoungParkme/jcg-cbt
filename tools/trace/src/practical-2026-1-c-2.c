#include <stdio.h>

struct fns {
    int* (*fn)(int*);
} mine;

int* dummy(int *d) {
    return d + 1;
}

int main() {
    struct fns mine;
    int n[] = {16, 32};
    mine.fn = dummy;
    printf("%x", *mine.fn(n));
    return 0;
}
