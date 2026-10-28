 1  class Person {
 2      private String name;
 3      public Person(String val) {
 4          name = val;
 5      }
 6      public static String get() {
 7          return name; 
 8      }
 9      public void print() {
10          System.out.println(name);
11      }
12  }
13  public class main {
14      public static void main(String[] args) {
15          Person obj = new Person("Kim");
16          obj.print();
17      }
18  }
