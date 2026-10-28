#include <stdio.h>

void fn1(int* i) { *i = 50; }
void fn2(int i) { i = 60; }

void fn34(int* p) {
    printf("3. %d\n", *p);
    printf("4. %d\n", *(p + 3));
}

int main() {
    int i = 30;
    int list[] = {2, 4, 6, 8, 10};

    fn1(&i);
    printf("1. %d\n", i);

    fn2(i);
    printf("2. %d\n", i);

    fn34(list);

    return 0;
}
