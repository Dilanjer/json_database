import { Database } from "./db";

interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  score: number;
  active: boolean;
  role: string;
  deleted?: boolean;
}

const UserSchema = {
  id: "number",
  name: "string",
  email: "string",
  age: "number",
  score: "number",
  active: "boolean",
  role: "string",
} as const;

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
async function setupTestData(db: Database<User>, count: number): Promise<void> {
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

  const db = new Database<User>({
    fileName: "perf-crud",
    schema: UserSchema,
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

  const db = new Database<User>({
    fileName: "perf-queries",
    schema: UserSchema,
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

  // exists
  await benchmark(
    `exists (by ID)`,
    async () => {
      await db.exists(1000);
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

  const db = new Database<User>({
    fileName: "perf-batch",
    schema: UserSchema,
    persistToFile: true,
  });

  for (const size of BENCHMARK_CONFIG.batchOperationSizes) {
    await db.clear();

    // createMany
    const users = Array.from({ length: size }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
      score: 100,
      active: true,
      role: "user",
    }));

    await benchmark(`createMany (${size} records)`, async () => {
      await db.createMany(users);
    });

    // updateMany
    await benchmark(`updateMany (${size} records)`, async () => {
      await db.updateMany((u) => u.id < size, { active: false });
    });

    // deleteMany
    await benchmark(
      `deleteMany (${Math.floor(size / 2)} records)`,
      async () => {
        await db.deleteMany((u) => u.id < size / 2);
      },
    );
  }
}

// ============================================
// BENCHMARK 4: Sorting & Pagination
// ============================================
async function benchmarkSortingPagination() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 4: Sorting & Pagination");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-sort",
    schema: UserSchema,
    persistToFile: true,
  });

  console.log(
    `\nPreparing ${BENCHMARK_CONFIG.paginationDatasetSize} records...`,
  );
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.paginationDatasetSize);

  // findAllSorted
  await benchmark(
    `findAllSorted by age (ASC)`,
    async () => {
      await db.findAllSorted("age", "asc");
    },
    100,
  );

  await benchmark(
    `findAllSorted by score (DESC)`,
    async () => {
      await db.findAllSorted("score", "desc");
    },
    100,
  );

  // paginate
  await benchmark(
    `paginate (page 1, size 10)`,
    async () => {
      await db.paginate(1, 10);
    },
    1000,
  );

  await benchmark(
    `paginate (page 1, size 100)`,
    async () => {
      await db.paginate(1, 100);
    },
    1000,
  );

  await benchmark(
    `paginate (page 50, size 100)`,
    async () => {
      await db.paginate(50, 100);
    },
    1000,
  );
}

// ============================================
// BENCHMARK 5: Aggregation Functions
// ============================================
async function benchmarkAggregations() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 5: Aggregation Functions");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-agg",
    schema: UserSchema,
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
    `max (age field)`,
    async () => {
      await db.max("age");
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

  const db = new Database<User>({
    fileName: "perf-random",
    schema: UserSchema,
    persistToFile: true,
  });

  console.log(`\nPreparing 10000 records...`);
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
}

// ============================================
// BENCHMARK 7: Advanced Updates
// ============================================
async function benchmarkAdvancedUpdates() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 7: Advanced Updates");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-adv-update",
    schema: UserSchema,
    persistToFile: true,
  });

  console.log(`\nPreparing 10000 records...`);
  await db.clear();
  await setupTestData(db, 10000);

  // increment
  await benchmark(
    `increment (score field)`,
    async () => {
      await db.increment(100, "score", 10);
    },
    1000,
  );

  // toggle
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

  const db = new Database<User>({
    fileName: "perf-search",
    schema: UserSchema,
    persistToFile: true,
  });

  console.log(`\nPreparing ${BENCHMARK_CONFIG.searchDatasetSize} records...`);
  await db.clear();
  await setupTestData(db, BENCHMARK_CONFIG.searchDatasetSize);

  await benchmark(
    `search (name field, common term)`,
    async () => {
      await db.search("name", "user");
    },
    100,
  );

  await benchmark(
    `search (email field, specific)`,
    async () => {
      await db.search("email", "100@example.com");
    },
    100,
  );

  await benchmark(
    `search (role field)`,
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

  const db = new Database<User>({
    fileName: "perf-export",
    schema: UserSchema,
    persistToFile: true,
  });

  const sizes = [100, 1000, 5000];

  for (const size of sizes) {
    console.log(`\nPreparing ${size} records...`);
    await db.clear();
    await setupTestData(db, size);

    let exportedData: string;

    await benchmark(`exportToJSON (${size} records)`, async () => {
      exportedData = await db.exportToJSON();
    });

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

  const db = new Database<User>({
    fileName: "perf-soft-delete",
    schema: UserSchema,
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
  const memDb = new Database<User>({
    fileName: "perf-memory",
    schema: UserSchema,
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
  const fileDb = new Database<User>({
    fileName: "perf-file",
    schema: UserSchema,
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

  const db = new Database<User>({
    fileName: "perf-real-world",
    schema: UserSchema,
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
  const promoted = await db.updateMany(
    (u) => u.score > 800 && u.role === "user",
    { role: "admin" },
  );
  for (const user of promoted) {
    await db.increment(user.id, "score", 100);
  }
  const time3 = performance.now() - start3;

  console.log(`   Time: ${time3.toFixed(2)}ms`);
  console.log(`   Promoted: ${promoted.length} users`);

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

  const db = new Database<User>({
    fileName: "perf-stress",
    schema: UserSchema,
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
// MAIN PERFORMANCE TEST SUITE
// ============================================
async function main() {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║     COMPREHENSIVE DATABASE PERFORMANCE BENCHMARK          ║");
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

  const totalTime = performance.now() - startTime;

  console.log("\n" + "=".repeat(60));
  console.log(
    `✅ All benchmarks completed in ${(totalTime / 1000).toFixed(2)}s`,
  );
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
