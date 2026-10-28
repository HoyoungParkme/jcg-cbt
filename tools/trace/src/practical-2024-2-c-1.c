#include <stdio.h>
struct node { int n1; struct node *n2; };
int main() {
    struct node a = {10, NULL};
    struct node b = {20, NULL};
    struct node c = {30, NULL};
    struct node *head = &a;
    a.n2 = &b; b.n2 = &c;
    printf("%d\n", head->n2->n1);
    return 0;
}
