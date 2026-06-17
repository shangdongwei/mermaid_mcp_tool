import { JSDOM } from 'jsdom';
import { logger } from './logger.js';
let mermaidModulePromise = null;
async function getMermaid() {
    if (mermaidModulePromise) {
        return mermaidModulePromise;
    }
    mermaidModulePromise = (async () => {
        const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mermaid-container"></div></body></html>', {
            pretendToBeVisual: true,
            url: 'http://localhost/'
        });
        const { window } = dom;
        const globalAny = globalThis;
        // Use Object.defineProperty to avoid getter/setter issues
        const globalProps = {
            window: { value: window, configurable: true },
            document: { value: window.document, configurable: true },
            navigator: { value: window.navigator, configurable: true },
            HTMLElement: { value: window.HTMLElement, configurable: true },
            SVGElement: { value: window.SVGElement, configurable: true },
            Element: { value: window.Element, configurable: true },
            Node: { value: window.Node, configurable: true },
            getComputedStyle: { value: window.getComputedStyle.bind(window), configurable: true }
        };
        for (const [key, descriptor] of Object.entries(globalProps)) {
            try {
                Object.defineProperty(globalAny, key, descriptor);
            }
            catch {
                // Fallback if property is read-only
                try {
                    globalAny[key] = descriptor.value;
                }
                catch {
                    // Ignore errors for optional properties
                }
            }
        }
        if (!window.matchMedia) {
            window.matchMedia = (query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => { },
                removeListener: () => { },
                addEventListener: () => { },
                removeEventListener: () => { },
                dispatchEvent: () => false
            });
            globalAny.matchMedia = window.matchMedia;
        }
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose'
        });
        return mermaid;
    })();
    return mermaidModulePromise;
}
function extractLineNumbersFromError(error, code) {
    const errors = [];
    const lines = code.split('\n');
    if (error instanceof Error) {
        const anyErr = error;
        if (anyErr.hash?.loc?.first_line) {
            const lineNum = anyErr.hash.loc.first_line;
            errors.push({
                lineNumber: lineNum,
                column: anyErr.hash.loc.first_column,
                message: anyErr.message,
                errorType: 'syntax',
                lineContent: lines[lineNum - 1]
            });
        }
        const lineMatch = anyErr.message.match(/line\s+(\d+)/i);
        if (lineMatch) {
            const lineNum = parseInt(lineMatch[1]);
            if (!errors.find(e => e.lineNumber === lineNum)) {
                errors.push({
                    lineNumber: lineNum,
                    message: anyErr.message,
                    errorType: 'syntax',
                    lineContent: lines[lineNum - 1]
                });
            }
        }
        if (errors.length === 0) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line &&
                    !line.startsWith('%%') &&
                    (line.includes('->') || line.includes('--'))) {
                    if (line.includes('undefined') || line.includes('null')) {
                        errors.push({
                            lineNumber: i + 1,
                            message: 'Possible invalid syntax detected',
                            errorType: 'heuristic',
                            lineContent: lines[i]
                        });
                    }
                }
            }
        }
    }
    if (errors.length === 0) {
        errors.push({
            lineNumber: 1,
            message: error instanceof Error ? error.message : String(error),
            errorType: 'general',
            lineContent: lines[0]
        });
    }
    return errors;
}
export async function validateMermaidCode(code, requestId) {
    const startTime = Date.now();
    if (!code || !code.trim()) {
        const result = {
            valid: false,
            errors: [{
                    lineNumber: 1,
                    message: 'Mermaid code is empty',
                    errorType: 'validation'
                }]
        };
        logger.warn('validation', 'Empty mermaid code', { requestId, duration: Date.now() - startTime });
        return result;
    }
    try {
        const mermaid = await getMermaid();
        const result = await mermaid.parse(code, { suppressErrors: false });
        const validationResult = {
            valid: true,
            diagramType: typeof result === 'object' && result && 'diagramType' in result
                ? String(result.diagramType ?? '')
                : undefined,
            errors: []
        };
        logger.info('validation', 'Mermaid code validation passed', {
            requestId,
            diagramType: validationResult.diagramType,
            duration: Date.now() - startTime
        });
        return validationResult;
    }
    catch (error) {
        const errors = extractLineNumbersFromError(error, code);
        const validationResult = {
            valid: false,
            errors
        };
        logger.warn('validation', 'Mermaid code validation failed', {
            requestId,
            errorCount: errors.length,
            duration: Date.now() - startTime
        });
        logger.debug('validation', 'Validation errors', { requestId, errors });
        return validationResult;
    }
}
//# sourceMappingURL=mermaidValidator.js.map