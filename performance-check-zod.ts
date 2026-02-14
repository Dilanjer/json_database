import { z } from "zod";
import { Database } from "./database.zod";

// Define Zod schema with validation rules
const userSchema = z
  .object({
    id: z.number(),
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().min(0).max(150),
    score: z.number().min(0).max(1000),
    active: z.boolean(),
    role: z.string(),
    deleted: z.boolean().optional(),
  })
  .strict();

type User = z.infer<typeof userSchema>;

// ============================================
// ENHANCED BENCHMARK CONFIGURATION
// ============================================
const BENCHMARK_CONFIG = {
  // Basic CRUD
  createCounts: [100, 1000, 10000, 50000],
  readDatasetSize: 50000,
  readFindCount: 10000,
  updateDatasetSize: 50000,
  updateCount: 10000,

  // Advanced features
  queryDatasetSize: 50000,
  queryIterations: 1000,
  batchOperationSizes: [100, 1000, 5000],
  aggregationDatasetSize: 50000,
  paginationDatasetSize: 10000,
  searchDatasetSize: 10000,
};

// Performance measurement utilities
class PerformanceTracker {
  private measurements: number[] = [];

  record(time: number) {
    this.measurements.push(time);
  }

  get avg(): number {
    return (
      this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length
    );
  }

  get min(): number {
    return Math.min(...this.measurements);
  }

  get max(): number {
    return Math.max(...this.measurements);
  }

  get total(): number {
    return this.measurements.reduce((a, b) => a + b, 0);
  }

  get count(): number {
    return this.measurements.length;
  }

  reset() {
    this.measurements = [];
  }
}

// Benchmark helper
async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 1,
): Promise<void> {
  const tracker = new PerformanceTracker();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const elapsed = performance.now() - start;
    tracker.record(elapsed);
  }

  console.log(`\n📊 ${name}`);
  console.log(`   Operations: ${tracker.count}`);
  console.log(`   Total time: ${tracker.total.toFixed(2)}ms`);
  console.log(`   Average: ${tracker.avg.toFixed(2)}ms`);
  console.log(`   Min: ${tracker.min.toFixed(2)}ms`);
  console.log(`   Max: ${tracker.max.toFixed(2)}ms`);
  console.log(`   Ops/sec: ${(1000 / tracker.avg).toFixed(0)}`);
}

// Setup test database with data
async function setupTestData(
  db: Database<typeof userSchema>,
  count: number,
): Promise<void> {
  const roles = ["user", "admin", "moderator", "guest"];

  for (let i = 0; i < count; i++) {
    await db.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 18 + (i % 50),
      score: Math.floor(Math.random() * 1000),
      active: i % 3 !== 0,
      role: roles[i % roles.length]!,
    });
  }
}

// ============================================
// BENCHMARK 1: Basic CRUD Operations
// ============================================
async function benchmarkBasicCRUD() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 1: Basic CRUD Operations");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-crud-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  // CREATE
  for (const count of BENCHMARK_CONFIG.createCounts) {
    await db.clear();
    await benchmark(`Create ${count} records`, async () => {
      for (let i = 0; i < count; i++) {
        await db.create({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          age: 20 + (i % 50),
          score: 100,
          active: true,
          role: "user",
        });
      }
    });
  }

  // READ
  console.log(
    `\nPreparing ${BENCHMARK_CONFIG.readDatasetSize} records for READ tests...`,
  );
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.readDatasetSize);

  const readTracker = new PerformanceTracker();
  for (let i = 0; i < BENCHMARK_CONFIG.readFindCount; i++) {
    const start = performance.now();
    await db.find(i);
    readTracker.record(performance.now() - start);
  }

  console.log(`\n📊 Find ${BENCHMARK_CONFIG.readFindCount} individual records`);
  console.log(`   Average: ${readTracker.avg.toFixed(4)}ms`);
  console.log(`   Ops/sec: ${(1000 / readTracker.avg).toFixed(0)}`);

  // UPDATE
  const updateTracker = new PerformanceTracker();
  for (let i = 0; i < BENCHMARK_CONFIG.updateCount; i++) {
    const start = performance.now();
    await db.update(i, { name: `Updated ${i}` });
    updateTracker.record(performance.now() - start);
  }

  console.log(`\n📊 Update ${BENCHMARK_CONFIG.updateCount} records`);
  console.log(`   Average: ${updateTracker.avg.toFixed(4)}ms`);
  console.log(`   Ops/sec: ${(1000 / updateTracker.avg).toFixed(0)}`);

  // DELETE
  const deleteTracker = new PerformanceTracker();
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await db.delete(i);
    deleteTracker.record(performance.now() - start);
  }

  console.log(`\n📊 Delete 1000 records`);
  console.log(`   Average: ${deleteTracker.avg.toFixed(4)}ms`);
  console.log(`   Ops/sec: ${(1000 / deleteTracker.avg).toFixed(0)}`);
}

