#include <stdio.h>
struct Test {
    int i;
    const char *g;
};
int main() {
    struct Test test[] = {{1,"AB"},{2,"DC"},{3,"EB"}};
    struct Test *p = &test[1];
    printf("%s", p->g + (p->i - 1));
    return 0;
}
