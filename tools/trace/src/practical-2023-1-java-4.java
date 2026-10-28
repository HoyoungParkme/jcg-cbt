public class Sort {
  public static void swap(int[] arr, int idx1, int idx2) {
    int temp = arr[idx1];
    arr[idx1] = arr[idx2];
    arr[(  ①  )] = temp;
  }

  public static void Usort(int[] array, int length) {
    for (int i = 0; i < length; i++) {
      for (int j = 0; j < length - i - 1; j++) {
        if (array[j] > array[j + 1]) {
          swap(array, j, j + 1);
        }
      }
    }
  }

  public static void main(String[] args) {
    int[] item = new int[] { 5, 3, 8, 1, 2, 7 };
    int nx = 6;
    Usort(item, (  ②  ));
    for (int data : item) {
      System.out.print(data + " ");
    }
  }
}
