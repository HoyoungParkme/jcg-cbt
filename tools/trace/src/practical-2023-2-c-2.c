#include <stdio.h>
#include <stdlib.h>
char n[30];

char* test() {
  printf("입력하세요 : ");
  gets(n);
  return n;
}

int main() {
  char* test1;
  char* test2;
  char* test3;
  test1 = test();
  test2 = test();
  test3 = test();
  printf("%s\n", test1);
  printf("%s\n", test2);
  printf("%s", test3);
}
