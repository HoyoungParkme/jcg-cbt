#include <stdio.h>

typedef struct N {
    int v;
    struct N* a;
    struct N* b;
} N;

int c = 0;
int ans = 0;

void pst(N *n) {
    if (!n) return;
    pst(n->a);
    pst(n->b);
    if (++c == 3) ans = n->v;
}

int main() {
    N ne = {35, 0, 0};
    N nd = {64, 0, 0};
    N nc = {53, 0, 0};
    N nb = {12, &ne, &nc};
    N na = {21, &nb, &nd};

    pst(&na);
    printf("%d\n", ans);
    return 0;
}
