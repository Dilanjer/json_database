import { z, type ZodType } from "zod";
import { mkdir } from "node:fs/promises";

/**
 * Configuration options for initializing a Database instance.
 *
 * @template TSchema - The Zod schema type that defines the shape of records.
 */
export interface DatabaseConfig<TSchema extends ZodType> {
  /** Base name of the JSON file (without extension). */
  fileName: string;
  /** Zod schema used to validate all records. Must include an 'id' field. */
  zodSchema: TSchema;
  /** Directory where the JSON file will be stored. Defaults to "./data". */
  dataDir?: string;
  /** Whether to persist data to disk. Defaults to true. */
  persistToFile?: boolean;
}

type InferOutput<T extends ZodType> = z.output<T>;
type InferInput<T extends ZodType> = z.input<T>;

/**
 * High-performance in-memory database with strict Zod validation and optional file persistence.
 *
 * @template TSchema - A Zod schema that defines the shape of records. Must include an `id` property of type string or number.
 *
 * @example
 * ```ts
 * const UserSchema = z.object({
 *   id: z.string().uuid(),
 *   name: z.string(),
 *   email: z.string().email(),
 *   createdAt: z.date()
 * })
 *
 * const db = new Database({
 *   fileName: 'users',
 *   zodSchema: UserSchema,
 *   dataDir: './db'
 * });
 *
 * await db.create({ id: '123', name: 'Alice', email: 'alice@example.com', createdAt: new Date() });
 * const user = await db.find('123');
 * ```
 */
export class Database<TSchema extends ZodType<{ id: string | number }>> {
  private fileName: string;
  private zodSchema: TSchema;
  private dataDir: string;
  private filePath: string;
  private initPromise: Promise<void>;
  private persistToFile: boolean;

  private memoryStore: Map<string | number, InferOutput<TSchema>> = new Map();
  private writeInProgress = false;
  private pendingWrite = false;

