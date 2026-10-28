#include <stdio.h>
int len(char* p);
int main(){
  char* p1 = "2022";
  char* p2 = "202207";
  int a = len(p1);
  int b = len(p2);
  printf("%d", a + b);
}
int len(char* p){
  int r = 0;
  while(*p != '\0'){
    p++;
    r++;
  }
  return r;
}
