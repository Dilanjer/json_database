import { Database } from "./db";

interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}

const UserSchema = {
  id: "number",
  name: "string",
  email: "string",
  age: "number",
} as const;

// ============================================
// BENCHMARK CONFIGURATION - EASY TO CHANGE
// ============================================
const BENCHMARK_CONFIG = {
  // CREATE benchmark sizes
  createCounts: [10, 100, 1000, 5000, 10000, 20000, 50000, 100000],

  // READ benchmark settings
  readDatasetSize: 100000, // было 50000
  readFindCount: 5000, // увеличил пропорционально
  readFindAllIterations: 200, // немного увеличено

  // UPDATE benchmark settings
  updateDatasetSize: 100000, // было 1000
  updateCount: 10000, // масштабировано

  // DELETE benchmark settings
  deleteDatasetSizes: [100, 1000, 5000, 50000, 100000],

  // UPSERT benchmark settings
  upsertOperations: 10000, // было 1000

  // Memory vs File comparison
  memoryVsFileOperations: 100000, // было 50000

  // Mixed operations (real-world)
  mixedOperationsCount: 100000, // было 50000
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

// ============================================
// BENCHMARK 1: CREATE Operations
// ============================================
async function benchmarkCreate() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 1: CREATE Operations");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-create",
    schema: UserSchema,
    persistToFile: true,
  });

  await db.clear();

  // Test different batch sizes
  for (const count of BENCHMARK_CONFIG.createCounts) {
    await db.clear();

    await benchmark(`Create ${count} records`, async () => {
      for (let i = 0; i < count; i++) {
        await db.create({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          age: 20 + (i % 50),
        });
      }
    });
  }
}

// ============================================
// BENCHMARK 2: READ Operations
// ============================================
async function benchmarkRead() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 2: READ Operations");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-read",
    schema: UserSchema,
    persistToFile: true,
  });

  // Prepare data
  console.log(`\nPreparing ${BENCHMARK_CONFIG.readDatasetSize} records...`);
  await db.clear();
  for (let i = 0; i < BENCHMARK_CONFIG.readDatasetSize; i++) {
    await db.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
    });
  }

  // Benchmark find operations
  const tracker = new PerformanceTracker();
  for (let i = 0; i < BENCHMARK_CONFIG.readFindCount; i++) {
    const start = performance.now();
    await db.find(i);
    tracker.record(performance.now() - start);
  }

  console.log(
    `\n📊 Find ${BENCHMARK_CONFIG.readFindCount} records (from ${BENCHMARK_CONFIG.readDatasetSize} dataset)`,
  );
  console.log(`   Total time: ${tracker.total.toFixed(2)}ms`);
  console.log(`   Average: ${tracker.avg.toFixed(4)}ms`);
  console.log(`   Ops/sec: ${(1000 / tracker.avg).toFixed(0)}`);

  // Benchmark findAll
  await benchmark(
    `FindAll (${BENCHMARK_CONFIG.readDatasetSize} records)`,
    async () => {
      await db.findAll();
    },
    BENCHMARK_CONFIG.readFindAllIterations,
  );
}

// ============================================
// BENCHMARK 3: UPDATE Operations
// ============================================
async function benchmarkUpdate() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 3: UPDATE Operations");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-update",
    schema: UserSchema,
    persistToFile: true,
  });

  // Prepare data
  console.log(`\nPreparing ${BENCHMARK_CONFIG.updateDatasetSize} records...`);
  await db.clear();
  for (let i = 0; i < BENCHMARK_CONFIG.updateDatasetSize; i++) {
    await db.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
    });
  }

  // Benchmark updates
  const tracker = new PerformanceTracker();
  for (let i = 0; i < BENCHMARK_CONFIG.updateCount; i++) {
    const start = performance.now();
    await db.update(i, { name: `Updated User ${i}` });
    tracker.record(performance.now() - start);
  }

  console.log(`\n📊 Update ${BENCHMARK_CONFIG.updateCount} records`);
  console.log(`   Total time: ${tracker.total.toFixed(2)}ms`);
  console.log(`   Average: ${tracker.avg.toFixed(2)}ms`);
  console.log(`   Ops/sec: ${(1000 / tracker.avg).toFixed(0)}`);
}

// ============================================
// BENCHMARK 4: DELETE Operations
// ============================================
async function benchmarkDelete() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 4: DELETE Operations");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-delete",
    schema: UserSchema,
    persistToFile: true,
  });

  // Test deleting from different dataset sizes
  for (const totalRecords of BENCHMARK_CONFIG.deleteDatasetSizes) {
    console.log(`\nPreparing ${totalRecords} records...`);
    await db.clear();

    // Create dataset
    for (let i = 0; i < totalRecords; i++) {
      await db.create({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + (i % 50),
      });
    }

    // Delete half of them
    const deleteCount = Math.floor(totalRecords / 2);
    const start = performance.now();
    for (let i = 0; i < deleteCount; i++) {
      await db.delete(i);
    }
    const elapsed = performance.now() - start;

    console.log(`\n📊 Delete ${deleteCount} from ${totalRecords} records`);
    console.log(`   Total time: ${elapsed.toFixed(2)}ms`);
    console.log(`   Average: ${(elapsed / deleteCount).toFixed(2)}ms`);
    console.log(`   Ops/sec: ${((deleteCount / elapsed) * 1000).toFixed(0)}`);
  }
}

