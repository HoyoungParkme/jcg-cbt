#include <stdio.h>
#include <string.h>
void sumFn(char* d, const char* s){
    while(*s){ *d = *s; d++; s++; }
    *d = '\0';
}
int main(){
    const char* str1 = "first";
    char str2[50] = "teststring";
    int result = 0;
    sumFn(str2, str1);
    for(int i = 0; str2[i] != '\0'; i++) result += i;
    printf("%d", result);
    return 0;
}
