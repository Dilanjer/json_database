# Database Library - Usage Guide

Two standalone TypeScript database implementations with identical APIs but different validation approaches.

## 📦 Files

- **`database.simple.ts`** - Works WITHOUT Zod (simple type validation)
- **`database.zod.ts`** - Works WITH Zod only (strict schema validation)

---

## 🚀 Quick Start

### Option 1: Without Zod (Simple)

```typescript
import { Database } from "./database.simple";

interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
}

const db = new Database<User>({
  fileName: "users",
  schema: {
    id: "number",
    name: "string",
    email: "string",
    age: "number",
  },
});

// Write data
await db.create({ id: 1, name: "Alice", email: "alice@example.com" });

// Read data
const user = await db.find(1);
const allUsers = await db.findAll();
```

### Option 2: With Zod (Strict & Type-Safe)

```typescript
import { z } from "zod";
import { Database } from "./database.zod";

// Define STRICT schema (rejects extra properties)
const userSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0).max(150),
}).strict();  // ✅ Rejects extra properties

type User = z.infer<typeof userSchema>;

const db = new Database({
  fileName: "users",
  zodSchema: userSchema,
});

// Write data with FULL autocomplete
await db.create({ 
  id: 1, 
  name: "Alice", 
  email: "alice@example.com",
  age: 30
});

// Read data
const user = await db.find(1);
const allUsers = await db.findAll();
```

---

## ⭐ What's New in Zod Version

The Zod version has been completely rewritten with:

### ✅ **NO Auto-Generated Values**
You control ALL data. No magic defaults unless YOU add them.

```typescript
// Before (had auto-defaults)
const schema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.date().default(() => new Date())  // Auto-generated
});

// Now (you control everything)
const schema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.date()  // ✅ YOU provide the date
}).strict();
```

### ✅ **FULL TypeScript Autocomplete**
Perfect type inference with `z.input<>` and `z.output<>`.

```typescript
// Full autocomplete on create/update
await db.create({
  id: 1,
  name: "Alice",  // ✅ Autocomplete!
  email: "...",   // ✅ Autocomplete!
});
```

### ✅ **NO Extra Properties Allowed**
Use `.strict()` to catch typos and mistakes.

```typescript
const schema = z.object({
  id: z.number(),
  name: z.string(),
}).strict();

// TypeScript + Zod will both reject this:
await db.create({
  id: 1,
  name: "Alice",
  typo: "oops"  // ❌ Error!
});
```

### ✅ **NO 'any' Types**
Everything is properly typed with generics.

---

## 📝 Configuration

### Simple Version

```typescript
const db = new Database<User>({
  fileName: "users",
  schema: {
    id: "number",
    name: "string",
    email: "string",
  },
  dataDir: "./data",        // Optional (default: "./data")
  persistToFile: true,      // Optional (default: true)
});
```

### Zod Version

```typescript
const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
}).strict();  // ✅ Add .strict() to reject extra properties

const db = new Database({
  fileName: "users",
  zodSchema: userSchema,
  dataDir: "./data",        // Optional (default: "./data")
  persistToFile: true,      // Optional (default: true)
});
```

**Important Notes:**
- Use `.strict()` on your schema to reject extra properties
- Don't specify the generic type parameter for Zod version
- Type inference happens automatically from the schema

---

## 📖 Complete API

Both versions share the exact same API methods.

### Create Operations

```typescript
// Create single record
const user = await db.create({
  id: 1,
  name: "Alice",
  email: "alice@example.com",
});

// Create multiple records
const users = await db.createMany([
  { id: 2, name: "Bob", email: "bob@example.com" },
  { id: 3, name: "Carol", email: "carol@example.com" },
]);

// Upsert (create or update)
const user = await db.upsert({
  id: 1,
  name: "Alice Updated",
  email: "alice@example.com",
});
```

### Read Operations

```typescript
// Find by ID
const user = await db.find(1);

// Find all
const allUsers = await db.findAll();

// Find with condition
const adults = await db.findWhere((user) => user.age >= 18);

// Find first match
const admin = await db.findOne((user) => user.role === "admin");

// Find by field value
const user = await db.findBy("email", "alice@example.com");

// Check existence
const exists = await db.existsById(1);
const hasAdmin = await db.existsWhere((user) => user.role === "admin");
```

### Update Operations

```typescript
// Update record
const updated = await db.update(1, { name: "Alice Smith" });

// Update multiple (Simple version - predicate)
const updated = await db.updateMany(
  (user) => user.active === false,
  { active: true }
);

// Update multiple (Zod version - by IDs)
const updated = await db.updateMany([
  { id: 1, data: { name: "Alice" } },
  { id: 2, data: { name: "Bob" } },
]);

// Increment numeric field
await db.increment(1, "score", 10);

// Safe increment (won't throw on validation error)
const result = await db.safeIncrement(1, "score", 100);

// Toggle boolean field
await db.toggle(1, "active");
```