  /**
   * Creates a new Database instance.
   *
   * @param config - Configuration object.
   *
   * @remarks
   * Initialization is asynchronous – the constructor returns immediately,
   * but all operations wait for initialization to complete automatically.
   */
  constructor(config: DatabaseConfig<TSchema>) {
    this.fileName = config.fileName;
    this.zodSchema = config.zodSchema;
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
      const parsed = JSON.parse(content || "[]") as unknown[];

      for (const item of parsed) {
        const deserialized = this.deserializeDates(item);
        const validated = this.zodSchema.parse(deserialized);
        this.memoryStore.set(validated.id, validated);
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
   * Recursively converts ISO date strings in an object/array to Date instances.
   *
   * @param obj - The value to process.
   * @returns The deserialized value with dates restored.
   */
  private deserializeDates(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string") {
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      if (isoDateRegex.test(obj)) {
        const date = new Date(obj);
        if (!isNaN(date.getTime())) return date;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deserializeDates(item));
    }

    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.deserializeDates(
            (obj as Record<string, unknown>)[key],
          );
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * Recursively converts Date instances in an object/array to ISO strings.
   *
   * @param obj - The value to process.
   * @returns The serialized value with dates as strings.
   */
  private serializeDates(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    if (obj instanceof Date) return obj.toISOString();

    if (Array.isArray(obj)) {
      return obj.map((item) => this.serializeDates(item));
    }

    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.serializeDates(
            (obj as Record<string, unknown>)[key],
          );
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * Validates data against the schema. Optionally allows partial validation.
   *
   * @param data - The data to validate.
   * @param partial - If true, uses a partial version of the schema.
   * @returns The validated and fully typed data.
   * @throws If validation fails, throws an aggregated error message.
   */
  private validate(
    data: unknown,
    partial: boolean = false,
  ): InferOutput<TSchema> {
    try {
      if (
        partial &&
        "partial" in this.zodSchema &&
        typeof (this.zodSchema as { partial: () => ZodType }).partial ===
          "function"
      ) {
        const partialSchema = (
          this.zodSchema as { partial: () => ZodType }
        ).partial();
        return partialSchema.parse(data) as InferOutput<TSchema>;
      }
      return this.zodSchema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        throw new Error(`Validation failed: ${issues}`);
      }
      throw error;
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
        const serialized = arrayData.map((item) => this.serializeDates(item));
        await Bun.write(this.filePath, JSON.stringify(serialized, null, 2));
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
   * Creates a new record. Throws if a record with the same id already exists.
   *
   * @param data - The record data (must conform to the input schema).
   * @returns The validated record.
   * @throws If validation fails or id already exists.
   *
   * @example
   * ```ts
   * const user = await db.create({ id: '1', name: 'John' });
   * ```
   */
  async create(data: InferInput<TSchema>): Promise<InferOutput<TSchema>> {
    await this.ensureInitialized();
    const validated = this.validate(data);

    if (this.memoryStore.has(validated.id)) {
      throw new Error(`Record with id "${validated.id}" already exists`);
    }

    this.memoryStore.set(validated.id, validated);
    this.persistToFileAsync();
    return validated;
  }

  /**
   * Finds a record by its id.
   *
   * @param id - The record id.
   * @returns The record or null if not found.
   */
  async find(id: string | number): Promise<InferOutput<TSchema> | null> {
    await this.ensureInitialized();
    return this.memoryStore.get(id) || null;
  }

  /**
   * Retrieves all records.
   *
   * @returns An array of all records.
   */
  async findAll(): Promise<InferOutput<TSchema>[]> {
    await this.ensureInitialized();
    return Array.from(this.memoryStore.values());
  }

  /**
   * Updates an existing record. Throws if validation fails.
   *
   * @param id - The id of the record to update.
   * @param updates - Partial data to update.
   * @returns The updated record, or null if the record does not exist.
   */
  async update(
    id: string | number,
    updates: Partial<InferInput<TSchema>>,
  ): Promise<InferOutput<TSchema> | null> {
    await this.ensureInitialized();
    const validated = this.validate(updates, true) as Partial<
      InferOutput<TSchema>
    >;

    const existing = this.memoryStore.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...validated };
    const finalValidated = this.validate(updated);

    this.memoryStore.set(id, finalValidated);
    this.persistToFileAsync();
    return finalValidated;
  }

  /**
   * Deletes a record by id.
   *
   * @param id - The record id.
   * @returns True if a record was deleted, false otherwise.
   */
  async delete(id: string | number): Promise<boolean> {
    await this.ensureInitialized();
    const existed = this.memoryStore.delete(id);
    if (existed) this.persistToFileAsync();
    return existed;
  }

  /**
   * Deletes all records.
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.memoryStore.clear();
    this.persistToFileAsync();
  }

  /**
   * Inserts or replaces a record. If the id exists, it is overwritten.
   *
   * @param data - The record data.
   * @returns The validated record.
   */
  async upsert(data: InferInput<TSchema>): Promise<InferOutput<TSchema>> {
    await this.ensureInitialized();
    const validated = this.validate(data);
    this.memoryStore.set(validated.id, validated);
    this.persistToFileAsync();
    return validated;
  }

  // ================= Bulk Operations =================

  /**
   * Creates multiple records in one operation. If any id already exists, the entire operation fails.
   *
   * @param items - Array of records to create.
   * @returns The validated records.
   * @throws If any id already exists.
   */
  async createMany(
    items: InferInput<TSchema>[],
  ): Promise<InferOutput<TSchema>[]> {
    await this.ensureInitialized();

    const validated: InferOutput<TSchema>[] = [];

    for (const item of items) {
      const validItem = this.validate(item);
      if (this.memoryStore.has(validItem.id)) {
        throw new Error(`Record with id "${validItem.id}" already exists`);
      }
      validated.push(validItem);
    }

    for (const item of validated) {
      this.memoryStore.set(item.id, item);
    }

    this.persistToFileAsync();
    return validated;
  }

  /**
   * Updates multiple records. Only existing records are updated; non-existent ones are skipped.
   *
   * @param updates - Array of update objects, each containing an id and partial data.
   * @returns Array of updated records (only those that existed and were updated).
   */
  async updateMany(
    updates: Array<{ id: string | number; data: Partial<InferInput<TSchema>> }>,
  ): Promise<InferOutput<TSchema>[]> {
    await this.ensureInitialized();

    const results: InferOutput<TSchema>[] = [];

    for (const { id, data } of updates) {
      const validated = this.validate(data, true) as Partial<
        InferOutput<TSchema>
      >;
      const existing = this.memoryStore.get(id);

      if (existing) {
        const updated = { ...existing, ...validated };
        const finalValidated = this.validate(updated);
        this.memoryStore.set(id, finalValidated);
        results.push(finalValidated);
      }
    }

    this.persistToFileAsync();
    return results;
  }

  /**
   * Deletes multiple records by id.
   *
   * @param ids - Array of ids to delete.
   * @returns The number of records actually deleted.
   */
  async deleteMany(ids: Array<string | number>): Promise<number> {
    await this.ensureInitialized();

    let deletedCount = 0;
    for (const id of ids) {
      if (this.memoryStore.delete(id)) {
        deletedCount++;
      }
    }

    if (deletedCount > 0) this.persistToFileAsync();
    return deletedCount;
  }

  // ================= Query Operations =================

  /**
   * Finds the first record where the specified key equals the given value.
   *
   * @param key - The field name.
   * @param value - The value to match.
   * @returns The first matching record, or null.
   */
  async findBy<K extends keyof InferOutput<TSchema>>(
    key: K,
    value: InferOutput<TSchema>[K],
  ): Promise<InferOutput<TSchema> | null> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (item[key] === value) return item;
    }

    return null;
  }

  /**
   * Finds all records that satisfy a predicate.
   *
   * @param predicate - Function that returns true for matching records.
   * @returns Array of matching records.
   */
  async findWhere(
    predicate: (item: InferOutput<TSchema>) => boolean,
  ): Promise<InferOutput<TSchema>[]> {
    await this.ensureInitialized();

    const results: InferOutput<TSchema>[] = [];
    for (const item of this.memoryStore.values()) {
      if (predicate(item)) results.push(item);
    }

    return results;
  }

  /**
   * Finds the first record that satisfies a predicate.
   *
   * @param predicate - Function that returns true for the desired record.
   * @returns The first matching record, or null.
   */
  async findOne(
    predicate: (item: InferOutput<TSchema>) => boolean,
  ): Promise<InferOutput<TSchema> | null> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (predicate(item)) return item;
    }

