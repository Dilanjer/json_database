# JSON Database v2

A high-performance, feature-rich TypeScript-based JSON database with advanced query capabilities, batch operations, and comprehensive aggregation functions. Built for Bun runtime with async operations and schema validation.

## ✨ Features

- 🚀 **Ultra High Performance**: Optimized with Map data structure for O(1) operations
- 💾 **Optional Persistence**: Async file writing with automatic debouncing
- 📝 **Schema Validation**: Type-safe operations with runtime validation
- 🔍 **Advanced Query Methods**: findBy, findWhere, findOne, search, exists
- 📊 **Comprehensive CRUD**: Create, Read, Update, Delete, and Upsert
- 🔄 **Batch Operations**: createMany, updateMany, deleteMany
- 📑 **Sorting & Pagination**: findAllSorted, paginate with metadata
- 🔢 **Aggregation Functions**: sum, avg, min, max, groupBy
- 🎲 **Random & Sampling**: random, sample for statistical operations
- 🔄 **Advanced Updates**: increment, toggle for atomic operations
- 📤 **Export & Import**: JSON export/import capabilities
- 🔍 **Full-text Search**: Search across string fields
- 🗑️ **Soft Delete**: Optional soft delete with restore functionality
- 📊 **Benchmark Proven**: Tested with 100K+ records across all operations
- 🛡️ **TypeScript Support**: Full type safety and IntelliSense

## Installation

```bash
bun install
```

## Quick Start

```typescript
import { Database } from './db';

// Define your data schema
interface User {
  id: string;
  name: string;
  age: number;
  email: string;
  role: 'user' | 'admin' | 'moderator';
  score: number;
  active: boolean;
  deleted?: boolean;
}

// Create database instance
const db = new Database<User>({
  fileName: 'users',
  schema: {
    id: 'string',
    name: 'string',
    age: 'number',
    email: 'string',
    role: 'string',
    score: 'number',
    active: 'boolean',
    deleted: 'boolean'
  },
  dataDir: './data',           // Optional: defaults to './data'
  persistToFile: true          // Optional: defaults to true
});

// Basic CRUD operations
const user = await db.create({
  id: '1',
  name: 'John Doe',
  age: 30,
  email: 'john@example.com',
  role: 'user',
  score: 100,
  active: true
});

// Advanced queries
const admin = await db.findBy('role', 'admin');
const adults = await db.findWhere(user => user.age >= 18);
const firstActive = await db.findOne(user => user.active);
const exists = await db.exists('1');
const userCount = await db.count();
const activeCount = await db.count(user => user.active);

// Batch operations
const users: User[] = [
  { id: '2', name: 'Jane', age: 25, email: 'jane@example.com', role: 'user', score: 150, active: true },
  { id: '3', name: 'Bob', age: 35, email: 'bob@example.com', role: 'admin', score: 200, active: true }
];
await db.createMany(users);
await db.updateMany(user => user.role === 'user', { score: 175 });
await db.deleteMany(user => user.age < 18);

// Sorting and pagination
const sortedByAge = await db.findAllSorted('age', 'desc');
const page1 = await db.paginate(1, 10); // page 1, 10 items per page

// Aggregation
const totalScore = await db.sum('score');
const avgAge = await db.avg('age');
const maxScore = await db.max('score');
const minAge = await db.min('age');
const groupedByRole = await db.groupBy('role');

// Random and sampling
const randomUser = await db.random();
const sampleUsers = await db.sample(10);

// Advanced updates
await db.increment('1', 'score', 50);
await db.toggle('1', 'active');

// Search
const searchResults = await db.search('name', 'john');

// Export/Import
const jsonData = await db.exportToJSON();
await db.importFromJSON(jsonData);

// Soft delete (if 'deleted' field in schema)
await db.softDelete('1');
await db.restore('1');
const activeUsers = await db.findAllActive();
```

## API Reference

### Constructor Options

```typescript
interface DatabaseConfig {
  fileName: string;           // Database filename (without .json extension)
  schema: Schema;             // Schema definition for validation
  dataDir?: string;           // Directory for JSON files (default: './data')
  persistToFile?: boolean;    // Enable/disable file persistence (default: true)
}

interface Schema {
  [key: string]: "string" | "number" | "boolean" | "object" | "array";
}
```

### Basic CRUD Methods

- **`create(data: T): Promise<T>`** - Create a new record
- **`find(id: string | number): Promise<T | null>`** - Find a record by ID
- **`findAll(): Promise<T[]>`** - Get all records
- **`update(id: string | number, updates: Partial<T>): Promise<T | null>`** - Update a record
- **`delete(id: string | number): Promise<boolean>`** - Delete a record
- **`upsert(data: T): Promise<T>`** - Create or update a record
- **`clear(): Promise<void>`** - Clear all records

### Advanced Query Methods

