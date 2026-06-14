import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.resolve(__dirname, "../.mermaid_logs");

export interface FixSessionLog {
  requestId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  totalAttempts: number;
  success: boolean;
  errorTypes: string[];
  diagramType?: string;
  history: FixAttemptLog[];
}

export interface FixAttemptLog {
  attemptNumber: number;
  timestamp: number;
  errors: string[];
  fixedLineNumbers: number[];
}

export class MermaidLogger {
  private static instance: MermaidLogger;
  private sessions: Map<string, FixSessionLog> = new Map();

  private constructor() {
    this.initLogDir();
  }

  public static getInstance(): MermaidLogger {
    if (!MermaidLogger.instance) {
      MermaidLogger.instance = new MermaidLogger();
    }
    return MermaidLogger.instance;
  }

  private async initLogDir(): Promise<void> {
    try {
      await fs.mkdir(LOG_DIR, { recursive: true });
    } catch (err) {
      console.error("Failed to create log directory:", err);
    }
  }

  private getLogPath(requestId: string): string {
    return path.join(LOG_DIR, `${requestId}.log.json`);
  }

  public startSession(requestId: string): void {
    const session: FixSessionLog = {
      requestId,
      startTime: Date.now(),
      totalAttempts: 0,
      success: false,
      errorTypes: [],
      history: [],
    };
    this.sessions.set(requestId, session);
  }

  public logAttempt(
    requestId: string,
    attemptNumber: number,
    errors: string[],
    fixedLineNumbers: number[]
  ): void {
    const session = this.sessions.get(requestId);
    if (!session) return;

    session.totalAttempts = attemptNumber;
    session.history.push({
      attemptNumber,
      timestamp: Date.now(),
      errors,
      fixedLineNumbers,
    });

    for (const error of errors) {
      if (!session.errorTypes.includes(error)) {
        session.errorTypes.push(error);
      }
    }
  }

  public endSession(
    requestId: string,
    success: boolean,
    diagramType?: string
  ): void {
    const session = this.sessions.get(requestId);
    if (!session) return;

    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    session.success = success;
    session.diagramType = diagramType;

    this.saveSessionLog(session);
    this.sessions.delete(requestId);
  }

  private async saveSessionLog(session: FixSessionLog): Promise<void> {
    try {
      const logPath = this.getLogPath(session.requestId);
      await fs.writeFile(logPath, JSON.stringify(session, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save session log:", err);
    }
  }

  public async getSessionLog(requestId: string): Promise<FixSessionLog | null> {
    try {
      const logPath = this.getLogPath(requestId);
      const content = await fs.readFile(logPath, "utf-8");
      return JSON.parse(content);
    } catch (err) {
      const session = this.sessions.get(requestId);
      return session || null;
    }
  }

  public async getStatistics(): Promise<{
    totalSessions: number;
    successRate: number;
    averageDuration: number;
    averageAttempts: number;
    commonErrorTypes: Map<string, number>;
  }> {
    const stats = {
      totalSessions: 0,
      successRate: 0,
      averageDuration: 0,
      averageAttempts: 0,
      commonErrorTypes: new Map<string, number>(),
    };

    try {
      const files = await fs.readdir(LOG_DIR);
      const logFiles = files.filter((f) => f.endsWith(".log.json"));

      stats.totalSessions = logFiles.length;
      let totalDuration = 0;
      let totalAttempts = 0;
      let successCount = 0;

      for (const file of logFiles) {
        const content = await fs.readFile(path.join(LOG_DIR, file), "utf-8");
        const session: FixSessionLog = JSON.parse(content);

        if (session.success) successCount++;
        if (session.duration) totalDuration += session.duration;
        totalAttempts += session.totalAttempts;

        for (const errorType of session.errorTypes) {
          const count = stats.commonErrorTypes.get(errorType) || 0;
          stats.commonErrorTypes.set(errorType, count + 1);
        }
      }

      if (stats.totalSessions > 0) {
        stats.successRate = successCount / stats.totalSessions;
        stats.averageDuration = totalDuration / stats.totalSessions;
        stats.averageAttempts = totalAttempts / stats.totalSessions;
      }
    } catch (err) {
      console.error("Failed to generate statistics:", err);
    }

    return stats;
  }
}