// ============================================
// BENCHMARK 2: Advanced Query Methods
// ============================================
async function benchmarkAdvancedQueries() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 2: Advanced Query Methods");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-queries-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  console.log(`\nPreparing ${BENCHMARK_CONFIG.queryDatasetSize} records...`);
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.queryDatasetSize);

  // findBy
  await benchmark(
    `findBy (email field)`,
    async () => {
      await db.findBy("email", "user100@example.com");
    },
    BENCHMARK_CONFIG.queryIterations,
  );

  // findWhere
  await benchmark(
    `findWhere (complex condition)`,
    async () => {
      await db.findWhere((u) => u.active && u.age > 30 && u.score > 500);
    },
    100,
  );

  // findOne
  await benchmark(
    `findOne (first match)`,
    async () => {
      await db.findOne((u) => u.role === "admin");
    },
    BENCHMARK_CONFIG.queryIterations,
  );

  // existsById
  await benchmark(
    `existsById (by ID)`,
    async () => {
      await db.existsById(1000);
    },
    BENCHMARK_CONFIG.queryIterations,
  );

  // existsWhere
  await benchmark(
    `existsWhere (condition)`,
    async () => {
      await db.existsWhere((u) => u.role === "admin");
    },
    BENCHMARK_CONFIG.queryIterations,
  );

  // count
  await benchmark(
    `count (all records)`,
    async () => {
      await db.count();
    },
    BENCHMARK_CONFIG.queryIterations,
  );

  await benchmark(
    `count (with condition)`,
    async () => {
      await db.count((u) => u.active);
    },
    100,
  );
}

// ============================================
// BENCHMARK 3: Batch Operations
// ============================================
async function benchmarkBatchOperations() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 3: Batch Operations");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-batch-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  for (const batchSize of BENCHMARK_CONFIG.batchOperationSizes) {
    await db.clear();

    const users = Array.from({ length: batchSize }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
      score: 100,
      active: true,
      role: "user",
    }));

    await benchmark(`createMany (${batchSize} records)`, async () => {
      await db.createMany(users);
    });
  }

  // Setup data for updateMany
  await db.clear();
  await setupTestData(db, 10000);

  await benchmark(
    `updateMany (update by IDs)`,
    async () => {
      const updates = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        data: { name: `Updated ${i}` },
      }));
      await db.updateMany(updates);
    },
    10,
  );

  await benchmark(
    `deleteMany (delete by IDs)`,
    async () => {
      const idsToDelete = Array.from({ length: 100 }, (_, i) => i + 1000);
      await db.deleteMany(idsToDelete);
    },
    10,
  );
}

// ============================================
// BENCHMARK 4: Sorting & Pagination
// ============================================
async function benchmarkSortingPagination() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 4: Sorting & Pagination");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-sorting-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  console.log(
    `\nPreparing ${BENCHMARK_CONFIG.paginationDatasetSize} records...`,
  );
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.paginationDatasetSize);

  await benchmark(
    `findAllSorted (by score, asc)`,
    async () => {
      await db.findAllSorted("score", "asc");
    },
    10,
  );

  await benchmark(
    `findAllSorted (by age, desc)`,
    async () => {
      await db.findAllSorted("age", "desc");
    },
    10,
  );

  await benchmark(
    `sortBy (by name, asc)`,
    async () => {
      await db.sortBy("name", "asc");
    },
    10,
  );

  await benchmark(
    `paginate (page 1, 20 items)`,
    async () => {
      await db.paginate(1, 20);
    },
    100,
  );

  await benchmark(
    `paginate (page 50, 100 items)`,
    async () => {
      await db.paginate(50, 100);
    },
    100,
  );
}

