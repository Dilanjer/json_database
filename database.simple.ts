import { mkdir } from "node:fs/promises";

/**
 * =============================================================================
 * DATABASE.SIMPLE.TS - In-Memory Database WITHOUT Zod
 * =============================================================================
 *
 * High-performance in-memory database with simple type validation.
 * Uses native TypeScript types for schema validation.
 *
 * =============================================================================
 * USAGE EXAMPLES
 * =============================================================================
 *
 * 1. BASIC SETUP
 * --------------
 * ```ts
 * import { Database } from "./database.simple";
 *
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 *   age?: number;
 * }
 *
 * const db = new Database<User>({
 *   fileName: "users",
 *   schema: {
 *     id: "number",
 *     name: "string",
 *     email: "string",
 *     age: "number"
 *   }
 * });
 * ```
 *
 * 2. WRITE DATA
 * -------------
 * ```ts
 * // Create single record
 * const user = await db.create({
 *   id: 1,
 *   name: "Alice",
 *   email: "alice@example.com",
 *   age: 30
 * });
 *
 * // Create multiple records
 * const users = await db.createMany([
 *   { id: 2, name: "Bob", email: "bob@example.com" },
 *   { id: 3, name: "Carol", email: "carol@example.com" }
 * ]);
 *
 * // Update record
 * await db.update(1, { age: 31 });
 *
 * // Upsert (create or update)
 * await db.upsert({ id: 4, name: "Dave", email: "dave@example.com" });
 * ```
 *
 * 3. READ DATA
 * ------------
 * ```ts
 * // Find by ID
 * const user = await db.find(1);
 *
 * // Find all
 * const allUsers = await db.findAll();
 *
 * // Find with condition
 * const adults = await db.findWhere(user => user.age && user.age >= 18);
 *
 * // Find by field
 * const user = await db.findBy("email", "alice@example.com");
 *
 * // Count records
 * const total = await db.count();
 * const activeCount = await db.count(user => user.age && user.age > 25);
 * ```
 *
 * 4. ADVANCED QUERIES
 * -------------------
 * ```ts
 * // Sorting
 * const sorted = await db.findAllSorted("age", "desc");
 *
 * // Pagination
 * const page = await db.paginate(1, 10);
 *
 * // Aggregation
 * const avgAge = await db.avg("age");
 * const maxAge = await db.max("age");
 *
 * // Grouping
 * const byAge = await db.groupBy("age");
 *
 * // Search
 * const results = await db.search("name", "alice");
 * ```
 *
 * 5. DELETE DATA
 * --------------
 * ```ts
 * // Delete single
 * await db.delete(1);
 *
 * // Delete multiple
 * await db.deleteMany(user => user.age && user.age < 18);
 *
 * // Clear all
 * await db.clear();
 * ```
 *
 * 6. CONFIGURATION OPTIONS
 * ------------------------
 * ```ts
 * const db = new Database<User>({
 *   fileName: "users",           // Required: file name
 *   schema: { ... },              // Required: type definitions
 *   dataDir: "./data",            // Optional: storage directory
 *   persistToFile: true           // Optional: enable file persistence
 * });
 * ```
 *
 * =============================================================================
 */

/**
 * Schema definition for database validation.
 * Maps field names to their expected types.
 */
export interface Schema {
  [key: string]: "string" | "number" | "boolean" | "object" | "array";
}

/**
 * Configuration options for Database initialization.
 */
export interface DatabaseConfig {
  /** Base name of the JSON file (without extension). */
  fileName: string;
  /** Schema definition that maps field names to expected types. */
  schema: Schema;
  /** Directory where the JSON file will be stored. Defaults to "./data". */
  dataDir?: string;
  /** Whether to persist data to disk. Defaults to true. */
  persistToFile?: boolean;
}

