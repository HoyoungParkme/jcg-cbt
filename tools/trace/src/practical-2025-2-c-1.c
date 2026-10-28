#include <stdio.h>
struct dat { int x; int y; };
int main() {
    struct dat a[] = {{1,2},{3,4},{5,6}};
    struct dat* ptr = a;
    struct dat** pptr = &ptr;
    (*pptr)[1] = (*pptr)[2];
    printf("%d 그리고 %d", a[1].x, a[1].y);
    return 0;
}