### Delete Operations

```typescript
// Delete single
const deleted = await db.delete(1);

// Delete multiple (Simple version - predicate)
const count = await db.deleteMany((user) => user.score < 50);

// Delete multiple (Zod version - by IDs)
const count = await db.deleteMany([1, 2, 3]);

// Soft delete
await db.softDelete(1);
await db.restore(1);

// Find active records
const active = await db.findAllActive();

// Clear all
await db.clear();
```

### Aggregation & Statistics

```typescript
// Count
const total = await db.count();
const activeCount = await db.count((user) => user.active);

// Math operations
const totalScore = await db.sum("score");
const avgAge = await db.avg("age");
const minAge = await db.min("age");
const maxAge = await db.max("age");

// Grouping
const byRole = await db.groupBy("role");
for (const [role, users] of byRole) {
  console.log(`${role}: ${users.length} users`);
}
```

### Sorting & Pagination

```typescript
// Sort
const sorted = await db.findAllSorted("age", "desc");
// or
const sorted = await db.sortBy("age", "desc");

// Paginate
const page = await db.paginate(1, 10);
console.log(page.data);          // Records
console.log(page.totalRecords);   // Total count
console.log(page.totalPages);     // Total pages
```

### Other Operations

```typescript
// Search (case-insensitive)
const results = await db.search("name", "alice");

// Random sampling
const randomUser = await db.random();
const sample = await db.sample(5);

// Export/Import
const json = await db.exportToJSON();
await db.importFromJSON(json);

// File operations
await db.saveToFile();
await db.loadFromFile();
await db.flush();
```

---

## 🔍 Key Differences

### Simple Version (`database.simple.ts`)

**Pros:**
- ✅ No dependencies (except Bun)
- ✅ Simpler setup
- ✅ Faster validation
- ✅ Good for prototypes

**Cons:**
- ❌ Basic validation only
- ❌ No email/URL validation
- ❌ No transformations
- ❌ No date handling

**Use when:**
- Prototyping or small projects
- You control all data sources
- You want zero dependencies
- Performance is absolutely critical

### Zod Version (`database.zod.ts`)

**Pros:**
- ✅ Strict type safety (no `any`)
- ✅ Full autocomplete
- ✅ Powerful validation (email, URL, regex, etc.)
- ✅ Date serialization/deserialization
- ✅ Rejects extra properties (with `.strict()`)
- ✅ Safe validation (`safeValidate()`)

**Cons:**
- ❌ Requires Zod dependency
- ❌ Slightly slower (validation overhead)
- ❌ More setup required

**Use when:**
- Production applications
- Handling user input
- You need complex validation
- You work with dates
- Type safety is important

---

## 💡 Advanced Examples

### Example 1: Simple Todo App

```typescript
import { Database } from "./database.simple";

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  priority: number;
}

const db = new Database<Todo>({
  fileName: "todos",
  schema: {
    id: "number",
    text: "string",
    completed: "boolean",
    priority: "number",
  },
});

// Add todos
await db.create({
  id: 1,
  text: "Buy groceries",
  completed: false,
  priority: 2,
});

// Find high-priority incomplete tasks
const urgent = await db.findWhere(
  (todo) => !todo.completed && todo.priority >= 8
);
```

### Example 2: Zod with Dates (Manual Control)

```typescript
import { z } from "zod";
import { Database } from "./database.zod";

// ✅ No auto-defaults - you provide everything
const eventSchema = z.object({
  id: z.number(),
  title: z.string(),
  date: z.date(),
  createdAt: z.date(),  // ✅ YOU provide this
}).strict();

const db = new Database({
  fileName: "events",
  zodSchema: eventSchema,
});

// You control all values
await db.create({
  id: 1,
  title: "Conference",
  date: new Date("2024-06-01"),
  createdAt: new Date(),  // ✅ You set this
});

// Dates automatically serialized to JSON
await db.flush();

// Dates automatically deserialized from JSON
await db.loadFromFile();
const event = await db.find(1);
console.log(event.date instanceof Date);  // true
```

### Example 3: Zod with Strict Validation

```typescript
import { z } from "zod";
import { Database } from "./database.zod";

const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  username: z.string().min(3).max(20),
  age: z.number().min(13).max(150),
  score: z.number().min(0).max(1000),
}).strict();  // ✅ Rejects extra properties

const db = new Database({
  fileName: "users",
  zodSchema: userSchema,
});

// ✅ Valid - creates successfully
await db.create({
  id: 1,
  email: "alice@example.com",
  username: "alice",
  age: 25,
  score: 500,
});

// ❌ Invalid - Zod rejects
try {
  await db.create({
    id: 2,
    email: "not-an-email",  // Invalid email
    username: "ab",          // Too short
    age: 10,                 // Too young
    score: 1500,             // Too high
  });
} catch (error) {
  console.error(error.message);
  // "Validation failed: email: Invalid email, username: String must..."
}

// ✅ Safe validation (doesn't throw)
const result = db.safeValidate({
  id: 3,
  email: "test@example.com",
  username: "test",
  age: 20,
  score: 999,
  extraField: "oops"  // Extra field
});

if (!result.success) {
  console.log("Validation errors:", result.error.errors);
}
```

