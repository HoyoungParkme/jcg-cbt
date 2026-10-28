#include <stdio.h>
#include <stdlib.h>
typedef struct Data { int value; struct Data *next; } Data;
Data* insert(Data* head, int value){
    Data* n = (Data*)malloc(sizeof(Data));
    n->value = value; n->next = head;
    return n;
}
Data* reconnect(Data* head, int value){
    if(head==NULL || head->value==value) return head;
    Data *prev=NULL, *curr=head;
    while(curr!=NULL && curr->value!=value){
        prev=curr; curr=curr->next;
    }
    if(curr!=NULL && prev!=NULL){
        prev->next=curr->next;
        curr->next=head; head=curr;
    }
    return head;
}
int main(){
    Data *head=NULL, *curr;
    for(int i=1; i<=5; i++) head=insert(head,i);
    head=reconnect(head,3);
    for(curr=head; curr!=NULL; curr=curr->next)
        printf("%d", curr->value);
    return 0;
}
