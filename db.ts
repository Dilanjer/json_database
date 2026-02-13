import { mkdir } from "node:fs/promises";

/**
 * Schema definition for database validation.
 * Maps field names to their expected types.
 *
 * @example
 * ```ts
 * const schema = {
 *   id: "number",
 *   name: "string",
 *   tags: "array"
 * } as const;
 * ```
 */
export interface Schema {
  [key: string]: "string" | "number" | "boolean" | "object" | "array";
}

/**
 * Configuration options for Database initialization.
 *
 * @property fileName - Name of the file (without extension) to store data
 * @property schema - Schema definition for data validation
 * @property dataDir - Directory path for data files (default: "./data")
 * @property persistToFile - Enable file persistence (default: true)
 */
export interface DatabaseConfig {
  fileName: string;
  schema: Schema;
  dataDir?: string;
  persistToFile?: boolean;
}

/**
 * High-performance in-memory database with optional file persistence.
 * Uses Map for O(1) lookups and async writes to prevent blocking.
 *
 * @template T - Record type, must have an `id` field (string or number)
 *
 * @example
 * ```ts
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * const db = new Database<User>({
 *   fileName: "users",
 *   schema: {
 *     id: "number",
 *     name: "string",
 *     email: "string"
 *   }
 * });
 * ```
 */
export class Database<T extends { id: string | number }> {
  private fileName: string;
  private schema: Schema;
  private dataDir: string;
  private filePath: string;
  private initPromise: Promise<void>;
  private persistToFile: boolean;

  /** In-memory Map storage for O(1) lookups */
  private memoryStore: Map<string | number, T> = new Map();

  private writeInProgress = false;
  private pendingWrite = false;

  /**
   * Creates a new Database instance.
   *
   * @param config - Database configuration
   *
   * @example
   * ```ts
   * const db = new Database<User>({
   *   fileName: "users",
   *   schema: { id: "number", name: "string" },
   *   dataDir: "./data",
   *   persistToFile: true
   * });
   * ```
   */
  constructor(config: DatabaseConfig) {
    this.fileName = config.fileName;
    this.schema = config.schema;
    this.dataDir = config.dataDir || "./data";
    this.persistToFile = config.persistToFile ?? true;
    this.filePath = `${this.dataDir}/${this.fileName}.json`;
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.persistToFile) return;

    await mkdir(this.dataDir, { recursive: true }).catch(() => {});

    const file = Bun.file(this.filePath);

    if (await file.exists()) {
      const content = await file.text();
      const parsed: T[] = JSON.parse(content || "[]");

      for (const item of parsed) {
        this.memoryStore.set(item.id, item);
      }
    } else {
      await Bun.write(this.filePath, JSON.stringify([], null, 2));
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private validateSchema(data: Partial<T>): void {
    for (const [key, expectedType] of Object.entries(this.schema)) {
      if (data[key as keyof T] !== undefined) {
        const value = data[key as keyof T];
        const actualType = Array.isArray(value) ? "array" : typeof value;

        if (actualType !== expectedType) {
          throw new Error(
            `Schema validation failed: "${key}" should be ${expectedType}, got ${actualType}`,
          );
        }
      }
    }
  }

  private async persistToFileAsync(): Promise<void> {
    if (!this.persistToFile) return;

    this.pendingWrite = true;

    if (this.writeInProgress) return;

    this.writeInProgress = true;

    try {
      while (this.pendingWrite) {
        this.pendingWrite = false;

        const arrayData = Array.from(this.memoryStore.values());

        await Bun.write(this.filePath, JSON.stringify(arrayData, null, 2));
      }
    } catch (err) {
      console.error("Database write error:", err);
    } finally {
      this.writeInProgress = false;

      if (this.pendingWrite) {
        await this.persistToFileAsync();
      }
    }
  }

  /**
   * Creates a new record in the database.
   * Throws an error if a record with the same ID already exists.
   *
   * @param data - The record to create
   * @returns The created record
   * @throws Error if record with same ID exists
   * @throws Error if schema validation fails
   *
   * @example
   * ```ts
   * const user = await db.create({
   *   id: 1,
   *   name: "Alice",
   *   email: "alice@example.com"
   * });
   * ```
   */
  async create(data: T): Promise<T> {
    await this.ensureInitialized();
    this.validateSchema(data);

    if (this.memoryStore.has(data.id)) {
      throw new Error(`Record with id "${data.id}" already exists`);
    }

    this.memoryStore.set(data.id, data);
    this.persistToFileAsync();

    return data;
  }

  /**
   * Finds a single record by ID.
   *
   * @param id - The record ID to find
   * @returns The record if found, null otherwise
   *
   * @example
   * ```ts
   * const user = await db.find(1);
   * if (user) {
   *   console.log(user.name);
   * }
   * ```
   */
  async find(id: string | number): Promise<T | null> {
    await this.ensureInitialized();
    return this.memoryStore.get(id) || null;
  }

  /**
   * Retrieves all records from the database.
   *
   * @returns Array of all records
   *
   * @example
   * ```ts
   * const allUsers = await db.findAll();
   * console.log(`Total users: ${allUsers.length}`);
   * ```
   */
  async findAll(): Promise<T[]> {
    await this.ensureInitialized();
    return Array.from(this.memoryStore.values());
  }

  /**
   * Updates an existing record with partial data.
   *
   * @param id - The record ID to update
   * @param updates - Partial record data to merge
   * @returns The updated record if found, null otherwise
   * @throws Error if schema validation fails
   *
   * @example
   * ```ts
   * const updated = await db.update(1, { name: "Alice Smith" });
   * ```
   */
  async update(id: string | number, updates: Partial<T>): Promise<T | null> {
    await this.ensureInitialized();
    this.validateSchema(updates);

    const existing = this.memoryStore.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates } as T;
    this.memoryStore.set(id, updated);

    this.persistToFileAsync();
    return updated;
  }

