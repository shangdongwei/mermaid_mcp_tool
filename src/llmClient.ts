import { LLMConfig, ValidationError } from './types.js';
import { logger } from './logger.js';

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  timeout: 60000,
  maxRetries: 3
};

export class LLMClient {
  private static instance: LLMClient;
  private config: LLMConfig;

  private constructor(config?: Partial<LLMConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info('llm', `LLM client initialized: ${this.config.provider}/${this.config.model}`);
  }

  public static getInstance(config?: Partial<LLMConfig>): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient(config);
    } else if (config) {
      LLMClient.instance.config = { ...LLMClient.instance.config, ...config };
    }
    return LLMClient.instance;
  }

  public async fixMermaidCode(
    code: string,
    errors: ValidationError[],
    requestId: string
  ): Promise<string> {
    const systemPrompt = `You are a Mermaid diagram syntax expert. Your task is to fix Mermaid code with syntax errors.

RULES:
1. ONLY fix the lines with errors mentioned in the error description
2. Do NOT change any other lines of code - preserve the original structure and formatting
3. Return ONLY the fixed complete Mermaid code without any explanation
4. Make sure the fixed code is syntactically correct

ERRORS TO FIX:
${errors.map(e => `- Line ${e.lineNumber}: ${e.message}`).join('\n')}

LINE CONTEXT:
${errors.map(e => `Line ${e.lineNumber}: ${e.lineContent || '(line not available)'}`).join('\n')}`;

    const userPrompt = `Please fix the following Mermaid code:\n\n\`\`\`mermaid\n${code}\n\`\`\``;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < (this.config.maxRetries || 3)) {
      attempt++;
      try {
        logger.info('llm', `Calling LLM to fix code (attempt ${attempt})`, { requestId, attempt });
        
        const result = await this.callLLM(systemPrompt, userPrompt);
        const fixedCode = this.extractMermaidCode(result);
        
        logger.info('llm', 'LLM successfully returned fixed code', { requestId, attempt });
        logger.debug('llm', 'LLM response', { requestId, response: result });
        
        return fixedCode;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('llm', `LLM call failed (attempt ${attempt})`, { requestId, attempt, error: lastError.message });
        
        if (attempt < (this.config.maxRetries || 3)) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    logger.error('llm', 'All LLM call attempts failed', { requestId, error: lastError?.message });
    throw lastError || new Error('Failed to call LLM after multiple attempts');
  }

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = this.config.apiKey || process.env[`${this.config.provider.toUpperCase()}_API_KEY`];
    
    if (!apiKey) {
      throw new Error(`No API key provided for ${this.config.provider}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 60000);

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      let url = '';
      let headers: Record<string, string> = {};

      if (this.config.provider === 'openai' || this.config.provider === 'openai-compat') {
        url = this.config.baseUrl || 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
      } else {
        throw new Error(`Unsupported provider: ${this.config.provider}`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.1
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.choices[0]?.message?.content || '';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractMermaidCode(text: string): string {
    const codeBlockMatch = text.match(/```(?:mermaid)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    
    const lines = text.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('Here') && !trimmed.startsWith('Sure') && !trimmed.startsWith('```');
    });
    
    return lines.join('\n').trim();
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
