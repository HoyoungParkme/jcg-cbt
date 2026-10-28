#include <stdio.h>
int main() {
  int field[4][4] = {{0,1,0,1},{0,0,0,1},{1,1,1,0},{0,1,1,1}};
  int mines[4][4] = {0};
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      for (int di = -1; di <= 1; di++) {
        for (int dj = -1; dj <= 1; dj++) {
          int ni = i + di, nj = j + dj;
          if (ni >= 0 && ni < 4 && nj >= 0 && nj < 4)
            mines[i][j] += field[ni][nj];
        }
      }
    }
  }
}