// ============================================
// BENCHMARK 5: Aggregation Methods
// ============================================
async function benchmarkAggregations() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 5: Aggregation Methods");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-agg-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  console.log(
    `\nPreparing ${BENCHMARK_CONFIG.aggregationDatasetSize} records...`,
  );
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.aggregationDatasetSize);

  await benchmark(
    `sum (score field)`,
    async () => {
      await db.sum("score");
    },
    100,
  );

  await benchmark(
    `avg (age field)`,
    async () => {
      await db.avg("age");
    },
    100,
  );

  await benchmark(
    `min (score field)`,
    async () => {
      await db.min("score");
    },
    100,
  );

  await benchmark(
    `max (score field)`,
    async () => {
      await db.max("score");
    },
    100,
  );

  await benchmark(
    `groupBy (role field)`,
    async () => {
      await db.groupBy("role");
    },
    100,
  );
}

// ============================================
// BENCHMARK 6: Random & Sampling
// ============================================
async function benchmarkRandomSampling() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 6: Random & Sampling");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-random-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  await db.clear();
  await setupTestData(db, 10000);

  await benchmark(
    `random (single record)`,
    async () => {
      await db.random();
    },
    1000,
  );

  await benchmark(
    `sample (10 records)`,
    async () => {
      await db.sample(10);
    },
    1000,
  );

  await benchmark(
    `sample (100 records)`,
    async () => {
      await db.sample(100);
    },
    100,
  );

  await benchmark(
    `sample (1000 records)`,
    async () => {
      await db.sample(1000);
    },
    100,
  );
}

// ============================================
// BENCHMARK 7: Advanced Update Methods
// ============================================
async function benchmarkAdvancedUpdates() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 7: Advanced Update Methods");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-updates-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  await db.clear();
  await setupTestData(db, 10000);

  // Set a low score to allow multiple increments
  await db.update(100, { score: 0 });

  await benchmark(
    `increment (score +1)`,
    async () => {
      // Reset score periodically to avoid exceeding max
      const user = await db.find(100);
      if (user && user.score >= 1000) {
        await db.update(100, { score: 0 });
      }
      await db.increment(100, "score", 1);
    },
    1000,
  );

  // Set a low age to allow multiple increments
  await db.update(100, { age: 18 });

  await benchmark(
    `increment (age +1)`,
    async () => {
      // Reset age periodically to avoid exceeding max
      const user = await db.find(100);
      if (user && user.age >= 145) {
        await db.update(100, { age: 18 });
      }
      await db.increment(100, "age", 1);
    },
    1000,
  );

  await benchmark(
    `toggle (active field)`,
    async () => {
      await db.toggle(100, "active");
    },
    1000,
  );
}

// ============================================
// BENCHMARK 8: Search Operations
// ============================================
async function benchmarkSearch() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 8: Search Operations");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-search-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  console.log(`\nPreparing ${BENCHMARK_CONFIG.searchDatasetSize} records...`);
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.searchDatasetSize);

  await benchmark(
    `search (name field, "user")`,
    async () => {
      await db.search("name", "user");
    },
    100,
  );

  await benchmark(
    `search (email field, "100")`,
    async () => {
      await db.search("email", "100");
    },
    100,
  );

  await benchmark(
    `search (role field, "admin")`,
    async () => {
      await db.search("role", "admin");
    },
    100,
  );
}

// ============================================
// BENCHMARK 9: Export & Import
// ============================================
async function benchmarkExportImport() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 9: Export & Import");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-export-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  for (const size of [1000, 10000]) {
    await db.clear();
    await setupTestData(db, size);

    let exportedData = "";
    await benchmark(`exportToJSON (${size} records)`, async () => {
      exportedData = await db.exportToJSON();
    });

    console.log(`   Size: ${(exportedData.length / 1024).toFixed(2)}KB`);

    await db.clear();
    await benchmark(`importFromJSON (${size} records)`, async () => {
      await db.importFromJSON(exportedData);
    });
  }
}

// ============================================
// BENCHMARK 10: Soft Delete Operations
// ============================================
async function benchmarkSoftDelete() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 10: Soft Delete Operations");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-soft-delete-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  console.log(`\nPreparing 10000 records...`);
  await db.clear();
  await setupTestData(db, 10000);

  await benchmark(
    `softDelete`,
    async () => {
      await db.softDelete(100);
    },
    1000,
  );

  await benchmark(
    `restore`,
    async () => {
      await db.restore(100);
    },
    1000,
  );

  await benchmark(
    `findAllActive`,
    async () => {
      await db.findAllActive();
    },
    100,
  );
}

