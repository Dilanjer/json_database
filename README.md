# JSON Database

A high-performance, TypeScript-based JSON database with in-memory operations and optional file persistence. Built for Bun runtime with async operations and schema validation.

## Features

- 🚀 **High Performance**: Optimized with Map data structure for O(1) operations
- 💾 **Optional Persistence**: Async file writing with automatic debouncing
- 📝 **Schema Validation**: Type-safe operations with runtime validation
- 🔍 **Full CRUD Operations**: Create, Read, Update, Delete, and Upsert
- 📊 **Benchmark Proven**: Tested with 100K+ records
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
}

// Create database instance
const db = new Database<User>({
  fileName: 'users',
  schema: {
    id: 'string',
    name: 'string',
    age: 'number',
    email: 'string'
  },
  dataDir: './data',           // Optional: defaults to './data'
  persistToFile: true          // Optional: defaults to true
});

// Create a record
const user = await db.create({
  id: '1',
  name: 'John Doe',
  age: 30,
  email: 'john@example.com'
});

// Find a record
const foundUser = await db.find('1');

// Find all records
const allUsers = await db.findAll();

// Update a record
const updatedUser = await db.update('1', { age: 31 });

// Upsert (create or update)
await db.upsert({
  id: '2',
  name: 'Jane Doe',
  age: 25,
  email: 'jane@example.com'
});

// Delete a record
const deleted = await db.delete('1');

// Clear all records
await db.clear();
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

### Methods

- **`create(data: T): Promise<T>`** - Create a new record
- **`find(id: string | number): Promise<T | null>`** - Find a record by ID
- **`findAll(): Promise<T[]>`** - Get all records
- **`update(id: string | number, updates: Partial<T>): Promise<T | null>`** - Update a record
- **`delete(id: string | number): Promise<boolean>`** - Delete a record
- **`upsert(data: T): Promise<T>`** - Create or update a record
- **`clear(): Promise<void>`** - Clear all records
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

### Benchmark Results

#### CREATE Operations
| Records | Time (ms) | Ops/sec |
|---------|-----------|---------|
| 10      | 1.45      | 690     |
| 100     | 2.75      | 364     |
| 1,000   | 1.80      | 557     |
| 5,000   | 6.29      | 159     |
| 10,000  | 11.48     | 87      |
| 20,000  | 20.29     | 49      |
| 50,000  | 46.21     | 22      |
| 100,000 | 95.59     | 10      |

#### READ Operations
| Operation | Dataset Size | Time (ms) | Ops/sec |
|-----------|--------------|-----------|---------|
| Find 5K records | 100K | 3.07 | 1,627,816 |
| FindAll (100K) | 100K | 131.47 | 1,521 |

#### UPDATE Operations
| Records | Time (ms) | Ops/sec |
|---------|-----------|---------|
| 10,000  | 11.85     | 844,145 |

#### DELETE Operations
| Dataset | Deleted | Time (ms) | Ops/sec |
|---------|---------|-----------|---------|
| 100     | 50      | 0.28      | 177,683 |
| 1,000   | 500     | 0.28      | 1,815,541 |
| 5,000   | 2,500   | 0.98      | 2,554,670 |
| 50,000  | 25,000  | 11.90     | 2,101,494 |
| 100,000 | 50,000  | 19.59     | 2,552,557 |

#### UPSERT Operations
| Operations | Time (ms) | Ops/sec |
|------------|-----------|---------|
| 10K (5K creates + 5K updates) | 9.59 | 1,043,275 |

#### Memory vs File Persistence
| Mode | Time (ms) | Ops/sec |
|------|-----------|---------|
| Memory-only | 98.60 | 1,014,163 |
| Auto-persist | 112.71 | 887,267 |

#### Mixed Operations (Real-world Scenario)
- **Total Operations:** 229,999 (100K creates, 100K reads, 20K updates, 9,999 deletes)
- **Total Time:** 190.96ms
- **Average per operation:** 0.0008ms
- **Ops/sec:** 1,204,415

## Running Tests

```bash
# Run performance benchmarks
bun run performance-check.ts

# Run quick performance test
bun run quick-perf.ts
```

## Architecture

- **In-Memory Storage**: Uses Map for O(1) access time
- **Async File Operations**: Non-blocking file I/O with debouncing
- **Schema Validation**: Runtime type checking for data integrity
- **Automatic Persistence**: Debounced writes to prevent excessive disk I/O

## License

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
