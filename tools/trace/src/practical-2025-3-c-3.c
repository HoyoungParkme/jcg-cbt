#include <stdio.h>
int main() {
    int x=7, y=4, z;
    z = y%3<3 ? 2 : 1;
    z = z & z >> 1;
    z = x>5 && z<=3 ? z*x : z/x;
    printf("%d", z);
    return 0;
}
