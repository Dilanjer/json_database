export interface Schema {
  [key: string]: "string" | "number" | "boolean" | "object" | "array";
}

export interface DatabaseConfig {
  fileName: string;
  schema: Schema;
  dataDir?: string;
  persistToFile?: boolean;
}

export class Database<T extends { id: string | number }> {
  private fileName: string;
  private schema: Schema;
  private dataDir: string;
  private filePath: string;
  private initPromise: Promise<void>;
  private persistToFile: boolean;

  // 🔥 Now using Map (O(1))
  private memoryStore: Map<string | number, T> = new Map();

  private writeInProgress = false;
  private pendingWrite = false;

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

    await Bun.spawn(["mkdir", "-p", this.dataDir]).exited;

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

  async find(id: string | number): Promise<T | null> {
    await this.ensureInitialized();
    return this.memoryStore.get(id) || null;
  }

  async findAll(): Promise<T[]> {
    await this.ensureInitialized();
    return Array.from(this.memoryStore.values());
  }

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

  async delete(id: string | number): Promise<boolean> {
    await this.ensureInitialized();

    const existed = this.memoryStore.delete(id);

    if (existed) {
      this.persistToFileAsync();
    }

    return existed;
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.memoryStore.clear();
    this.persistToFileAsync();
  }

  async upsert(data: T): Promise<T> {
    await this.ensureInitialized();
    this.validateSchema(data);

    this.memoryStore.set(data.id, data);
    this.persistToFileAsync();

    return data;
  }

  async saveToFile(): Promise<void> {
    await this.ensureInitialized();

    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const arrayData = Array.from(this.memoryStore.values());

    await Bun.write(this.filePath, JSON.stringify(arrayData, null, 2));
  }

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

  getMemoryStore(): T[] {
    return Array.from(this.memoryStore.values());
  }

  async flush(): Promise<void> {
    while (this.writeInProgress || this.pendingWrite) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // 🔍 Advanced Query Methods
  async findBy<K extends keyof T>(key: K, value: T[K]): Promise<T | null> {
    await this.ensureInitialized();

    for (const item of this.memoryStore.values()) {
      if (item[key] === value) {
        return item;
      }
    }

    return null;
  }

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

  async exists(id: string | number): Promise<boolean> {
    await this.ensureInitialized();
    return this.memoryStore.has(id);
  }

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

  async avg<K extends keyof T>(key: K): Promise<number> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return 0;

    const total = await this.sum(key);
    return total / items.length;
  }

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
      
      if (typeof currentValue === 'number' && typeof minValue === 'number') {
        if (currentValue < minValue) {
          minValue = currentValue;
        }
      } else if (typeof currentValue === 'string' && typeof minValue === 'string') {
        if (currentValue < minValue) {
          minValue = currentValue;
        }
      }
    }

    return minValue;
  }

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
      
      if (typeof currentValue === 'number' && typeof maxValue === 'number') {
        if (currentValue > maxValue) {
          maxValue = currentValue;
        }
      } else if (typeof currentValue === 'string' && typeof maxValue === 'string') {
        if (currentValue > maxValue) {
          maxValue = currentValue;
        }
      }
    }

    return maxValue;
  }

  // 🗂️ Grouping
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
  async random(): Promise<T | null> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    if (items.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex] || null;
  }

  async sample(n: number): Promise<T[]> {
    await this.ensureInitialized();

    const items = Array.from(this.memoryStore.values());
    const sampleSize = Math.min(n, items.length);

    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  // 🔄 Advanced Updates
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
  async exportToJSON(): Promise<string> {
    await this.ensureInitialized();

    const arrayData = Array.from(this.memoryStore.values());
    return JSON.stringify(arrayData, null, 2);
  }

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
  async softDelete(id: string | number): Promise<T | null> {
    return this.update(id, { deleted: true } as unknown as Partial<T>);
  }

  async restore(id: string | number): Promise<T | null> {
    return this.update(id, { deleted: false } as unknown as Partial<T>);
  }

  async findAllActive(): Promise<T[]> {
    return this.findWhere((item) => {
      const itemWithDeleted = item as T & { deleted?: boolean };
      return !itemWithDeleted.deleted;
    });
  }
}
