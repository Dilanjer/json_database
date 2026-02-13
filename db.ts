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
        this.persistToFileAsync();
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
}