    return null;
  }

  /**
   * Counts records. If a predicate is provided, counts only matching records.
   *
   * @param predicate - Optional filter function.
   * @returns The number of records.
   */
  async count(
    predicate?: (item: InferOutput<TSchema>) => boolean,
  ): Promise<number> {
    await this.ensureInitialized();

    if (!predicate) return this.memoryStore.size;

    let count = 0;
    for (const item of this.memoryStore.values()) {
      if (predicate(item)) count++;
    }

    return count;
  }

  /**
   * Checks whether a record with the given id exists.
   *
   * @param id - The record id.
   * @returns True if exists, false otherwise.
   */
  async existsById(id: string | number): Promise<boolean> {
    await this.ensureInitialized();
    return this.memoryStore.has(id);
  }

  /**
   * Checks whether any record satisfies the predicate.
   *
   * @param predicate - Filter function.
   * @returns True if at least one record matches.
   */
  async exists(
    predicate: (item: InferOutput<TSchema>) => boolean,
  ): Promise<boolean> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (predicate(item)) return true;
    }

    return false;
  }

  /**
   * Alias for {@link exists}.
   */
  async existsWhere(
    predicate: (item: InferOutput<TSchema>) => boolean,
  ): Promise<boolean> {
    return this.exists(predicate);
  }

  // ================= Sorting & Pagination =================

  /**
   * Returns all records sorted by a given key.
   *
   * @param key - The field to sort by.
   * @param order - "asc" (default) or "desc".
   * @returns Sorted array of records.
   */
  async findAllSorted<K extends keyof InferOutput<TSchema>>(
    key: K,
    order: "asc" | "desc" = "asc",
  ): Promise<InferOutput<TSchema>[]> {
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
   * Alias for {@link findAllSorted}.
   */
  async sortBy<K extends keyof InferOutput<TSchema>>(
    key: K,
    order: "asc" | "desc" = "asc",
  ): Promise<InferOutput<TSchema>[]> {
    return this.findAllSorted(key, order);
  }

  /**
   * Paginates through all records.
   *
   * @param page - Page number (1-indexed).
   * @param pageSize - Number of records per page.
   * @returns Pagination result with metadata.
   */
  async paginate(
    page: number,
    pageSize: number,
  ): Promise<{
    data: InferOutput<TSchema>[];
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  }> {
    await this.ensureInitialized();

    const allItems = Array.from(this.memoryStore.values());
    const totalRecords = allItems.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const data = allItems.slice(startIndex, endIndex);

    return {
      data,
      page,
      pageSize,
      totalRecords,
      totalPages,
    };
  }

  // ================= Aggregation =================

  /**
   * Sums all numeric values of a given key across all records.
   *
   * @param key - The field to sum.
   * @returns The total sum. Non-numeric values are ignored.
   */
  async sum<K extends keyof InferOutput<TSchema>>(key: K): Promise<number> {
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
   * Calculates the average of numeric values of a given key.
   *
   * @param key - The field to average.
   * @returns The average, or 0 if no records or no numeric values.
   */
  async avg<K extends keyof InferOutput<TSchema>>(key: K): Promise<number> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return 0;

    let sum = 0;
    let count = 0;

    for (const item of items) {
      const value = item[key];
      if (typeof value === "number") {
        sum += value;
        count++;
      }
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Finds the minimum value of a given key across all records.
   * Works for numbers and strings.
   *
   * @param key - The field to evaluate.
   * @returns The minimum value, or null if no records.
   */
  async min<K extends keyof InferOutput<TSchema>>(
    key: K,
  ): Promise<InferOutput<TSchema>[K] | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    let minValue: InferOutput<TSchema>[K] | null = null;

    for (const item of items) {
      const currentValue = item[key];

      if (minValue === null) {
        minValue = currentValue;
      } else if (
        typeof currentValue === "number" &&
        typeof minValue === "number"
      ) {
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
   * Finds the maximum value of a given key across all records.
   * Works for numbers and strings.
   *
   * @param key - The field to evaluate.
   * @returns The maximum value, or null if no records.
   */
  async max<K extends keyof InferOutput<TSchema>>(
    key: K,
  ): Promise<InferOutput<TSchema>[K] | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    let maxValue: InferOutput<TSchema>[K] | null = null;

    for (const item of items) {
      const currentValue = item[key];

      if (maxValue === null) {
        maxValue = currentValue;
      } else if (
        typeof currentValue === "number" &&
        typeof maxValue === "number"
      ) {
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

  /**
   * Groups records by the value of a given key.
   *
   * @param key - The field to group by.
   * @returns A Map where keys are the distinct values and values are arrays of records.
   */
  async groupBy<K extends keyof InferOutput<TSchema>>(
    key: K,
  ): Promise<Map<InferOutput<TSchema>[K], InferOutput<TSchema>[]>> {
    await this.ensureInitialized();

    const groups = new Map<InferOutput<TSchema>[K], InferOutput<TSchema>[]>();

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
   * Returns a random record.
   *
   * @returns A random record, or null if the database is empty.
   */
  async random(): Promise<InferOutput<TSchema> | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex] || null;
  }

  /**
   * Returns a random sample of up to `n` records.
   *
   * @param n - Maximum number of records to return.
   * @returns An array of randomly selected records.
   */
  async sample(n: number): Promise<InferOutput<TSchema>[]> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    const sampleSize = Math.min(n, items.length);

    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  // ================= Advanced Updates =================

  /**
   * Increments a numeric field by a given amount. Throws if the field is not numeric.
   *
   * @param id - Record id.
   * @param key - Field to increment.
   * @param amount - Amount to add (default 1).
   * @returns The updated record, or null if not found.
   * @throws If the field is not a number.
   */
  async increment<K extends keyof InferOutput<TSchema>>(
    id: string | number,
    key: K,
    amount: number = 1,
  ): Promise<InferOutput<TSchema> | null> {
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
    } as unknown;

    const validated = this.validate(updated);

    this.memoryStore.set(id, validated);
    this.persistToFileAsync();

    return validated;
  }

  /**
   * Safely increments a numeric field. Returns null instead of throwing on non-numeric.
   *
   * @param id - Record id.
   * @param key - Field to increment.
   * @param amount - Amount to add (default 1).
   * @returns The updated record, or null if not found or field is not numeric.
   */
  async safeIncrement<K extends keyof InferOutput<TSchema>>(
    id: string | number,
    key: K,
    amount: number = 1,
  ): Promise<InferOutput<TSchema> | null> {
    await this.ensureInitialized();

    const item = this.memoryStore.get(id);
    if (!item) return null;

    const currentValue = item[key];
    if (typeof currentValue !== "number") {
      return null;
    }

    const updated = {
      ...item,
      [key]: currentValue + amount,
    } as unknown;

    const result = this.safeValidate(updated);
    if (!result.success) {
      return null;
    }

    this.memoryStore.set(id, result.data);
    this.persistToFileAsync();

    return result.data;
  }

  /**
   * Toggles a boolean field. Throws if the field is not boolean.
   *
   * @param id - Record id.
   * @param key - Field to toggle.
   * @returns The updated record, or null if not found.
   * @throws If the field is not a boolean.
   */
  async toggle<K extends keyof InferOutput<TSchema>>(
    id: string | number,
    key: K,
  ): Promise<InferOutput<TSchema> | null> {
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
    } as unknown;

    const validated = this.validate(updated);

    this.memoryStore.set(id, validated);
    this.persistToFileAsync();

    return validated;
  }

  // ================= Export & Import =================

  /**
   * Exports all records as a JSON string.
   *
   * @returns Pretty-printed JSON string.
   */
  async exportToJSON(): Promise<string> {
    await this.ensureInitialized();

    const arrayData = Array.from(this.memoryStore.values());
    const serialized = arrayData.map((item) => this.serializeDates(item));
    return JSON.stringify(serialized, null, 2);
  }

  /**
   * Imports records from a JSON string. Existing records are overwritten if ids match.
   *
   * @param jsonString - JSON string containing an array of records.
   * @returns The number of records imported.
   * @throws If JSON is invalid or validation fails.
   */
  async importFromJSON(jsonString: string): Promise<number> {
    await this.ensureInitialized();

    const parsed = JSON.parse(jsonString) as unknown[];
    let importedCount = 0;

    for (const item of parsed) {
      const deserialized = this.deserializeDates(item);
      const validated = this.validate(deserialized);
      this.memoryStore.set(validated.id, validated);
      importedCount++;
    }

    this.persistToFileAsync();
    return importedCount;
  }

  // ================= Search =================

  /**
   * Performs a simple case-insensitive search on a string field.
   *
   * @param key - The field to search.
   * @param searchTerm - The term to look for.
   * @returns Array of records where the field contains the term.
   */
  async search<K extends keyof InferOutput<TSchema>>(
    key: K,
    searchTerm: string,
  ): Promise<InferOutput<TSchema>[]> {
    await this.ensureInitialized();

    const results: InferOutput<TSchema>[] = [];
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
   * Marks a record as deleted by setting a `deleted` field to true.
   * Requires the schema to have an optional `deleted` boolean field.
   *
   * @param id - Record id.
   * @returns The updated record, or null if not found.
   */
  async softDelete(id: string | number): Promise<InferOutput<TSchema> | null> {
    return this.update(id, { deleted: true } as unknown as Partial<
      InferInput<TSchema>
    >);
  }

  /**
   * Restores a soft-deleted record by setting `deleted` to false.
   *
   * @param id - Record id.
   * @returns The updated record, or null if not found.
   */
  async restore(id: string | number): Promise<InferOutput<TSchema> | null> {
    return this.update(id, { deleted: false } as unknown as Partial<
      InferInput<TSchema>
    >);
  }

  /**
   * Finds all records where `deleted` is not true.
   *
   * @returns Array of active records.
   */
  async findAllActive(): Promise<InferOutput<TSchema>[]> {
    return this.findWhere((item) => {
      const itemWithDeleted = item as InferOutput<TSchema> & {
        deleted?: boolean;
      };
      return !itemWithDeleted.deleted;
    });
  }

  // ================= File Operations =================

  /**
   * Forces an immediate write of the in-memory store to disk.
   * Waits for any pending writes to complete before writing.
   */
  async saveToFile(): Promise<void> {
    await this.ensureInitialized();

    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const arrayData = Array.from(this.memoryStore.values());
    const serialized = arrayData.map((item) => this.serializeDates(item));

    await Bun.write(this.filePath, JSON.stringify(serialized, null, 2));
  }

  /**
   * Reloads data from the file, discarding any in-memory changes.
   */
  async loadFromFile(): Promise<void> {
    await this.ensureInitialized();

    const file = Bun.file(this.filePath);

    if (await file.exists()) {
      const content = await file.text();
      const parsed = JSON.parse(content || "[]") as unknown[];

      this.memoryStore.clear();
      for (const item of parsed) {
        const deserialized = this.deserializeDates(item);
        const validated = this.zodSchema.parse(deserialized);
        this.memoryStore.set(validated.id, validated);
      }
    }
  }

  /**
   * Returns a copy of all records currently in memory (as an array).
   * Useful for debugging or snapshots.
   */
  getMemoryStore(): InferOutput<TSchema>[] {
    return Array.from(this.memoryStore.values());
  }

  /**
   * Waits for all pending file writes to complete.
   */
  async flush(): Promise<void> {
    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ================= Zod Utilities =================

  /**
   * Safely validates arbitrary data against the schema, returning a Zod result object.
   *
   * @param data - The data to validate.
   * @returns A Zod safe parse result (success or error).
   */
  safeValidate(
    data: unknown,
  ):
    | z.ZodSafeParseSuccess<InferOutput<TSchema>>
    | z.ZodSafeParseError<InferOutput<TSchema>> {
    return this.zodSchema.safeParse(data);
  }

  /**
   * Returns the underlying Zod schema.
   */
  getSchema(): TSchema {
    return this.zodSchema;
  }
}
