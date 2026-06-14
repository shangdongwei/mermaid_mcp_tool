import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.resolve(__dirname, "../.mermaid_logs");
export class MermaidLogger {
    static instance;
    sessions = new Map();
    constructor() {
        this.initLogDir();
    }
    static getInstance() {
        if (!MermaidLogger.instance) {
            MermaidLogger.instance = new MermaidLogger();
        }
        return MermaidLogger.instance;
    }
    async initLogDir() {
        try {
            await fs.mkdir(LOG_DIR, { recursive: true });
        }
        catch (err) {
            console.error("Failed to create log directory:", err);
        }
    }
    getLogPath(requestId) {
        return path.join(LOG_DIR, `${requestId}.log.json`);
    }
    startSession(requestId) {
        const session = {
            requestId,
            startTime: Date.now(),
            totalAttempts: 0,
            success: false,
            errorTypes: [],
            history: [],
        };
        this.sessions.set(requestId, session);
    }
    logAttempt(requestId, attemptNumber, errors, fixedLineNumbers) {
        const session = this.sessions.get(requestId);
        if (!session)
            return;
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
    endSession(requestId, success, diagramType) {
        const session = this.sessions.get(requestId);
        if (!session)
            return;
        session.endTime = Date.now();
        session.duration = session.endTime - session.startTime;
        session.success = success;
        session.diagramType = diagramType;
        this.saveSessionLog(session);
        this.sessions.delete(requestId);
    }
    async saveSessionLog(session) {
        try {
            const logPath = this.getLogPath(session.requestId);
            await fs.writeFile(logPath, JSON.stringify(session, null, 2), "utf-8");
        }
        catch (err) {
            console.error("Failed to save session log:", err);
        }
    }
    async getSessionLog(requestId) {
        try {
            const logPath = this.getLogPath(requestId);
            const content = await fs.readFile(logPath, "utf-8");
            return JSON.parse(content);
        }
        catch (err) {
            const session = this.sessions.get(requestId);
            return session || null;
        }
    }
    async getStatistics() {
        const stats = {
            totalSessions: 0,
            successRate: 0,
            averageDuration: 0,
            averageAttempts: 0,
            commonErrorTypes: new Map(),
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
                const session = JSON.parse(content);
                if (session.success)
                    successCount++;
                if (session.duration)
                    totalDuration += session.duration;
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
        }
        catch (err) {
            console.error("Failed to generate statistics:", err);
        }
        return stats;
    }
}
//# sourceMappingURL=mermaidLogger.js.map