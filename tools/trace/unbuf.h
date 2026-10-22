#include <stdio.h>
__attribute__((constructor)) static void __unbuf(void){ setvbuf(stdout, NULL, _IONBF, 0); }
