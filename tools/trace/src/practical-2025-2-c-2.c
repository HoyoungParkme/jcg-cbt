#include <stdio.h>
#include <stdlib.h>
struct node { char c; struct node* p; };
struct node* func(char* s){
    struct node* h=NULL, *n;
    while(*s){
        n = malloc(sizeof(struct node));
        n->c = *s++; n->p = h; h = n;
    }
    return h;
}
int main(){
    struct node* n = func("BEST");
    while(n){
        putchar(n->c);
        struct node* t = n; n = n->p; free(t);
    }
    return 0;
}
