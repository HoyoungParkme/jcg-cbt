#include <stdio.h>
int main() {
    int v1 = 0, v2 = 35, v3 = 29;
    if(v1 > v2 ? v2 : v1){
        v2 = v2 << 2;
    }else{
        v3 = v3 << 2;
    }
    printf("%d", v2 + v3);
}
