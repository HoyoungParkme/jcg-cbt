#include <stdio.h>
#include <stdlib.h>
void set(int** arr, int* data, int rows, int cols){
    for(int i=0; i<rows*cols; ++i)
        arr[((i+1)/rows)%rows][(i+1)%cols] = data[i];
}
int main(){
    int rows=3, cols=3, sum=0;
    int data[] = {5,2,7,4,1,8,3,6,9};
    int** arr;
    arr = (int**)malloc(sizeof(int*)*rows);
    for(int i=0; i<cols; i++)
        arr[i] = (int*)malloc(sizeof(int)*cols);
    set(arr, data, rows, cols);
    for(int i=0; i<rows*cols; i++)
        sum += arr[i/rows][i%cols] * (i%2==0 ? 1 : -1);
    for(int i=0; i<rows; i++) free(arr[i]);
    free(arr);
    printf("%d", sum);
}
