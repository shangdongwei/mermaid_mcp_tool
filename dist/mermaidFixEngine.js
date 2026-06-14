import { MermaidFileManager, generateRequestId, } from "./mermaidFileManager.js";
import { validateMermaidSyntax, } from "./mermaidValidator.js";
import { MermaidLogger } from "./mermaidLogger.js";
export class MermaidFixEngine {
    static instance;
    fileManager;
    logger;
    sessions = new Map();
    constructor() {
        this.fileManager = MermaidFileManager.getInstance();
        this.logger = MermaidLogger.getInstance();
    }
    static getInstance() {
        if (!MermaidFixEngine.instance) {
            MermaidFixEngine.instance = new MermaidFixEngine();
        }
        return MermaidFixEngine.instance;
    }
    async submitInitialCode(code, maxAttempts = 10) {
        const startTime = Date.now();
        const requestId = generateRequestId();
        try {
            await this.fileManager.createFile(requestId, code);
            this.logger.startSession(requestId);
            const validation = await this.validateWithTimeout(code);
            if (validation.valid) {
                this.logger.endSession(requestId, true, validation.diagramType);
                this.sessions.set(requestId, {
                    requestId,
                    status: "completed",
                    currentAttempt: 1,
                    maxAttempts,
                    lastValidation: validation,
                });
                return {
                    success: true,
                    requestId,
                    valid: true,
                };
            }
            const errors = this.formatErrors(validation);
            this.logger.logAttempt(requestId, 1, errors.map((e) => e.message), errors.map((e) => e.lineNumber));
            this.sessions.set(requestId, {
                requestId,
                status: "fixing",
                currentAttempt: 1,
                maxAttempts,
                lastValidation: validation,
            });
            return {
                success: true,
                requestId,
                valid: false,
                errors,
            };
        }
        catch (err) {
            this.logger.endSession(requestId, false);
            return {
                success: false,
                requestId,
                valid: false,
                errors: [
                    {
                        lineNumber: 1,
                        message: err instanceof Error ? err.message : "Unknown error occurred",
                    },
                ],
            };
        }
    }
    async submitFixes(requestId, lineFixes) {
        const session = this.sessions.get(requestId);
        if (!session) {
            return {
                success: false,
                valid: false,
                errors: [
                    {
                        lineNumber: 1,
                        message: `Session not found for requestId: ${requestId}`,
                    },
                ],
            };
        }
        if (session.currentAttempt >= session.maxAttempts) {
            this.logger.endSession(requestId, false);
            session.status = "failed";
            return {
                success: false,
                valid: false,
                errors: [
                    {
                        lineNumber: 1,
                        message: `Maximum attempts (${session.maxAttempts}) reached`,
                    },
                ],
            };
        }
        try {
            const currentCode = await this.fileManager.getFile(requestId);
            if (!currentCode) {
                return {
                    success: false,
                    valid: false,
                    errors: [
                        { lineNumber: 1, message: "Code file not found" },
                    ],
                };
            }
            const lineChanges = lineFixes.map((fix) => {
                const lines = currentCode.split("\n");
                const oldContent = lines[fix.lineNumber - 1] || "";
                return {
                    lineNumber: fix.lineNumber,
                    oldContent,
                    newContent: fix.content,
                };
            });
            const metadata = await this.fileManager.updateFile(requestId, lineChanges);
            const validation = await this.validateWithTimeout(metadata.currentCode);
            session.currentAttempt++;
            session.lastValidation = validation;
            if (validation.valid) {
                this.logger.endSession(requestId, true, validation.diagramType);
                session.status = "completed";
                return {
                    success: true,
                    valid: true,
                    diagramType: validation.diagramType,
                };
            }
            const errors = this.formatErrors(validation);
            this.logger.logAttempt(requestId, session.currentAttempt, errors.map((e) => e.message), lineFixes.map((f) => f.lineNumber));
            return {
                success: true,
                valid: false,
                errors,
            };
        }
        catch (err) {
            return {
                success: false,
                valid: false,
                errors: [
                    {
                        lineNumber: 1,
                        message: err instanceof Error ? err.message : "Unknown error occurred",
                    },
                ],
            };
        }
    }
    async getFinalCode(requestId) {
        const session = this.sessions.get(requestId);
        if (!session || session.status !== "completed") {
            return null;
        }
        return this.fileManager.getFile(requestId);
    }
    async getSession(requestId) {
        return this.sessions.get(requestId) || null;
    }
    async cleanupSession(requestId) {
        this.sessions.delete(requestId);
        await this.fileManager.deleteFile(requestId);
    }
    async validateWithTimeout(code, timeoutMs = 200) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const result = await validateMermaidSyntax(code);
            clearTimeout(timeoutId);
            return result;
        }
        catch (err) {
            clearTimeout(timeoutId);
            return {
                valid: false,
                error: {
                    message: err instanceof Error
                        ? err.message
                        : "Validation timeout or error",
                },
            };
        }
    }
    formatErrors(validation) {
        if (!validation.error?.detailedErrors) {
            return [
                {
                    lineNumber: 1,
                    message: validation.error?.message || "Unknown error",
                },
            ];
        }
        return validation.error.detailedErrors.map((e) => ({
            lineNumber: e.lineNumber,
            message: e.message,
        }));
    }
}
//# sourceMappingURL=mermaidFixEngine.js.map