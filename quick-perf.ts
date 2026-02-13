import { Database, type Schema } from "./db";

interface User {
  id: number;
  name: string;
  email: string;
}

const UserSchema: Schema = {
  id: "number",
  name: "string",
  email: "string",
};

// Simple performance measurement
async function measurePerformance(
  operation: string,
  fn: () => Promise<void>,
  iterations: number = 1,
) {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`\n📊 ${operation}`);
  console.log(`   Iterations: ${iterations}`);
  console.log(`   Total: ${total.toFixed(2)}ms`);
  console.log(`   Average: ${avg.toFixed(2)}ms per operation`);
  console.log(`   Min: ${min.toFixed(2)}ms`);
  console.log(`   Max: ${max.toFixed(2)}ms`);
  console.log(
    `   Throughput: ${(iterations / (total / 1000)).toFixed(0)} ops/sec`,
  );

  return { total, avg, min, max };
}

async function quickPerformanceCheck() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║           QUICK PERFORMANCE CHECK                      ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  const db = new Database<User>({
    fileName: "quick-perf",
    schema: UserSchema,
    persistToFile: true, // Default behavior
  });

  await db.clear();

  // Test 1: Create operations
  await measurePerformance(
    "CREATE 100 records",
    async () => {
      await db.clear();
      for (let i = 0; i < 100; i++) {
        await db.create({
          id: i,
          name: `User ${i}`,
          email: `user${i}@test.com`,
        });
      }
    },
    5,
  );

  // Prepare dataset for other tests
  await db.clear();
  for (let i = 0; i < 1000; i++) {
    await db.create({ id: i, name: `User ${i}`, email: `user${i}@test.com` });
  }

  // Test 2: Find operations
  await measurePerformance(
    "FIND (single record)",
    async () => {
      await db.find(500);
    },
    1000,
  );

  // Test 3: FindAll operations
  await measurePerformance(
    "FIND ALL (1000 records)",
    async () => {
      await db.findAll();
    },
    100,
  );

  // Test 4: Update operations
  await measurePerformance(
    "UPDATE (single record)",
    async () => {
      await db.update(500, { name: "Updated User" });
    },
    1000,
  );

  // Test 5: Upsert operations
  await measurePerformance(
    "UPSERT (existing record)",
    async () => {
      await db.upsert({
        id: 500,
        name: "Upserted User",
        email: "upsert@test.com",
      });
    },
    1000,
  );

  // Test 6: Delete operations
  await measurePerformance(
    "DELETE (single record)",
    async () => {
      await db.delete(999 - Math.random() * 100);
    },
    100,
  );

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                    SUMMARY                             ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("\n✅ Performance check completed!");
  console.log(
    "\n💡 All operations use in-memory storage with async file saves",
  );
  console.log("⚡ Average operation time is typically < 1ms");
  console.log("📁 Data persists to: ./data/quick-perf.json\n");
}

quickPerformanceCheck().catch(console.error);