### Example 4: Zod with Transformations

```typescript
const userSchema = z.object({
  id: z.number(),
  email: z.string().email().transform(v => v.toLowerCase()),
  username: z.string().min(3).regex(/^[a-z0-9_]+$/),
  role: z.enum(["user", "admin", "moderator"]),
}).strict();

const db = new Database({
  fileName: "users",
  zodSchema: userSchema,
});

// Email automatically lowercased
const user = await db.create({
  id: 1,
  email: "ALICE@EXAMPLE.COM",  // Stored as "alice@example.com"
  username: "alice_01",
  role: "user",
});

console.log(user.email);  // "alice@example.com"
```

---

## ⚠️ Error Handling

### Simple Version

```typescript
try {
  await db.create({
    id: 1,
    name: 123,  // Wrong type
    email: "test@example.com",
  });
} catch (error) {
  console.error(error.message);
  // "Schema validation failed: name should be string, got number"
}
```

### Zod Version

```typescript
try {
  await db.create({
    id: 1,
    name: "",           // Too short
    email: "invalid",   // Invalid email
  });
} catch (error) {
  console.error(error.message);
  // "Validation failed: name: String must contain at least 1 character(s), 
  //  email: Invalid email"
}

// Safe validation (doesn't throw)
const result = db.safeValidate(data);
if (!result.success) {
  result.error.errors.forEach((err) => {
    console.log(`${err.path.join(".")}: ${err.message}`);
  });
}
```

---

## 🎯 Choosing Between Simple and Zod

| Feature                | Simple    | Zod          |
| ---------------------- | --------- | ------------ |
| Type validation        | ✅ Basic  | ✅ Advanced  |
| Full autocomplete      | ✅        | ✅           |
| Email validation       | ❌        | ✅           |
| URL validation         | ❌        | ✅           |
| Min/max validation     | ❌        | ✅           |
| Regex patterns         | ❌        | ✅           |
| Transformations        | ❌        | ✅           |
| Date serialization     | ❌        | ✅ Automatic |
| Strict mode            | ❌        | ✅           |
| Custom refinements     | ❌        | ✅           |
| No 'any' types         | ✅        | ✅           |
| Dependencies           | None      | Zod          |
| Performance            | Faster    | Slightly slower |
| Learning curve         | Easy      | Moderate     |

**Rule of thumb:**
- Use **Simple** for prototypes, small projects, or when you control all data
- Use **Zod** for production apps, user input, or complex validation needs

---

## 🔧 TypeScript Tips

### Zod Version - Perfect Type Inference

```typescript
const schema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
}).strict();

const db = new Database({
  fileName: "users",
  zodSchema: schema,
});

// ✅ Full autocomplete
await db.create({
  id: 1,
  name: "Alice",  // Autocomplete shows this field!
  email: "...",   // Autocomplete shows this field!
});

// ✅ TypeScript catches errors
await db.create({
  id: 1,
  name: "Alice",
  emial: "typo"  // ❌ TypeScript error!
});

// ✅ Predicate functions are fully typed
const adults = await db.findWhere((user) => {
  return user.age >= 18;  // ✅ 'age' is known
});
```

---

## 📦 Installation

```bash
# For database.simple.ts
# No installation needed (only requires Bun)

# For database.zod.ts
bun add zod
```

---

## 🤝 API Compatibility

Both files maintain **100% API compatibility**:

### Identical Methods
- `create()`, `find()`, `findAll()`, `update()`, `delete()`, `clear()`, `upsert()`
- `findBy()`, `findWhere()`, `findOne()`
- `existsById()`, `exists()`, `existsWhere()`
- `count()`, `createMany()`, `updateMany()`, `deleteMany()`
- `findAllSorted()`, `sortBy()`, `paginate()`
- `sum()`, `avg()`, `min()`, `max()`, `groupBy()`
- `random()`, `sample()`
- `increment()`, `safeIncrement()`, `toggle()`
- `exportToJSON()`, `importFromJSON()`
- `search()`, `softDelete()`, `restore()`, `findAllActive()`
- `saveToFile()`, `loadFromFile()`, `flush()`, `getMemoryStore()`

### Zod-Only Methods
- `safeValidate()` - Safe validation without throwing errors
- `getSchema()` - Returns the Zod schema

### Minor Differences
- **updateMany**: Simple uses predicate, Zod uses array of updates
- **deleteMany**: Simple uses predicate, Zod uses array of IDs

You can easily switch between them by changing just the import and configuration!

---

## 📄 License

These files are provided as-is for your use.