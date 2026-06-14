import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.resolve(__dirname, "../.mermaid_storage");
export class MermaidFileManager {
    static instance;
    locks = new Map();
    constructor() {
        this.initStorageDir();
    }
    static getInstance() {
        if (!MermaidFileManager.instance) {
            MermaidFileManager.instance = new MermaidFileManager();
        }
        return MermaidFileManager.instance;
    }
    async initStorageDir() {
        try {
            await fs.mkdir(STORAGE_DIR, { recursive: true });
        }
        catch (err) {
            console.error("Failed to create storage directory:", err);
        }
    }
    getFilePath(requestId) {
        return path.join(STORAGE_DIR, `${requestId}.md`);
    }
    getHistoryPath(requestId) {
        return path.join(STORAGE_DIR, `${requestId}.history.json`);
    }
    async acquireLock(requestId) {
        while (this.locks.has(requestId)) {
            await this.locks.get(requestId);
        }
        let releaseLock;
        const lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        this.locks.set(requestId, lockPromise);
        return releaseLock;
    }
    releaseLock(requestId, release) {
        release();
        this.locks.delete(requestId);
    }
    async createFile(requestId, code) {
        const release = await this.acquireLock(requestId);
        try {
            const filePath = this.getFilePath(requestId);
            const historyPath = this.getHistoryPath(requestId);
            const timestamp = Date.now();
            await fs.writeFile(filePath, code, "utf-8");
            const initialVersion = {
                timestamp,
                requestId,
                version: 1,
                code,
            };
            await fs.writeFile(historyPath, JSON.stringify([initialVersion], null, 2), "utf-8");
            return {
                requestId,
                createdAt: timestamp,
                updatedAt: timestamp,
                versions: 1,
                currentCode: code,
            };
        }
        finally {
            this.releaseLock(requestId, release);
        }
    }
    async getFile(requestId) {
        try {
            const filePath = this.getFilePath(requestId);
            return await fs.readFile(filePath, "utf-8");
        }
        catch (err) {
            return null;
        }
    }
    async updateFile(requestId, lineChanges) {
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
            let history = [];
            try {
                const historyContent = await fs.readFile(historyPath, "utf-8");
                history = JSON.parse(historyContent);
            }
            catch {
                history = [];
            }
            const newVersion = {
                timestamp,
                requestId,
                version: history.length + 1,
                code: newCode,
                changes: lineChanges,
            };
            history.push(newVersion);
            await fs.writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");
            return {
                requestId,
                createdAt: history[0]?.timestamp || timestamp,
                updatedAt: timestamp,
                versions: history.length,
                currentCode: newCode,
            };
        }
        finally {
            this.releaseLock(requestId, release);
        }
    }
    async getHistory(requestId) {
        try {
            const historyPath = this.getHistoryPath(requestId);
            const content = await fs.readFile(historyPath, "utf-8");
            return JSON.parse(content);
        }
        catch (err) {
            return null;
        }
    }
    async deleteFile(requestId) {
        const release = await this.acquireLock(requestId);
        try {
            const filePath = this.getFilePath(requestId);
            const historyPath = this.getHistoryPath(requestId);
            await fs.unlink(filePath).catch(() => { });
            await fs.unlink(historyPath).catch(() => { });
        }
        finally {
            this.releaseLock(requestId, release);
        }
    }
    async getMetadata(requestId) {
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
export function generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
//# sourceMappingURL=mermaidFileManager.js.map