// ============================================
// BENCHMARK 5: UPSERT Operations
// ============================================
async function benchmarkUpsert() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 5: UPSERT Operations");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-upsert",
    schema: UserSchema,
    persistToFile: true,
  });

  await db.clear();

  // Benchmark upsert (mix of creates and updates)
  const tracker = new PerformanceTracker();
  const halfOps = Math.floor(BENCHMARK_CONFIG.upsertOperations / 2);

  for (let i = 0; i < BENCHMARK_CONFIG.upsertOperations; i++) {
    const start = performance.now();
    await db.upsert({
      id: i % halfOps, // Will create halfOps records, then update them
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
    });
    tracker.record(performance.now() - start);
  }

  console.log(
    `\n📊 Upsert ${BENCHMARK_CONFIG.upsertOperations} operations (${halfOps} creates + ${halfOps} updates)`,
  );
  console.log(`   Total time: ${tracker.total.toFixed(2)}ms`);
  console.log(`   Average: ${tracker.avg.toFixed(2)}ms`);
  console.log(`   Ops/sec: ${(1000 / tracker.avg).toFixed(0)}`);
}

// ============================================
// BENCHMARK 6: Memory vs File Persistence
// ============================================
async function benchmarkMemoryVsFile() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 6: Memory-Only vs Auto-Persist");
  console.log("=".repeat(60));

  const operations = BENCHMARK_CONFIG.memoryVsFileOperations;

  // Memory-only mode
  const memDb = new Database<User>({
    fileName: "perf-memory",
    schema: UserSchema,
    persistToFile: false,
  });

  console.log(`\nTesting with ${operations} operations...`);
  await memDb.clear();

  const memStart = performance.now();
  for (let i = 0; i < operations; i++) {
    await memDb.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
    });
  }
  const memTime = performance.now() - memStart;

  // Auto-persist mode
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
      age: 20 + (i % 50),
    });
  }
  const fileTime = performance.now() - fileStart;

  console.log(`\n📊 ${operations} CREATE operations`);
  console.log(`\n   Memory-only (persistToFile: false):`);
  console.log(`      Total: ${memTime.toFixed(2)}ms`);
  console.log(`      Average: ${(memTime / operations).toFixed(4)}ms`);
  console.log(`      Ops/sec: ${((operations / memTime) * 1000).toFixed(0)}`);

  console.log(`\n   Auto-persist (persistToFile: true):`);
  console.log(`      Total: ${fileTime.toFixed(2)}ms`);
  console.log(`      Average: ${(fileTime / operations).toFixed(4)}ms`);
  console.log(`      Ops/sec: ${((operations / fileTime) * 1000).toFixed(0)}`);

  console.log(
    `\n   📈 Performance difference: ${(fileTime / memTime).toFixed(2)}x`,
  );
  console.log(`   💡 Note: Auto-persist is async, so difference is minimal!`);
}

// ============================================
// BENCHMARK 7: Mixed Operations (Real-world)
// ============================================
async function benchmarkMixedOperations() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK 7: Mixed Operations (Real-world Scenario)");
  console.log("=".repeat(60));

  const db = new Database<User>({
    fileName: "perf-mixed",
    schema: UserSchema,
    persistToFile: true,
  });

  await db.clear();

  const operations = {
    create: 0,
    read: 0,
    update: 0,
    delete: 0,
  };

  console.log(
    `\nRunning ${BENCHMARK_CONFIG.mixedOperationsCount} mixed operations...`,
  );
  const start = performance.now();

  // Simulate real-world usage
  for (let i = 0; i < BENCHMARK_CONFIG.mixedOperationsCount; i++) {
    // Create
    await db.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
    });
    operations.create++;

    // Read
    await db.find(i);
    operations.read++;

    // Update every 5th record
    if (i % 5 === 0) {
      await db.update(i, { name: `Updated User ${i}` });
      operations.update++;
    }

    // Delete every 10th record
    if (i % 10 === 0 && i > 0) {
      await db.delete(i - 1);
      operations.delete++;
    }
  }

  const totalTime = performance.now() - start;
  const totalOps =
    operations.create + operations.read + operations.update + operations.delete;

  console.log(`\n📊 Mixed Operations Performance`);
  console.log(`   Total operations: ${totalOps}`);
  console.log(`      Creates: ${operations.create}`);
  console.log(`      Reads: ${operations.read}`);
  console.log(`      Updates: ${operations.update}`);
  console.log(`      Deletes: ${operations.delete}`);
  console.log(`\n   Total time: ${totalTime.toFixed(2)}ms`);
  console.log(
    `   Average per operation: ${(totalTime / totalOps).toFixed(4)}ms`,
  );
  console.log(`   Ops/sec: ${((totalOps / totalTime) * 1000).toFixed(0)}`);
}

// ============================================
// MAIN PERFORMANCE TEST SUITE
// ============================================
async function main() {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║          DATABASE PERFORMANCE BENCHMARK SUITE             ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  console.log("\n📋 BENCHMARK CONFIGURATION:");
  console.log(`   CREATE counts: ${BENCHMARK_CONFIG.createCounts.join(", ")}`);
  console.log(`   READ dataset: ${BENCHMARK_CONFIG.readDatasetSize} records`);
  console.log(`   UPDATE operations: ${BENCHMARK_CONFIG.updateCount}`);
  console.log(
    `   DELETE datasets: ${BENCHMARK_CONFIG.deleteDatasetSizes.join(", ")}`,
  );
  console.log(
    `   Memory vs File: ${BENCHMARK_CONFIG.memoryVsFileOperations} ops`,
  );
  console.log(
    `   Mixed operations: ${BENCHMARK_CONFIG.mixedOperationsCount} ops`,
  );

  await benchmarkCreate();
  await benchmarkRead();
  await benchmarkUpdate();
  await benchmarkDelete();
  await benchmarkUpsert();
  await benchmarkMemoryVsFile();
  await benchmarkMixedOperations();

  console.log("\n" + "=".repeat(60));
  console.log("✅ All benchmarks completed!");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
