## Code Examples

### JavaScript

```js
function greet(name) {
  return `Hello, ${name}!`
}

const nums = [1, 2, 3].map(n => n * 2)
console.log(greet('World'), nums)
```

### Python

```python
def hello():
    print("hello")


class Counter:
    def __init__(self):
        self.n = 0

    def inc(self):
        self.n += 1
```

### Go

```go
package main

import "fmt"

func main() {
    fmt.Println("hello")
}
```

### TypeScript

```ts
interface User {
  name: string
  age: number
}

const user: User = { name: "Alice", age: 30 }
```

### Plain Text

```
This is a plain text block
without a language specified.
```

### Rust

```rust
fn main() {
    let nums: Vec<i32> = (1..=5).collect();
    let doubled: Vec<i32> = nums.iter().map(|x| x * 2).collect();
    println!("{:?}", doubled);
}

#[derive(Debug)]
struct Point {
    x: f64,
    y: f64,
}
```

### Ruby

```ruby
class Greeter
  def initialize(name)
    @name = name
  end

  def greet
    puts "Hello, #{@name}!"
  end
end

Greeter.new("World").greet
```

### Java

```java
public class Main {
    public static void main(String[] args) {
        List<String> items = Arrays.asList("a", "b", "c");
        items.forEach(System.out::println);
    }
}
```

### C

```c
#include <stdio.h>

int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

int main() {
    printf("5! = %d\n", factorial(5));
    return 0;
}
```

### C++

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> v = {3, 1, 4, 1, 5};
    std::sort(v.begin(), v.end());
    for (int x : v) std::cout << x << ' ';
    return 0;
}
```

### SQL

```sql
SELECT u.name, COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.active = 1
GROUP BY u.id
ORDER BY post_count DESC
LIMIT 10;
```

### Bash

```bash
#!/bin/bash
for file in *.md; do
    echo "Processing $file"
    wc -w "$file"
done
```

### YAML

```yaml
server:
  host: 0.0.0.0
  port: 8080

database:
  driver: sqlite
  path: ./data.db
```

### JSON

```json
{
  "name": "mindstack",
  "version": "1.0.0",
  "dependencies": {
    "vue": "^3.4",
    "@codemirror/view": "^6.22"
  }
}

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev"]
```

### HTML

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Example</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>
```

### CSS

```css
.container {
    display: flex;
    gap: 1rem;
    padding: 2rem;
}

.card {
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```