- **`findBy<K extends keyof T>(key: K, value: T[K]): Promise<T | null>`** - Find first record by field value
- **`findWhere(predicate: (item: T) => boolean): Promise<T[]>`** - Find records matching condition
- **`findOne(predicate: (item: T) => boolean): Promise<T | null>`** - Find first record matching condition
- **`search<K extends keyof T>(key: K, searchTerm: string): Promise<T[]>`** - Search within string fields
- **`exists(id: string | number): Promise<boolean>`** - Check if record exists by ID
- **`existsWhere(predicate: (item: T) => boolean): Promise<boolean>`** - Check if any record matches condition
- **`count(predicate?: (item: T) => boolean): Promise<number>`** - Count records (optionally with condition)

### Batch Operations

- **`createMany(items: T[]): Promise<T[]>`** - Create multiple records
- **`updateMany(predicate: (item: T) => boolean, updates: Partial<T>): Promise<T[]>`** - Update multiple records
- **`deleteMany(predicate: (item: T) => boolean): Promise<number>`** - Delete multiple records

### Sorting & Pagination

- **`findAllSorted<K extends keyof T>(key: K, order?: "asc" | "desc"): Promise<T[]>** - Get all records sorted by field
- **`paginate(page?: number, pageSize?: number): Promise<PaginatedResult<T>>** - Get paginated results

```typescript
interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### Aggregation Functions

- **`sum<K extends keyof T>(key: K): Promise<number>`** - Sum numeric field values
- **`avg<K extends keyof T>(key: K): Promise<number>`** - Average numeric field values
- **`min<K extends keyof T>(key: K): Promise<T[K] | null>`** - Minimum field value
- **`max<K extends keyof T>(key: K): Promise<T[K] | null>`** - Maximum field value
- **`groupBy<K extends keyof T>(key: K): Promise<Map<T[K], T[]>>`** - Group records by field value

### Random & Sampling

- **`random(): Promise<T | null>`** - Get a random record
- **`sample(n: number): Promise<T[]>`** - Get random sample of records

### Advanced Updates

- **`increment<K extends keyof T>(id: string | number, key: K, amount?: number): Promise<T | null>`** - Increment numeric field
- **`toggle<K extends keyof T>(id: string | number, key: K): Promise<T | null>`** - Toggle boolean field

### Export & Import

- **`exportToJSON(): Promise<string>`** - Export all data to JSON string
- **`importFromJSON(jsonString: string): Promise<number>`** - Import data from JSON string

### Soft Delete (requires 'deleted' field in schema)

- **`softDelete(id: string | number): Promise<T | null>`** - Soft delete a record
- **`restore(id: string | number): Promise<T | null>`** - Restore a soft deleted record
- **`findAllActive(): Promise<T[]>`** - Get all non-deleted records

### Utility Methods

- **`saveToFile(): Promise<void>`** - Force save to disk
- **`loadFromFile(): Promise<void>`** - Load data from disk
- **`flush(): Promise<void>`** - Wait for pending writes to complete
- **`getMemoryStore(): T[]`** - Get current in-memory data

## Performance Benchmarks

**Test Environment:**
- Processor: 11th Gen Intel Core i7-11800H @ 2.30GHz
- RAM: 16.0 GB
- Storage: NVMe KIOXIA 512GB
- GPU: NVIDIA RTX 3050 Laptop

### Benchmark 1: Basic CRUD Operations

| Operation | Records/Size | Time (ms) | Ops/sec |
|-----------|--------------|-----------|---------|
| Create | 100 | 4.92 | 203 |
| Create | 1,000 | 2.10 | 476 |
| Create | 10,000 | 14.79 | 68 |
| Create | 50,000 | 52.81 | 19 |
| Find (10K individual) | 50K dataset | 0.0006 avg | 1,592,382 |
| Update (10K records) | 50K dataset | 0.0019 avg | 515,552 |
| Delete (1K records) | 50K dataset | 0.0008 avg | 1,194,886 |

### Benchmark 2: Advanced Query Methods

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| findBy (email) | 50K | 2.78 | 359,738 |
| findWhere (complex) | 50K | 54.93 | 1,821 |
| findOne (first match) | 50K | 1.13 | 888,178 |
| exists (by ID) | 50K | 0.79 | 1,272,912 |
| existsWhere (condition) | 50K | 0.94 | 1,059,098 |
| count (all) | 50K | 0.84 | 1,196,602 |
| count (with condition) | 50K | 25.59 | 3,908 |

### Benchmark 3: Batch Operations

| Operation | Records | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| createMany | 100 | 0.43 | 2,304 |
| updateMany | 100 | 0.42 | 2,366 |
| deleteMany | 50 | 0.30 | 3,339 |
| createMany | 1,000 | 0.62 | 1,620 |
| updateMany | 1,000 | 0.47 | 2,130 |
| deleteMany | 500 | 0.25 | 3,989 |
| createMany | 5,000 | 3.79 | 264 |
| updateMany | 5,000 | 1.30 | 770 |
| deleteMany | 2,500 | 0.51 | 1,973 |

### Benchmark 4: Sorting & Pagination

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| findAllSorted (age ASC) | 10K | 1.51 avg | 663 |
| findAllSorted (score DESC) | 10K | 2.81 avg | 356 |
| paginate (page 1, size 10) | 10K | 0.06 avg | 17,889 |
| paginate (page 1, size 100) | 10K | 0.06 avg | 16,023 |
| paginate (page 50, size 100) | 10K | 0.08 avg | 13,174 |

### Benchmark 5: Aggregation Functions

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| sum (score) | 50K | 0.24 avg | 4,221 |
| avg (age) | 50K | 0.70 avg | 1,421 |
| min (score) | 50K | 0.60 avg | 1,675 |
| max (age) | 50K | 0.56 avg | 1,776 |
| groupBy (role) | 50K | 0.84 avg | 1,195 |

### Benchmark 6: Random & Sampling

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| random (single) | 10K | 0.06 avg | 17,090 |
| sample (10 records) | 10K | 2.39 avg | 418 |
| sample (100 records) | 10K | 2.41 avg | 416 |

### Benchmark 7: Advanced Updates

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| increment (score) | 10K | 0.00 avg | 913,659 |
| toggle (active) | 10K | 0.00 avg | 922,509 |

### Benchmark 8: Search Operations

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| search (name, common) | 10K | 0.62 avg | 1,610 |
| search (email, specific) | 10K | 0.39 avg | 2,589 |
| search (role) | 10K | 0.23 avg | 4,267 |

### Benchmark 9: Export & Import

| Operation | Records | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| exportToJSON | 100 | 0.24 | 4,083 |
| importFromJSON | 100 | 0.33 | 3,037 |
| exportToJSON | 1,000 | 0.54 | 1,867 |
| importFromJSON | 1,000 | 1.07 | 930 |
| exportToJSON | 5,000 | 2.50 | 400 |
| importFromJSON | 5,000 | 4.89 | 204 |

### Benchmark 10: Soft Delete Operations

| Operation | Dataset | Time (ms) | Ops/sec |
|-----------|---------|-----------|---------|
| softDelete | 10K | 0.00 avg | 590,388 |
| restore | 10K | 0.00 avg | 714,643 |
| findAllActive | 10K | 0.18 avg | 5,527 |

### Benchmark 11: Memory vs File Persistence

| Mode | Operations | Time (ms) | Ops/sec |
|------|------------|-----------|---------|
| Memory-only | 10K CREATE | 10.81 | 925,292 |
| File persistence | 10K CREATE | 15.18 | 658,753 |

**Performance Overhead: 40.5%** (File persistence vs Memory-only)

### Benchmark 12: Real-World Scenarios

| Scenario | Operations | Time (ms) | Description |
|----------|------------|-----------|-------------|
| User Dashboard | 5 ops | 3.97 | Load user stats (count, avg, sort, groupBy) |
| Admin Panel | 3 ops | 1.46 | Search, filter, paginate |
| Batch Operations | - | 1.55 | Promote 458 users |
| Report Generation | - | 6.97 | Export 1.57MB filtered data |

### Benchmark 13: Stress Test

| Operation | Records | Time (ms) | Rate |
|-----------|---------|-----------|------|
| Create | 100,000 | 76.96 | 1,299,321 ops/sec |
| Complex Query | 100,000 | 55.60 | Found 33,300 admins |

**Total benchmark completion time: 4.76s**

## Running Tests

```bash
# Run comprehensive performance benchmarks
bun run performance-check.ts

