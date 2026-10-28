class Rectangle {
    int width, height;
    Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }
}
class Square extends Rectangle {
    Square(int a) {
        ____(a, a);  // ← 빈칸
    }
    int getSquareArea() {
        return width * height;
    }
}
