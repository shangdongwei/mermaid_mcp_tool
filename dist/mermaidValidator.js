/**
 * mermaidValidator.ts
 *
 * 核心目标：使用与前端完全一致的 "mermaid" npm 包版本（11.12.1）及其
 * mermaid.parse() API 对传入的 Mermaid 代码做语法校验，
 * 保证 backend 这里的校验结果与 front 在浏览器渲染时的校验结果一致。
 *
 * 由于 mermaid 内部依赖浏览器环境（document/window/SVG 相关 API），
 * 在 Node.js 中通过 jsdom 构造一个最小化的浏览器环境后再加载 mermaid。
 */
import { JSDOM } from "jsdom";
let mermaidModulePromise = null;
/**
 * 初始化（仅一次）jsdom 全局环境 + mermaid 实例。
 * 使用懒加载 + 缓存，避免每次调用都重复构造 DOM 环境。
 */
function getMermaid() {
    if (mermaidModulePromise) {
        return mermaidModulePromise;
    }
    mermaidModulePromise = (async () => {
        // 1. 构造一个最小化浏览器环境
        const dom = new JSDOM("<!DOCTYPE html><html><body><div id='mermaid-container'></div></body></html>", {
            pretendToBeVisual: true,
            url: "http://localhost/",
        });
        const { window } = dom;
        // 将 jsdom 的 window/document 等挂到 Node 全局对象上，
        // 使 mermaid 内部对 `document`、`window` 等的直接引用可以工作。
        const globalAny = globalThis;
        globalAny.window = window;
        globalAny.document = window.document;
        globalAny.navigator = window.navigator;
        globalAny.HTMLElement = window.HTMLElement;
        globalAny.SVGElement = window.SVGElement;
        globalAny.Element = window.Element;
        globalAny.Node = window.Node;
        globalAny.getComputedStyle = window.getComputedStyle.bind(window);
        // mermaid 在部分 diagram（如 d3 相关）中可能访问 window.matchMedia，
        // jsdom 默认未实现，这里补一个空实现以避免抛异常。
        if (!window.matchMedia) {
            window.matchMedia = (query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => { },
                removeListener: () => { },
                addEventListener: () => { },
                removeEventListener: () => { },
                dispatchEvent: () => false,
            });
            globalAny.matchMedia = window.matchMedia;
        }
        // 2. 动态加载 mermaid（必须在上面的全局变量设置之后再 import，
        //    否则 mermaid 模块加载期间的顶层代码可能拿不到 document/window）
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        // 3. 初始化。startOnLoad: false 避免它尝试自动扫描 DOM 渲染。
        mermaid.initialize({
            startOnLoad: false,
            // securityLevel 不影响语法解析结果，保持默认/宽松即可
            securityLevel: "loose",
        });
        return mermaid;
    })();
    return mermaidModulePromise;
}
/**
 * 校验 mermaid 代码语法是否正确。
 *
 * 行为与前端在浏览器中调用
 *   await mermaid.parse(code)
 * 完全一致：
 * - 语法正确 -> resolve，返回解析出的图表元信息（diagramType 等）
 * - 语法错误 -> mermaid.parse 会 throw 一个错误对象，
 *   这里捕获并转换为结构化结果返回。
 */
export async function validateMermaidSyntax(code) {
    if (!code || !code.trim()) {
        return {
            valid: false,
            error: {
                message: "Mermaid code is empty.",
            },
        };
    }
    const mermaid = await getMermaid();
    try {
        // suppressErrors: false（默认）-> 语法错误时会 throw，
        // 这与前端默认调用方式一致。
        const result = await mermaid.parse(code, { suppressErrors: false });
        // result 形如：{ diagramType: string, config?: ... }
        return {
            valid: true,
            diagramType: typeof result === "object" && result && "diagramType" in result
                ? String(result.diagramType ?? "")
                : undefined,
        };
    }
    catch (err) {
        return {
            valid: false,
            error: normalizeMermaidError(err, code),
        };
    }
}
function extractLineNumbersFromError(err, code) {
    const errors = [];
    const lines = code.split("\n");
    if (err instanceof Error) {
        const anyErr = err;
        if (anyErr.hash?.loc?.first_line) {
            errors.push({
                lineNumber: anyErr.hash.loc.first_line,
                column: anyErr.hash.loc.first_column,
                message: anyErr.message,
                errorType: "syntax",
            });
        }
        const lineMatch = anyErr.message.match(/line\s+(\d+)/i);
        if (lineMatch && !errors.find((e) => e.lineNumber === parseInt(lineMatch[1]))) {
            errors.push({
                lineNumber: parseInt(lineMatch[1]),
                message: anyErr.message,
                errorType: "syntax",
            });
        }
        if (errors.length === 0) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line &&
                    !line.startsWith("%%") &&
                    (line.includes("->>") || line.includes("-->>") || line.includes("->") || line.includes("--"))) {
                    if (line.includes("undefined") || line.includes("null")) {
                        errors.push({
                            lineNumber: i + 1,
                            message: "Possible invalid syntax detected",
                            errorType: "heuristic",
                        });
                    }
                }
            }
        }
    }
    if (errors.length === 0) {
        errors.push({
            lineNumber: 1,
            message: err instanceof Error ? err.message : String(err),
            errorType: "general",
        });
    }
    return errors;
}
/**
 * 将 mermaid.parse 抛出的各种形态错误统一格式化，
 * 尽量保留对 LLM 修正有用的信息（出错行号、token、原始文本）。
 */
function normalizeMermaidError(err, code) {
    if (err instanceof Error) {
        const anyErr = err;
        const detailedErrors = extractLineNumbersFromError(err, code);
        return {
            message: anyErr.message,
            hash: anyErr.hash,
            str: anyErr.str ?? anyErr.message,
            detailedErrors,
        };
    }
    if (typeof err === "object" && err !== null) {
        const anyErr = err;
        const detailedErrors = extractLineNumbersFromError(err, code);
        return {
            message: typeof anyErr.message === "string"
                ? anyErr.message
                : JSON.stringify(err),
            hash: anyErr.hash,
            str: typeof anyErr.str === "string" ? anyErr.str : undefined,
            detailedErrors,
        };
    }
    const detailedErrors = extractLineNumbersFromError(err, code);
    return {
        message: String(err),
        detailedErrors
    };
}
//# sourceMappingURL=mermaidValidator.js.map