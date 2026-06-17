export interface FixRequest {
  code: string;
  maxAttempts?: number;
  llmProvider?: string;
  llmModel?: string;
}

export interface FixResponse {
  success: boolean;
  requestId: string;
  originalCode: string;
  finalCode?: string;
  attempts: number;
  errors?: string[];
  duration?: number;
}

export interface FileEntry {
  requestId: string;
  path: string;
  type: 'original' | 'working';
  createdAt: number;
}

export interface ValidationError {
  lineNumber: number;
  column?: number;
  message: string;
  errorType: string;
  lineContent?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagramType?: string;
  errors: ValidationError[];
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'file' | 'validation' | 'llm' | 'fix' | 'api' | 'test';
  requestId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}
