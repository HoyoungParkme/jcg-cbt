#include <stdio.h>
int main() {
  int number = 1234;
  int div = 10;
  int result = 0;
  while (number ( ① ) 0) {
    result = result * div;
    result = result + number ( ② ) div;
    number = number ( ③ ) div;
  }
  printf("%d", result);
}
