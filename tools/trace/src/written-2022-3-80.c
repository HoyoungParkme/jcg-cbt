#include <stdio.h>
main() {
    char ch;
    scanf("%c", &ch);
    switch (ch) {
    case 'a':
        printf("one ");
    case 'b':
        printf("two ");
    case 'c':
        printf("three ");
        break;
    case 'd':
        printf("four ");
        break;
    }
}
