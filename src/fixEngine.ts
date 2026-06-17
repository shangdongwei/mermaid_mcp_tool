import { FileManager } from './fileManager.js';
import { LLMClient } from './llmClient.js';
import { validateMermaidCode } from './mermaidValidator.js';
import { logger } from './logger.js';
import { FixRequest, FixResponse, LLMConfig } from './types.js';

const DEFAULT_MAX_ATTEMPTS = 10;

export class FixEngine {
  private static instance: FixEngine;
  private fileManager: FileManager;
  private llmClient: LLMClient;

  private constructor() {
    this.fileManager = FileManager.getInstance();
    this.llmClient = LLMClient.getInstance();
  }

  public static getInstance(): FixEngine {
    if (!FixEngine.instance) {
      FixEngine.instance = new FixEngine();
    }
    return FixEngine.instance;
  }

  public async fixMermaidCode(request: FixRequest): Promise<FixResponse> {
    const startTime = Date.now();
    const { code, maxAttempts = DEFAULT_MAX_ATTEMPTS, llmProvider, llmModel } = request;

    if (llmProvider || llmModel) {
      this.llmClient.updateConfig({
        provider: llmProvider,
        model: llmModel
      });
    }

    const { requestId } = await this.fileManager.createFiles(code);
    logger.info('fix', 'Starting fix process', { requestId });

    let currentCode = code;
    let attempts = 0;

    try {
      while (attempts < maxAttempts) {
        attempts++;
        logger.info('fix', `Validation attempt ${attempts}`, { requestId, attempt: attempts });

        const validation = await validateMermaidCode(currentCode, requestId);

        if (validation.valid) {
          const duration = Date.now() - startTime;
          logger.info('fix', 'Fix process completed successfully', {
            requestId,
            attempts,
            duration,
            diagramType: validation.diagramType
          });

          return {
            success: true,
            requestId,
            originalCode: code,
            finalCode: currentCode,
            attempts,
            duration
          };
        }

        logger.warn('fix', `Validation failed, attempting fix ${attempts}`, {
          requestId,
          attempt: attempts,
          errorCount: validation.errors.length
        });

        currentCode = await this.llmClient.fixMermaidCode(
          currentCode,
          validation.errors,
          requestId
        );

        await this.fileManager.updateWorkingFile(requestId, currentCode);
      }

      const duration = Date.now() - startTime;
      logger.error('fix', 'Max attempts reached', { requestId, attempts, duration });

      return {
        success: false,
        requestId,
        originalCode: code,
        attempts,
        duration,
        errors: ['Maximum number of attempts reached']
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('fix', 'Fix process failed', { requestId, error, duration });

      return {
        success: false,
        requestId,
        originalCode: code,
        attempts,
        duration,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  public async cleanup(requestId: string): Promise<void> {
    await this.fileManager.deleteFiles(requestId);
    logger.info('fix', 'Cleaned up files', { requestId });
  }
}
