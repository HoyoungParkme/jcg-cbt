public static void main(String[] args) {
    int a = 5, b = 0;
    try {
        System.out.print(a / b);
    } catch(ArithmeticException e) {
        System.out.print("출력1");
    } catch(ArrayIndexOutOfBoundsException e) {
        System.out.print("출력2");
    } catch(NumberFormatException e) {
        System.out.print("출력3");
    } catch(Exception e) {
        System.out.print("출력4");
    } finally {
        System.out.print("출력5");
    }
}
