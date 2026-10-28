#include <stdio.h>
char Data[5] = {'B','A','D','E'};
char c;
int main(){
    int i, temp, temp2;
    c = 'C';
    printf("%d\n", Data[3] - Data[1]);
    for(i=0; i<5; ++i)
        if(Data[i] > c) break;
    temp = Data[i]; Data[i] = c; i++;
    for(; i<5; ++i){
        temp2 = Data[i]; Data[i] = temp; temp = temp2;
    }
    for(i=0; i<5; i++) printf("%c", Data[i]);
}
