import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FixEngine } from './fixEngine.js';
import { logger } from './logger.js';
import { FixRequest } from './types.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const fixEngine = FixEngine.getInstance();

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now()
  });
});

app.post('/api/v1/fix', async (req, res) => {
  try {
    const { code, maxAttempts, llmProvider, llmModel } = req.body as FixRequest;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required'
      });
    }

    logger.info('api', 'Received fix request', {
      codeLength: code.length,
      maxAttempts
    });

    const result = await fixEngine.fixMermaidCode({
      code,
      maxAttempts,
      llmProvider,
      llmModel
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('api', 'Error handling fix request', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

app.post('/api/v1/validate', async (req, res) => {
  try {
    const { code } = req.body as { code?: string };

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required'
      });
    }

    const { validateMermaidCode } = await import('./mermaidValidator.js');
    const validation = await validateMermaidCode(code);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    logger.error('api', 'Error handling validation request', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

app.get('/api/v1/logs/:requestId?', (req, res) => {
  try {
    const params = req.params as { requestId?: string };
    const requestId = params.requestId;
    const logs = logger.getLogs(requestId);
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    logger.error('api', 'Error fetching logs', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

app.delete('/api/v1/cleanup/:requestId', async (req, res) => {
  try {
    const params = req.params as { requestId: string };
    const requestId = params.requestId;
    await fixEngine.cleanup(requestId);
    res.json({
      success: true,
      message: 'Cleanup completed'
    });
  } catch (error) {
    logger.error('api', 'Error during cleanup', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

app.listen(PORT, () => {
  logger.info('api', `Server is running on port ${PORT}`);
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);
  console.log(`API endpoints:`);
  console.log(`  POST /api/v1/fix - Fix Mermaid code`);
  console.log(`  POST /api/v1/validate - Validate Mermaid code`);
  console.log(`  GET /api/v1/logs - Get logs`);
  console.log(`  DELETE /api/v1/cleanup/:requestId - Cleanup files`);
});