// ============================================
// BENCHMARK 11: Memory vs File Persistence
// ============================================
async function benchmarkMemoryVsFile() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 11: Memory-Only vs File Persistence");
  console.log("=".repeat(60));

  const operations = 10000;

  // Memory-only
  const memDb = new Database({
    fileName: "perf-memory-zod",
    zodSchema: userSchema,
    persistToFile: false,
  });

  await memDb.clear();
  const memStart = performance.now();
  for (let i = 0; i < operations; i++) {
    await memDb.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20,
      score: 100,
      active: true,
      role: "user",
    });
  }
  const memTime = performance.now() - memStart;

  // File persistence
  const fileDb = new Database({
    fileName: "perf-file-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  await fileDb.clear();
  const fileStart = performance.now();
  for (let i = 0; i < operations; i++) {
    await fileDb.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20,
      score: 100,
      active: true,
      role: "user",
    });
  }
  const fileTime = performance.now() - fileStart;

  console.log(`\n📊 ${operations} CREATE operations`);
  console.log(`\n   Memory-only:`);
  console.log(`      Total: ${memTime.toFixed(2)}ms`);
  console.log(`      Ops/sec: ${((operations / memTime) * 1000).toFixed(0)}`);
  console.log(`\n   File persistence:`);
  console.log(`      Total: ${fileTime.toFixed(2)}ms`);
  console.log(`      Ops/sec: ${((operations / fileTime) * 1000).toFixed(0)}`);
  console.log(
    `\n   📈 Overhead: ${((fileTime / memTime - 1) * 100).toFixed(1)}%`,
  );
}

// ============================================
// BENCHMARK 12: Complex Real-World Scenarios
// ============================================
async function benchmarkRealWorldScenarios() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 12: Real-World Scenarios");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-real-world-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  // Scenario 1: User Dashboard
  console.log(`\n🎯 Scenario 1: User Dashboard (load user stats)`);
  await db.clear();
  await setupTestData(db, 10000);

  const start1 = performance.now();
  const totalUsers = await db.count();
  const activeUsers = await db.count((u) => u.active);
  const avgScore = await db.avg("score");
  const topUsers = (await db.findAllSorted("score", "desc")).slice(0, 10);
  const usersByRole = await db.groupBy("role");
  const time1 = performance.now() - start1;

  console.log(`   Time: ${time1.toFixed(2)}ms`);
  console.log(`   Operations: 5 (count, count, avg, sort, groupBy)`);

  // Scenario 2: Admin Panel - User Management
  console.log(`\n🎯 Scenario 2: Admin Panel (search, filter, paginate)`);
  const start2 = performance.now();
  const searchResults = await db.search("name", "user");
  const admins = await db.findWhere((u) => u.role === "admin");
  const page = await db.paginate(1, 20);
  const time2 = performance.now() - start2;

  console.log(`   Time: ${time2.toFixed(2)}ms`);
  console.log(`   Operations: 3 (search, filter, paginate)`);

  // Scenario 3: Batch User Update
  console.log(`\n🎯 Scenario 3: Batch Operations (promote users)`);
  const start3 = performance.now();
  const highScoreUsers = await db.findWhere(
    (u) => u.score > 800 && u.role === "user",
  );
  const updates = highScoreUsers.map((u) => ({
    id: u.id,
    data: { role: "admin" },
  }));
  const promoted = await db.updateMany(updates);
  let incrementedCount = 0;
  for (const user of promoted) {
    const result = await db.safeIncrement(user.id, "score", 100);
    if (result) incrementedCount++;
  }
  const time3 = performance.now() - start3;

  console.log(`   Time: ${time3.toFixed(2)}ms`);
  console.log(`   Promoted: ${promoted.length} users`);
  console.log(`   Score incremented: ${incrementedCount} users`);

  // Scenario 4: Report Generation
  console.log(`\n🎯 Scenario 4: Report Generation (export filtered data)`);
  const start4 = performance.now();
  const activeAdmins = await db.findWhere(
    (u) => u.active && u.role === "admin",
  );
  const report = {
    total: activeAdmins.length,
    avgScore:
      activeAdmins.reduce((s, u) => s + u.score, 0) / activeAdmins.length,
    avgAge: activeAdmins.reduce((s, u) => s + u.age, 0) / activeAdmins.length,
  };
  const exported = await db.exportToJSON();
  const time4 = performance.now() - start4;

  console.log(`   Time: ${time4.toFixed(2)}ms`);
  console.log(`   Export size: ${(exported.length / 1024).toFixed(2)}KB`);
}