  /**
   * Deletes a record by ID.
   *
   * @param id - The record ID to delete
   * @returns true if record was deleted, false if not found
   *
   * @example
   * ```ts
   * const deleted = await db.delete(1);
   * if (deleted) {
   *   console.log("User deleted");
   * }
   * ```
   */
  async delete(id: string | number): Promise<boolean> {
    await this.ensureInitialized();

    const existed = this.memoryStore.delete(id);

    if (existed) {
      this.persistToFileAsync();
    }

    return existed;
  }

  /**
   * Deletes all records from the database.
   *
   * @example
   * ```ts
   * await db.clear();
   * console.log("All records deleted");
   * ```
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.memoryStore.clear();
    this.persistToFileAsync();
  }

  /**
   * Creates a new record or updates if ID already exists.
   *
   * @param data - The record to create or update
   * @returns The upserted record
   * @throws Error if schema validation fails
   *
   * @example
   * ```ts
   * const user = await db.upsert({
   *   id: 1,
   *   name: "Alice",
   *   email: "alice@example.com"
   * });
   * ```
   */
  async upsert(data: T): Promise<T> {
    await this.ensureInitialized();
    this.validateSchema(data);

    this.memoryStore.set(data.id, data);
    this.persistToFileAsync();

    return data;
  }

  /**
   * Forces all pending writes to complete and saves to file synchronously.
   * Useful before critical operations or app shutdown.
   *
   * @example
   * ```ts
   * await db.saveToFile();
   * console.log("All data persisted to disk");
   * ```
   */
  async saveToFile(): Promise<void> {
    await this.ensureInitialized();

    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const arrayData = Array.from(this.memoryStore.values());

    await Bun.write(this.filePath, JSON.stringify(arrayData, null, 2));
  }

  /**
   * Reloads all data from the file, replacing in-memory data.
   * Useful for syncing with external file changes.
   *
   * @example
   * ```ts
   * await db.loadFromFile();
   * console.log("Data reloaded from disk");
   * ```
   */
  async loadFromFile(): Promise<void> {
    await this.ensureInitialized();

    const file = Bun.file(this.filePath);

    if (await file.exists()) {
      const content = await file.text();
      const parsed: T[] = JSON.parse(content || "[]");

      this.memoryStore.clear();
      for (const item of parsed) {
        this.memoryStore.set(item.id, item);
      }
    }
  }

  /**
   * Returns a copy of all records in memory.
   * Direct access to the internal Map representation.
   *
   * @returns Array of all records
   *
   * @example
   * ```ts
   * const records = db.getMemoryStore();
   * ```
   */
  getMemoryStore(): T[] {
    return Array.from(this.memoryStore.values());
  }