/**
 * High-performance in-memory database with optional file persistence.
 * Uses Map for O(1) lookups and async writes to prevent blocking.
 *
 * @template T - Record type, must have an `id` field (string or number)
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
   * @param config - Configuration object.
   * @remarks
   * Initialization is asynchronous – the constructor returns immediately,
   * but all operations wait for initialization to complete automatically.
   */
  constructor(config: DatabaseConfig) {
    this.fileName = config.fileName;
    this.schema = config.schema;
    this.dataDir = config.dataDir || "./data";
    this.persistToFile = config.persistToFile ?? true;
    this.filePath = `${this.dataDir}/${this.fileName}.json`;
    this.initPromise = this.initialize();
  }

  /**
   * Ensures the data directory exists and loads existing data from the file.
   */
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

  /**
   * Waits for the database to be fully initialized.
   */
  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Validates provided data against the schema.
   *
   * @param data - Partial data to validate.
   * @throws If any field does not match its expected type.
   */
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

  /**
   * Asynchronously writes the current memory store to disk.
   * Uses a debouncing mechanism to avoid excessive writes.
   */
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

  // ================= CRUD Operations =================

  /**
   * Creates a new record in the database.
   * Throws an error if a record with the same ID already exists.
   *
   * @param data - The record data.
   * @returns The created record.
   * @throws If validation fails or if the ID already exists.
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
   * @param id - The record ID.
   * @returns The found record or null if not found.
   */
  async find(id: string | number): Promise<T | null> {
    await this.ensureInitialized();
    return this.memoryStore.get(id) || null;
  }

  /**
   * Retrieves all records from the database.
   *
   * @returns Array of all records.
   */
  async findAll(): Promise<T[]> {
    await this.ensureInitialized();
    return Array.from(this.memoryStore.values());
  }

  /**
   * Updates an existing record with partial data.
   *
   * @param id - The ID of the record to update.
   * @param updates - Partial data to apply.
   * @returns The updated record, or null if the record does not exist.
   * @throws If validation fails.
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
   * @param id - The record ID.
   * @returns True if a record was deleted, false otherwise.
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
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.memoryStore.clear();
    this.persistToFileAsync();
  }

  /**
   * Creates a new record or updates if ID already exists.
   *
   * @param data - The record data.
   * @returns The upserted record.
   * @throws If validation fails.
   */
  async upsert(data: T): Promise<T> {
    await this.ensureInitialized();
    this.validateSchema(data);

    this.memoryStore.set(data.id, data);
    this.persistToFileAsync();

    return data;
  }

  // ================= File Operations =================

  /**
   * Forces all pending writes to complete and saves to file synchronously.
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
   * Useful for debugging or snapshots.
   *
   * @returns Array of all records.
   */
  getMemoryStore(): T[] {
    return Array.from(this.memoryStore.values());
  }

  /**
   * Waits for all pending write operations to complete.
   */
  async flush(): Promise<void> {
    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ================= Advanced Query Methods =================

  /**
   * Finds the first record where a specific field matches a value.
   *
   * @param key - The field name.
   * @param value - The value to match.
   * @returns The first matching record, or null.
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
   * @param predicate - Function that returns true for matching records.
   * @returns Array of matching records.
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
   *
   * @param predicate - Function that returns true for the desired record.
   * @returns The first matching record, or null.
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

  // ================= Counting & Existence =================

  /**
   * Counts all records, or records matching a predicate.
   *
   * @param predicate - Optional filter function.
   * @returns The number of records.
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
   *
   * @param id - The record ID.
   * @returns True if exists, false otherwise.
   */
  async exists(id: string | number): Promise<boolean> {
    await this.ensureInitialized();
    return this.memoryStore.has(id);
  }

  /**
   * Alias for exists() for API consistency.
   *
   * @param id - The record ID.
   * @returns True if exists, false otherwise.
   */
  async existsById(id: string | number): Promise<boolean> {
    return this.exists(id);
  }

  /**
   * Checks if any record matches a predicate.
   *
   * @param predicate - Filter function.
   * @returns True if at least one record matches.
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

  // ================= Batch Operations =================

  /**
   * Creates multiple records in a single operation.
   *
   * @param items - Array of records to create.
   * @returns The created records.
   * @throws If any ID already exists.
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
   * @param predicate - Function to select records.
   * @param updates - Partial data to apply.
   * @returns Array of updated records.
   * @throws If validation fails.
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
   * @param predicate - Function to select records.
   * @returns The number of deleted records.
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

  // ================= Sorting & Pagination =================

  /**
   * Returns all records sorted by a specific field.
   *
   * @param key - The field to sort by.
   * @param order - Sort order: "asc" (default) or "desc".
   * @returns Sorted array of records.
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
   * @param page - Page number (1-indexed, default 1).
   * @param pageSize - Number of items per page (default 10).
   * @returns Pagination result with metadata.
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

  // ================= Aggregation =================

  /**
   * Calculates the sum of a numeric field across all records.
   *
   * @param key - The numeric field to sum.
   * @returns The total sum.
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
   *
   * @param key - The numeric field to average.
   * @returns The average value, or 0 if no records.
   */
  async avg<K extends keyof T>(key: K): Promise<number> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return 0;

    const total = await this.sum(key);
    return total / items.length;
  }

  /**
   * Finds the minimum value for a field (works for numbers and strings).
   *
   * @param key - The field to evaluate.
   * @returns The minimum value, or null if no records or field undefined.
   */
  async min<K extends keyof T>(key: K): Promise<T[K] | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    let minValue: T[K] | undefined = undefined;

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
   * Finds the maximum value for a field (works for numbers and strings).
   *
   * @param key - The field to evaluate.
   * @returns The maximum value, or null if no records or field undefined.
   */
  async max<K extends keyof T>(key: K): Promise<T[K] | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    let maxValue: T[K] | undefined = undefined;

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

  // ================= Grouping =================

  /**
   * Groups records by a field value.
   *
   * @param key - The field to group by.
   * @returns A Map where keys are the distinct field values and values are arrays of records.
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

  // ================= Random & Sampling =================

  /**
   * Returns a random record from the database.
   *
   * @returns A random record, or null if the database is empty.
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
   *
   * @param n - Maximum number of records to return.
   * @returns An array of randomly selected records.
   */
  async sample(n: number): Promise<T[]> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    const sampleSize = Math.min(n, items.length);

    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  // ================= Advanced Updates =================

  /**
   * Increments a numeric field by a specified amount.
   *
   * @param id - Record ID.
   * @param key - Numeric field to increment.
   * @param amount - Amount to add (default 1).
   * @returns The updated record, or null if not found.
   * @throws If the field is not numeric.
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
   * @param id - Record ID.
   * @param key - Boolean field to toggle.
   * @returns The updated record, or null if not found.
   * @throws If the field is not boolean.
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

  // ================= Export & Import =================

  /**
   * Exports all records to a JSON string.
   *
   * @returns Pretty-printed JSON string.
   */
  async exportToJSON(): Promise<string> {
    await this.ensureInitialized();

    const arrayData = Array.from(this.memoryStore.values());
    return JSON.stringify(arrayData, null, 2);
  }

  /**
   * Imports records from a JSON string.
   *
   * @param jsonString - JSON string containing an array of records.
   * @returns The number of records imported.
   * @throws If JSON is invalid or validation fails.
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

  // ================= Search =================

  /**
   * Searches for records where a field contains the search term (case-insensitive).
   *
   * @param key - The field to search.
   * @param searchTerm - The term to look for.
   * @returns Array of matching records.
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

  // ================= Soft Delete =================

  /**
   * Marks a record as deleted without removing it.
   * Requires the record type to have an optional `deleted` boolean field.
   *
   * @param id - Record ID.
   * @returns The updated record, or null if not found.
   */
  async softDelete(id: string | number): Promise<T | null> {
    return this.update(id, { deleted: true } as unknown as Partial<T>);
  }

  /**
   * Restores a soft-deleted record.
   *
   * @param id - Record ID.
   * @returns The updated record, or null if not found.
   */
  async restore(id: string | number): Promise<T | null> {
    return this.update(id, { deleted: false } as unknown as Partial<T>);
  }

  /**
   * Returns all non-deleted records.
   * Requires the record type to have an optional `deleted` boolean field.
   *
   * @returns Array of records where `deleted` is not true.
   */
  async findAllActive(): Promise<T[]> {
    return this.findWhere((item) => {
      const itemWithDeleted = item as T & { deleted?: boolean };
      return !itemWithDeleted.deleted;
    });
  }
}