# Run quick performance test
bun run quick-perf.ts
```

## Architecture

- **In-Memory Storage**: Uses Map for O(1) access time
- **Async File Operations**: Non-blocking file I/O with debouncing
- **Schema Validation**: Runtime type checking for data integrity
- **Automatic Persistence**: Debounced writes to prevent excessive disk I/O
- **Advanced Query Engine**: Efficient filtering, sorting, and aggregation
- **Batch Processing**: Optimized bulk operations
- **Soft Delete Architecture**: Optional logical deletion with recovery

## Use Cases
u
- **Web Applications**: User management, session storage, caching
- **API Development**: Local data storage, testing, prototyping
- **Data Processing**: ETL operations, data transformation
- **Analytics**: Aggregation, reporting, statistics
- **Content Management**: CMS, blog platforms, document storage
- **E-commerce**: Product catalogs, order management, inventory
- **Gaming**: Leaderboards, player data, game state
- **IoT**: Sensor data, device management, telemetry

## Performance Tips

1. **Use Memory-only Mode** for maximum performance when persistence isn't needed
2. **Batch Operations** are significantly faster than individual operations
3. **Indexing**: Frequently queried fields benefit from internal Map optimization
4. **Pagination**: Use pagination for large datasets instead of loading all records
5. **Aggregation**: Built-in aggregation functions are optimized for performance
6. **Search**: Use specific field searches instead of full scans when possible

## License

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
