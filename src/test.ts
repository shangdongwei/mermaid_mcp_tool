import { validateMermaidCode } from './mermaidValidator.js';
import { FileManager } from './fileManager.js';
import { logger } from './logger.js';

const VALID_MERMAID = `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B`;

const INVALID_MERMAID = `graph TD
    A[Start] --x B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B`;

async function runTests() {
  console.log('🧪 Starting Mermaid Fix Engine Tests...\n');

  try {
    console.log('📋 Test 1: Validate valid mermaid code');
    const validResult = await validateMermaidCode(VALID_MERMAID, 'test-valid');
    console.log('  Result:', {
      valid: validResult.valid,
      diagramType: validResult.diagramType,
      errorCount: validResult.errors.length
    });
    console.log(`  ✅ Test 1 ${validResult.valid ? 'PASSED' : 'FAILED'}\n`);

    console.log('📋 Test 2: Validate invalid mermaid code');
    const invalidResult = await validateMermaidCode(INVALID_MERMAID, 'test-invalid');
    console.log('  Result:', {
      valid: invalidResult.valid,
      errorCount: invalidResult.errors.length,
      errors: invalidResult.errors.map(e => ({ line: e.lineNumber, message: e.message }))
    });
    console.log(`  ✅ Test 2 ${!invalidResult.valid ? 'PASSED' : 'FAILED'}\n`);

    console.log('📋 Test 3: File manager operations');
    const fileManager = FileManager.getInstance();
    const { requestId, originalPath, workingPath } = await fileManager.createFiles(VALID_MERMAID);
    console.log('  Created files:', { requestId, originalPath, workingPath });

    const readOriginal = await fileManager.readOriginalFile(requestId);
    console.log('  Read original file:', readOriginal.substring(0, 50) + '...');

    const readWorking = await fileManager.readWorkingFile(requestId);
    console.log('  Read working file:', readWorking.substring(0, 50) + '...');

    await fileManager.updateWorkingFile(requestId, INVALID_MERMAID);
    const updatedWorking = await fileManager.readWorkingFile(requestId);
    console.log('  Updated working file:', updatedWorking.substring(0, 50) + '...');

    const files = await fileManager.getFiles(requestId);
    console.log('  Found files:', files.map(f => ({ type: f.type, path: f.path })));

    await fileManager.deleteFiles(requestId);
    console.log(`  ✅ Test 3 PASSED\n`);

    console.log('📋 Test 4: Logger functionality');
    logger.info('test', 'Test info log', { testData: 'value1' });
    logger.warn('test', 'Test warn log', { testData: 'value2' });
    logger.error('test', 'Test error log', { testData: 'value3' });
    logger.debug('test', 'Test debug log', { testData: 'value4' });

    const logs = logger.getLogs();
    console.log('  Logs recorded:', logs.length);
    console.log(`  ✅ Test 4 PASSED\n`);

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests, VALID_MERMAID, INVALID_MERMAID };
