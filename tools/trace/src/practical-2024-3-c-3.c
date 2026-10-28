#include <stdio.h>
int func(){
    static int x = 0;
    x += 2; return x;
}
int main(){
    int x = 1, sum = 0;
    for(int i = 0; i < 4; i++){
        x++; sum += func();
    }
    printf("%d", sum);
    return 0;
}