  /**
   * Waits for all pending write operations to complete.
   * Useful before critical read operations after bulk writes.
   *
   * @example
   * ```ts
   * await db.createMany(users);
   * await db.flush(); // Ensure all writes complete
   * const count = await db.count();
   * ```
   */
  async flush(): Promise<void> {
    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // 🔍 Advanced Query Methods

  /**
   * Finds the first record where a specific field matches a value.
   * More efficient than findWhere for simple field matching.
   *
   * @param key - The field name to search
   * @param value - The value to match
   * @returns The first matching record, or null if not found
   *
   * @example
   * ```ts
   * const user = await db.findBy("email", "alice@example.com");
   * if (user) {
   *   console.log(`Found: ${user.name}`);
   * }
   * ```
   */
  async findBy<K extends keyof T>(key: K, value: T[K]): Promise<T | null> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (item[key] === value) {
        return item;
      }
    }

    return null;
  }

  /**
   * Finds all records matching a predicate function.
   *
   * @param predicate - Function that returns true for matching records
   * @returns Array of matching records
   *
   * @example
   * ```ts
   * const activeAdmins = await db.findWhere(
   *   user => user.active && user.role === "admin"
   * );
   * ```
   */
  async findWhere(predicate: (item: T) => boolean): Promise<T[]> {
    await this.ensureInitialized();

    const results: T[] = [];
    for (const item of this.memoryStore.values()) {
      if (predicate(item)) {
        results.push(item);
      }
    }

    return results;
  }

  /**
   * Finds the first record matching a predicate function.
   * Stops searching after finding the first match.
   *
   * @param predicate - Function that returns true for the desired record
   * @returns The first matching record, or null if not found
   *
   * @example
   * ```ts
   * const firstAdmin = await db.findOne(user => user.role === "admin");
   * ```
   */
  async findOne(predicate: (item: T) => boolean): Promise<T | null> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (predicate(item)) {
        return item;
      }
    }

    return null;
  }

  // 📊 Counting & Existence

  /**
   * Counts all records, or records matching a predicate.
   * O(1) when no predicate provided, O(n) with predicate.
   *
   * @param predicate - Optional filter function
   * @returns Count of matching records
   *
   * @example
   * ```ts
   * const total = await db.count();
   * const activeCount = await db.count(user => user.active);
   * ```
   */
  async count(predicate?: (item: T) => boolean): Promise<number> {
    await this.ensureInitialized();

    if (!predicate) {
      return this.memoryStore.size;
    }

    let count = 0;
    for (const item of this.memoryStore.values()) {
      if (predicate(item)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Checks if a record exists by ID.
   * Very fast O(1) operation.
   *
   * @param id - The record ID to check
   * @returns true if record exists, false otherwise
   *
   * @example
   * ```ts
   * if (await db.exists(1)) {
   *   console.log("User exists");
   * }
   * ```
   */
  async exists(id: string | number): Promise<boolean> {
    await this.ensureInitialized();
    return this.memoryStore.has(id);
  }

  /**
   * Checks if any record matches a predicate.
   * Stops searching after finding the first match.
   *
   * @param predicate - Function to test records
   * @returns true if at least one record matches
   *
   * @example
   * ```ts
   * const hasAdmins = await db.existsWhere(user => user.role === "admin");
   * ```
   */
  async existsWhere(predicate: (item: T) => boolean): Promise<boolean> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (predicate(item)) {
        return true;
      }
    }

    return false;
  }

  // 🔄 Batch Operations

  /**
   * Creates multiple records in a single operation.
   * Much more efficient than calling create() in a loop.
   *
   * @param items - Array of records to create
   * @returns Array of created records
   * @throws Error if any record ID already exists
   * @throws Error if schema validation fails for any record
   *
   * @example
   * ```ts
   * const users = await db.createMany([
   *   { id: 1, name: "Alice", email: "alice@example.com" },
   *   { id: 2, name: "Bob", email: "bob@example.com" }
   * ]);
   * console.log(`Created ${users.length} users`);
   * ```
   */
  async createMany(items: T[]): Promise<T[]> {
    await this.ensureInitialized();

    const created: T[] = [];

    for (const item of items) {
      this.validateSchema(item);

      if (this.memoryStore.has(item.id)) {
        throw new Error(`Record with id "${item.id}" already exists`);
      }

      this.memoryStore.set(item.id, item);
      created.push(item);
    }

    this.persistToFileAsync();
    return created;
  }

  /**
   * Updates all records matching a predicate.
   *
   * @param predicate - Function to identify records to update
   * @param updates - Partial data to merge into matching records
   * @returns Array of updated records
   * @throws Error if schema validation fails
   *
   * @example
   * ```ts
   * const updated = await db.updateMany(
   *   user => user.role === "user",
   *   { active: true }
   * );
   * console.log(`Updated ${updated.length} users`);
   * ```
   */
  async updateMany(
    predicate: (item: T) => boolean,
    updates: Partial<T>,
  ): Promise<T[]> {
    await this.ensureInitialized();
    this.validateSchema(updates);

    const updated: T[] = [];

    for (const [id, item] of this.memoryStore.entries()) {
      if (predicate(item)) {
        const updatedItem = { ...item, ...updates } as T;
        this.memoryStore.set(id, updatedItem);
        updated.push(updatedItem);
      }
    }

    if (updated.length > 0) {
      this.persistToFileAsync();
    }

    return updated;
  }

  /**
   * Deletes all records matching a predicate.
   *
   * @param predicate - Function to identify records to delete
   * @returns Count of deleted records
   *
   * @example
   * ```ts
   * const count = await db.deleteMany(user => user.score < 50);
   * console.log(`Deleted ${count} users`);
   * ```
   */
  async deleteMany(predicate: (item: T) => boolean): Promise<number> {
    await this.ensureInitialized();

    let deletedCount = 0;
    const idsToDelete: (string | number)[] = [];

    for (const [id, item] of this.memoryStore.entries()) {
      if (predicate(item)) {
        idsToDelete.push(id);
      }
    }

    for (const id of idsToDelete) {
      this.memoryStore.delete(id);
      deletedCount++;
    }

    if (deletedCount > 0) {
      this.persistToFileAsync();
    }

    return deletedCount;
  }

  // 📑 Sorting & Pagination

  /**
   * Returns all records sorted by a specific field.
   *
   * @param key - Field name to sort by
   * @param order - Sort order: "asc" (default) or "desc"
   * @returns Array of sorted records
   *
   * @example
   * ```ts
   * const byAge = await db.findAllSorted("age", "asc");
   * const byScore = await db.findAllSorted("score", "desc");
   * ```
   */
  async findAllSorted<K extends keyof T>(
    key: K,
    order: "asc" | "desc" = "asc",
  ): Promise<T[]> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());

    return items.sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];

      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });
  }

  /**
   * Returns a paginated subset of records.
   *
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of records per page
   * @returns Pagination result with items and metadata
   *
   * @example
   * ```ts
   * const result = await db.paginate(1, 20);
   * console.log(`Page ${result.page} of ${result.totalPages}`);
   * console.log(`Showing ${result.items.length} of ${result.total} items`);
   * ```
   */
  async paginate(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    await this.ensureInitialized();

    const allItems = Array.from(this.memoryStore.values());
    const total = allItems.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = allItems.slice(startIndex, endIndex);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // 🔢 Aggregation

  /**
   * Calculates the sum of a numeric field across all records.
   * Non-numeric values are ignored.
   *
   * @param key - Field name to sum
   * @returns Sum of all numeric values for the field
   *
   * @example
   * ```ts
   * const totalScore = await db.sum("score");
   * console.log(`Total points: ${totalScore}`);
   * ```
   */
  async sum<K extends keyof T>(key: K): Promise<number> {
    await this.ensureInitialized();

    let sum = 0;
    for (const item of this.memoryStore.values()) {
      const value = item[key];
      if (typeof value === "number") {
        sum += value;
      }
    }

    return sum;
  }

  /**
   * Calculates the average of a numeric field.
   * Returns 0 if no records exist.
   *
   * @param key - Field name to average
   * @returns Average value
   *
   * @example
   * ```ts
   * const avgAge = await db.avg("age");
   * console.log(`Average age: ${avgAge.toFixed(1)}`);
   * ```
   */
  async avg<K extends keyof T>(key: K): Promise<number> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return 0;

    const total = await this.sum(key);
    return total / items.length;
  }

  /**
   * Finds the minimum value for a field.
   * Works with numbers and strings (lexicographic comparison).
   *
   * @param key - Field name to find minimum
   * @returns Minimum value, or null if no records
   *
   * @example
   * ```ts
   * const minScore = await db.min("score");
   * console.log(`Lowest score: ${minScore}`);
   * ```
   */
  async min<K extends keyof T>(key: K): Promise<T[K] | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    let minValue: T[K] | undefined = undefined;

    // Find first non-undefined value
    for (const item of items) {
      const value = item[key];
      if (value !== undefined) {
        minValue = value;
        break;
      }
    }

    if (minValue === undefined) return null;

    for (const item of items) {
      const currentValue = item[key];
      if (currentValue === undefined) continue;

      if (typeof currentValue === "number" && typeof minValue === "number") {
        if (currentValue < minValue) {
          minValue = currentValue;
        }
      } else if (
        typeof currentValue === "string" &&
        typeof minValue === "string"
      ) {
        if (currentValue < minValue) {
          minValue = currentValue;
        }
      }
    }

    return minValue;
  }

  /**
   * Finds the maximum value for a field.
   * Works with numbers and strings (lexicographic comparison).
   *
   * @param key - Field name to find maximum
   * @returns Maximum value, or null if no records
   *
   * @example
   * ```ts
   * const maxAge = await db.max("age");
   * console.log(`Oldest user: ${maxAge} years`);
   * ```
   */
  async max<K extends keyof T>(key: K): Promise<T[K] | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    let maxValue: T[K] | undefined = undefined;

    // Find first non-undefined value
    for (const item of items) {
      const value = item[key];
      if (value !== undefined) {
        maxValue = value;
        break;
      }
    }

    if (maxValue === undefined) return null;

    for (const item of items) {
      const currentValue = item[key];
      if (currentValue === undefined) continue;

      if (typeof currentValue === "number" && typeof maxValue === "number") {
        if (currentValue > maxValue) {
          maxValue = currentValue;
        }
      } else if (
        typeof currentValue === "string" &&
        typeof maxValue === "string"
      ) {
        if (currentValue > maxValue) {
          maxValue = currentValue;
        }
      }
    }

    return maxValue;
  }

  // 🗂️ Grouping

  /**
   * Groups records by a field value.
   *
   * @param key - Field name to group by
   * @returns Map of field values to arrays of records
   *
   * @example
   * ```ts
   * const byRole = await db.groupBy("role");
   * for (const [role, users] of byRole) {
   *   console.log(`${role}: ${users.length} users`);
   * }
   * ```
   */
  async groupBy<K extends keyof T>(key: K): Promise<Map<T[K], T[]>> {
    await this.ensureInitialized();

    const groups = new Map<T[K], T[]>();

    for (const item of this.memoryStore.values()) {
      const groupKey = item[key];

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }

      groups.get(groupKey)!.push(item);
    }

    return groups;
  }

  // 🎲 Random & Sampling

  /**
   * Returns a random record from the database.
   *
   * @returns Random record, or null if database is empty
   *
   * @example
   * ```ts
   * const randomUser = await db.random();
   * console.log(`Random user: ${randomUser?.name}`);
   * ```
   */
  async random(): Promise<T | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex] || null;
  }

  /**
   * Returns n random records without duplicates.
   * If n exceeds total records, returns all records shuffled.
   *
   * @param n - Number of records to sample
   * @returns Array of random records
   *
   * @example
   * ```ts
   * const randomTen = await db.sample(10);
   * console.log(`Sampled ${randomTen.length} users`);
   * ```
   */
  async sample(n: number): Promise<T[]> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    const sampleSize = Math.min(n, items.length);

    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  // 🔄 Advanced Updates

  /**
   * Increments a numeric field by a specified amount.
   *
   * @param id - Record ID to update
   * @param key - Numeric field to increment
   * @param amount - Amount to add (can be negative for decrement)
   * @returns Updated record, or null if not found
   * @throws Error if field is not numeric
   *
   * @example
   * ```ts
   * await db.increment(1, "score", 10);  // Add 10
   * await db.increment(1, "score", -5);  // Subtract 5
   * ```
   */
  async increment<K extends keyof T>(
    id: string | number,
    key: K,
    amount: number = 1,
  ): Promise<T | null> {
    await this.ensureInitialized();

    const item = this.memoryStore.get(id);
    if (!item) return null;

    const currentValue = item[key];
    if (typeof currentValue !== "number") {
      throw new Error(`Cannot increment non-numeric field "${String(key)}"`);
    }

    const updated = {
      ...item,
      [key]: currentValue + amount,
    } as T;

    this.memoryStore.set(id, updated);
    this.persistToFileAsync();

    return updated;
  }

  /**
   * Toggles a boolean field between true and false.
   *
   * @param id - Record ID to update
   * @param key - Boolean field to toggle
   * @returns Updated record, or null if not found
   * @throws Error if field is not boolean
   *
   * @example
   * ```ts
   * await db.toggle(1, "active");  // true -> false or false -> true
   * ```
   */
  async toggle<K extends keyof T>(
    id: string | number,
    key: K,
  ): Promise<T | null> {
    await this.ensureInitialized();

    const item = this.memoryStore.get(id);
    if (!item) return null;

    const currentValue = item[key];
    if (typeof currentValue !== "boolean") {
      throw new Error(`Cannot toggle non-boolean field "${String(key)}"`);
    }

    const updated = {
      ...item,
      [key]: !currentValue,
    } as T;

    this.memoryStore.set(id, updated);
    this.persistToFileAsync();

    return updated;
  }

  // 📤 Export & Import

  /**
   * Exports all records to a JSON string.
   *
   * @returns JSON string representation of all records
   *
   * @example
   * ```ts
   * const json = await db.exportToJSON();
   * await Bun.write("backup.json", json);
   * ```
   */
  async exportToJSON(): Promise<string> {
    await this.ensureInitialized();

    const arrayData = Array.from(this.memoryStore.values());
    return JSON.stringify(arrayData, null, 2);
  }

  /**
   * Imports records from a JSON string.
   * Overwrites existing records with the same ID.
   *
   * @param jsonString - JSON string containing array of records
   * @returns Count of imported records
   * @throws Error if JSON parsing fails
   * @throws Error if schema validation fails
   *
   * @example
   * ```ts
   * const json = await Bun.file("backup.json").text();
   * const count = await db.importFromJSON(json);
   * console.log(`Imported ${count} records`);
   * ```
   */
  async importFromJSON(jsonString: string): Promise<number> {
    await this.ensureInitialized();

    const parsed: T[] = JSON.parse(jsonString);
    let importedCount = 0;

    for (const item of parsed) {
      this.validateSchema(item);
      this.memoryStore.set(item.id, item);
      importedCount++;
    }

    this.persistToFileAsync();
    return importedCount;
  }

  // 🔍 Search

  /**
   * Searches for records where a field contains the search term.
   * Case-insensitive partial matching.
   *
   * @param key - Field name to search in
   * @param searchTerm - Text to search for
   * @returns Array of matching records
   *
   * @example
   * ```ts
   * const results = await db.search("name", "john");
   * // Finds "John", "Johnny", "john123", etc.
   * ```
   */
  async search<K extends keyof T>(key: K, searchTerm: string): Promise<T[]> {
    await this.ensureInitialized();

    const results: T[] = [];
    const lowerSearchTerm = searchTerm.toLowerCase();

    for (const item of this.memoryStore.values()) {
      const value = String(item[key]).toLowerCase();
      if (value.includes(lowerSearchTerm)) {
        results.push(item);
      }
    }

    return results;
  }

  // 🗑️ Soft Delete (requires a 'deleted' field in schema)

  /**
   * Marks a record as deleted without removing it.
   * Requires a 'deleted' boolean field in your schema.
   *
   * @param id - Record ID to soft delete
   * @returns Updated record, or null if not found
   *
   * @example
   * ```ts
   * await db.softDelete(1);
   * // Record still exists but deleted = true
   * ```
   */
  async softDelete(id: string | number): Promise<T | null> {
    return this.update(id, { deleted: true } as unknown as Partial<T>);
  }

  /**
   * Restores a soft-deleted record.
   *
   * @param id - Record ID to restore
   * @returns Updated record, or null if not found
   *
   * @example
   * ```ts
   * await db.restore(1);
   * // Record is now active again (deleted = false)
   * ```
   */
  async restore(id: string | number): Promise<T | null> {
    return this.update(id, { deleted: false } as unknown as Partial<T>);
  }

  /**
   * Returns all non-deleted records.
   * Only includes records where deleted is false or undefined.
   *
   * @returns Array of active (non-deleted) records
   *
   * @example
   * ```ts
   * const activeUsers = await db.findAllActive();
   * console.log(`${activeUsers.length} active users`);
   * ```
   */
  async findAllActive(): Promise<T[]> {
    return this.findWhere((item) => {
      const itemWithDeleted = item as T & { deleted?: boolean };
      return !itemWithDeleted.deleted;
    });
  }
}
