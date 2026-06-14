import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.resolve(__dirname, "../.mermaid_storage");

export interface VersionEntry {
  timestamp: number;
  requestId: string;
  version: number;
  code: string;
  changes?: LineChange[];
}

export interface LineChange {
  lineNumber: number;
  oldContent: string;
  newContent: string;
}

export interface FileMetadata {
  requestId: string;
  createdAt: number;
  updatedAt: number;
  versions: number;
  currentCode: string;
}

export class MermaidFileManager {
  private static instance: MermaidFileManager;
  private locks: Map<string, Promise<void>> = new Map();

  private constructor() {
    this.initStorageDir();
  }

  public static getInstance(): MermaidFileManager {
    if (!MermaidFileManager.instance) {
      MermaidFileManager.instance = new MermaidFileManager();
    }
    return MermaidFileManager.instance;
  }

  private async initStorageDir(): Promise<void> {
    try {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
    } catch (err) {
      console.error("Failed to create storage directory:", err);
    }
  }

  private getFilePath(requestId: string): string {
    return path.join(STORAGE_DIR, `${requestId}.md`);
  }

  private getHistoryPath(requestId: string): string {
    return path.join(STORAGE_DIR, `${requestId}.history.json`);
  }

  private async acquireLock(requestId: string): Promise<void> {
    while (this.locks.has(requestId)) {
      await this.locks.get(requestId);
    }
    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(requestId, lockPromise);
    return releaseLock;
  }

  private releaseLock(requestId: string, release: () => void): void {
    release();
    this.locks.delete(requestId);
  }

  public async createFile(
    requestId: string,
    code: string
  ): Promise<FileMetadata> {
    const release = await this.acquireLock(requestId);
    try {
      const filePath = this.getFilePath(requestId);
      const historyPath = this.getHistoryPath(requestId);
      const timestamp = Date.now();

      await fs.writeFile(filePath, code, "utf-8");

      const initialVersion: VersionEntry = {
        timestamp,
        requestId,
        version: 1,
        code,
      };

      await fs.writeFile(
        historyPath,
        JSON.stringify([initialVersion], null, 2),
        "utf-8"
      );

      return {
        requestId,
        createdAt: timestamp,
        updatedAt: timestamp,
        versions: 1,
        currentCode: code,
      };
    } finally {
      this.releaseLock(requestId, release);
    }
  }

  public async getFile(requestId: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(requestId);
      return await fs.readFile(filePath, "utf-8");
    } catch (err) {
      return null;
    }
  }

  public async updateFile(
    requestId: string,
    lineChanges: LineChange[]
  ): Promise<FileMetadata> {
    const release = await this.acquireLock(requestId);
    try {
      const currentCode = await this.getFile(requestId);
      if (!currentCode) {
        throw new Error(`File not found for requestId: ${requestId}`);
      }

      const lines = currentCode.split("\n");
      const newLines = [...lines];

      for (const change of lineChanges) {
        if (change.lineNumber >= 1 && change.lineNumber <= newLines.length) {
          newLines[change.lineNumber - 1] = change.newContent;
        }
      }

      const newCode = newLines.join("\n");
      const filePath = this.getFilePath(requestId);
      const historyPath = this.getHistoryPath(requestId);
      const timestamp = Date.now();

      await fs.writeFile(filePath, newCode, "utf-8");

      let history: VersionEntry[] = [];
      try {
        const historyContent = await fs.readFile(historyPath, "utf-8");
        history = JSON.parse(historyContent);
      } catch {
        history = [];
      }

      const newVersion: VersionEntry = {
        timestamp,
        requestId,
        version: history.length + 1,
        code: newCode,
        changes: lineChanges,
      };

      history.push(newVersion);
      await fs.writeFile(
        historyPath,
        JSON.stringify(history, null, 2),
        "utf-8"
      );

      return {
        requestId,
        createdAt: history[0]?.timestamp || timestamp,
        updatedAt: timestamp,
        versions: history.length,
        currentCode: newCode,
      };
    } finally {
      this.releaseLock(requestId, release);
    }
  }

  public async getHistory(requestId: string): Promise<VersionEntry[] | null> {
    try {
      const historyPath = this.getHistoryPath(requestId);
      const content = await fs.readFile(historyPath, "utf-8");
      return JSON.parse(content);
    } catch (err) {
      return null;
    }
  }

  public async deleteFile(requestId: string): Promise<void> {
    const release = await this.acquireLock(requestId);
    try {
      const filePath = this.getFilePath(requestId);
      const historyPath = this.getHistoryPath(requestId);
      await fs.unlink(filePath).catch(() => {});
      await fs.unlink(historyPath).catch(() => {});
    } finally {
      this.releaseLock(requestId, release);
    }
  }

  public async getMetadata(requestId: string): Promise<FileMetadata | null> {
    const code = await this.getFile(requestId);
    const history = await this.getHistory(requestId);

    if (!code || !history) {
      return null;
    }

    return {
      requestId,
      createdAt: history[0].timestamp,
      updatedAt: history[history.length - 1].timestamp,
      versions: history.length,
      currentCode: code,
    };
  }
}

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
