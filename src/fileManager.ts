import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { FileEntry } from './types.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.resolve(__dirname, '../.mermaid_storage');
const ORIGINAL_SUFFIX = '_original.md';
const WORKING_SUFFIX = '_working.md';

export class FileManager {
  private static instance: FileManager;

  private constructor() {
    this.initStorage();
  }

  public static getInstance(): FileManager {
    if (!FileManager.instance) {
      FileManager.instance = new FileManager();
    }
    return FileManager.instance;
  }

  private async initStorage(): Promise<void> {
    try {
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      logger.info('file', `Storage directory initialized: ${STORAGE_DIR}`);
    } catch (error) {
      logger.error('file', 'Failed to initialize storage directory', { error });
    }
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getOriginalPath(requestId: string): string {
    return path.join(STORAGE_DIR, `${requestId}${ORIGINAL_SUFFIX}`);
  }

  private getWorkingPath(requestId: string): string {
    return path.join(STORAGE_DIR, `${requestId}${WORKING_SUFFIX}`);
  }

  public async createFiles(code: string): Promise<{ requestId: string; originalPath: string; workingPath: string }> {
    const requestId = this.generateRequestId();
    const originalPath = this.getOriginalPath(requestId);
    const workingPath = this.getWorkingPath(requestId);

    try {
      await fs.writeFile(originalPath, code, 'utf-8');
      await fs.chmod(originalPath, 0o444);
      logger.info('file', `Original file created (read-only): ${originalPath}`, { requestId });

      await fs.writeFile(workingPath, code, 'utf-8');
      logger.info('file', `Working file created: ${workingPath}`, { requestId });

      return { requestId, originalPath, workingPath };
    } catch (error) {
      logger.error('file', 'Failed to create files', { requestId, error });
      throw error;
    }
  }

  public async readWorkingFile(requestId: string): Promise<string> {
    const workingPath = this.getWorkingPath(requestId);
    try {
      const content = await fs.readFile(workingPath, 'utf-8');
      logger.debug('file', `Read working file: ${workingPath}`, { requestId });
      return content;
    } catch (error) {
      logger.error('file', 'Failed to read working file', { requestId, error });
      throw error;
    }
  }

  public async readOriginalFile(requestId: string): Promise<string> {
    const originalPath = this.getOriginalPath(requestId);
    try {
      const content = await fs.readFile(originalPath, 'utf-8');
      logger.debug('file', `Read original file: ${originalPath}`, { requestId });
      return content;
    } catch (error) {
      logger.error('file', 'Failed to read original file', { requestId, error });
      throw error;
    }
  }

  public async updateWorkingFile(requestId: string, content: string): Promise<void> {
    const workingPath = this.getWorkingPath(requestId);
    try {
      await fs.writeFile(workingPath, content, 'utf-8');
      logger.info('file', `Working file updated: ${workingPath}`, { requestId });
    } catch (error) {
      logger.error('file', 'Failed to update working file', { requestId, error });
      throw error;
    }
  }

  public async getFiles(requestId: string): Promise<FileEntry[]> {
    const originalPath = this.getOriginalPath(requestId);
    const workingPath = this.getWorkingPath(requestId);

    const files: FileEntry[] = [];

    try {
      const originalStats = await fs.stat(originalPath);
      files.push({
        requestId,
        path: originalPath,
        type: 'original',
        createdAt: originalStats.birthtimeMs,
      });
    } catch {
      logger.warn('file', `Original file not found: ${originalPath}`, { requestId });
    }

    try {
      const workingStats = await fs.stat(workingPath);
      files.push({
        requestId,
        path: workingPath,
        type: 'working',
        createdAt: workingStats.birthtimeMs,
      });
    } catch {
      logger.warn('file', `Working file not found: ${workingPath}`, { requestId });
    }

    return files;
  }

  public async deleteFiles(requestId: string): Promise<void> {
    const originalPath = this.getOriginalPath(requestId);
    const workingPath = this.getWorkingPath(requestId);

    try {
      await fs.chmod(originalPath, 0o666).catch(() => {});
      await fs.unlink(originalPath).catch(() => {});
      await fs.unlink(workingPath).catch(() => {});
      logger.info('file', `Files deleted for request: ${requestId}`, { requestId });
    } catch (error) {
      logger.error('file', 'Failed to delete files', { requestId, error });
      throw error;
    }
  }
}