// ============================================
// BENCHMARK 13: Stress Test
// ============================================
async function benchmarkStressTest() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 13: Stress Test");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-stress-zod",
    zodSchema: userSchema,
    persistToFile: true,
  });

  console.log(`\n🔥 Creating 100,000 records...`);
  await db.clear();
  const createStart = performance.now();

  const batchSize = 1000;
  for (let batch = 0; batch < 100; batch++) {
    const users = Array.from({ length: batchSize }, (_, i) => ({
      id: batch * batchSize + i,
      name: `User ${batch * batchSize + i}`,
      email: `user${batch * batchSize + i}@example.com`,
      age: 18 + (i % 50),
      score: Math.floor(Math.random() * 1000),
      active: i % 3 !== 0,
      role: ["user", "admin", "moderator"][i % 3] as string,
    }));
    await db.createMany(users);
  }

  const createTime = performance.now() - createStart;
  console.log(`   Created in: ${createTime.toFixed(2)}ms`);
  console.log(`   Rate: ${((100000 / createTime) * 1000).toFixed(0)} ops/sec`);

  console.log(`\n🔥 Performing complex queries on 100k records...`);

  const queryStart = performance.now();
  const results = {
    total: await db.count(),
    active: await db.count((u) => u.active),
    avgScore: await db.avg("score"),
    maxScore: await db.max("score"),
    admins: await db.findWhere((u) => u.role === "admin"),
    grouped: await db.groupBy("role"),
    top100: (await db.findAllSorted("score", "desc")).slice(0, 100),
  };
  const queryTime = performance.now() - queryStart;

  console.log(`   Query time: ${queryTime.toFixed(2)}ms`);
  console.log(`   Found ${results.admins.length} admins`);
  console.log(`   Top score: ${results.maxScore}`);
}

// ============================================
// BENCHMARK 14: Zod Validation Overhead
// ============================================
async function benchmarkZodValidation() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 14: Zod Validation Overhead");
  console.log("=".repeat(60));

  const db = new Database({
    fileName: "perf-validation-zod",
    zodSchema: userSchema,
    persistToFile: false,
  });

  await db.clear();

  // Test validation overhead
  console.log(`\n🔍 Testing Zod validation overhead...`);

  const validData = {
    id: 1,
    name: "Test User",
    email: "test@example.com",
    age: 25,
    score: 500,
    active: true,
    role: "user",
  };

  const validStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    const result = db.safeValidate({ ...validData, id: i });
  }
  const validTime = performance.now() - validStart;

  console.log(`\n📊 Valid data validation (10,000 operations)`);
  console.log(`   Total time: ${validTime.toFixed(2)}ms`);
  console.log(`   Average: ${(validTime / 10000).toFixed(4)}ms per validation`);
  console.log(`   Ops/sec: ${((10000 / validTime) * 1000).toFixed(0)}`);

  // Test invalid data
  const invalidData = {
    id: 1,
    name: "", // Invalid: empty string
    email: "not-an-email", // Invalid: not an email
    age: 200, // Invalid: > 150
    score: 1500, // Invalid: > 1000
    active: true,
    role: "user",
  };

  const invalidStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    const result = db.safeValidate({ ...invalidData, id: i });
  }
  const invalidTime = performance.now() - invalidStart;

  console.log(`\n📊 Invalid data validation (10,000 operations)`);
  console.log(`   Total time: ${invalidTime.toFixed(2)}ms`);
  console.log(
    `   Average: ${(invalidTime / 10000).toFixed(4)}ms per validation`,
  );
  console.log(`   Ops/sec: ${((10000 / invalidTime) * 1000).toFixed(0)}`);
  console.log(
    `\n   ⚠️ Invalid data overhead: ${((invalidTime / validTime - 1) * 100).toFixed(1)}%`,
  );
}

// ============================================
// MAIN PERFORMANCE TEST SUITE
// ============================================
async function main() {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   COMPREHENSIVE DATABASE PERFORMANCE BENCHMARK (ZOD)      ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  const startTime = performance.now();

  await benchmarkBasicCRUD();
  await benchmarkAdvancedQueries();
  await benchmarkBatchOperations();
  await benchmarkSortingPagination();
  await benchmarkAggregations();
  await benchmarkRandomSampling();
  await benchmarkAdvancedUpdates();
  await benchmarkSearch();
  await benchmarkExportImport();
  await benchmarkSoftDelete();
  await benchmarkMemoryVsFile();
  await benchmarkRealWorldScenarios();
  await benchmarkStressTest();
  await benchmarkZodValidation();

  const totalTime = performance.now() - startTime;

  console.log("\n" + "=".repeat(60));
  console.log(
    `✅ All benchmarks completed in ${(totalTime / 1000).toFixed(2)}s`,
  );
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
