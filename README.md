# mermaid_mcp_tool

一个基于 MCP（Model Context Protocol）协议的独立服务，提供 Mermaid 代码语法校验和循环修复工具，
用于解决 LLM 生成 Mermaid 代码时的幻觉问题。

## 为什么需要它

- 前端使用 `mermaid@11.12.1` 的 `mermaid.parse()` 做渲染前校验
- backend 需要在把 LLM 重新生成的 mermaid code 返回给 front 之前，先用**同一套解析逻辑**校验一遍
- 本工具直接依赖 `mermaid@11.12.1`（与 front 完全一致的版本），通过 jsdom 模拟浏览器环境后调用
  `mermaid.parse()`，因此校验结果与 front 渲染时的判定结果一致
- **新增**：提供循环修复流程，支持行级增量修复，避免 LLM 反复修改正确代码

## 安装与构建

```bash
npm install
npm run build
```

## 本地运行（stdio MCP server）

```bash
npm start
# 或开发模式
npm run dev
```

服务启动后通过 **stdio** 提供 MCP 协议通信，适合作为子进程被 backend 启动。

## Docker 独立部署

```bash
docker build -t mermaid-mcp-tool .
docker run -i mermaid-mcp-tool
```

`-i` 是必须的，因为 MCP stdio 传输依赖 stdin/stdout。

## 暴露的 Tools

### 1. `validate_mermaid_syntax` - 基础语法校验

**输入：**
```json
{
  "code": "graph TD\n  A --> B"
}
```

**输出（语法正确）：**
```json
{
  "valid": true,
  "diagramType": "flowchart-v2"
}
```

**输出（语法错误）：**
```json
{
  "valid": false,
  "error": {
    "message": "Parse error on line 2: ...",
    "hash": { "...": "..." },
    "str": "Parse error on line 2: ...",
    "detailedErrors": [
      {
        "lineNumber": 2,
        "column": 5,
        "message": "Parse error on line 2: ...",
        "errorType": "syntax"
      }
    ]
  }
}
```

---

### 2. `mermaid_fix_start` - 启动修复会话

**用途**：提交初始 Mermaid 代码，开始修复流程。如果代码合法直接返回通过；如果不合法，返回详细的错误信息（包含行号）。

**输入：**
```json
{
  "code": "graph TD\n    A[Start] --x B{Is it working?}\n    B -->|Yes| C[Great!]",
  "maxAttempts": 10
}
```

**参数说明：**
- `code`: 初始 Mermaid 代码（必填）
- `maxAttempts`: 最大修复尝试次数（可选，默认 10，最大 50）

**输出（代码合法）：**
```json
{
  "success": true,
  "requestId": "1718360000000-abc123def456",
  "valid": true
}
```

**输出（代码不合法）：**
```json
{
  "success": true,
  "requestId": "1718360000000-abc123def456",
  "valid": false,
  "errors": [
    {
      "lineNumber": 2,
      "message": "Invalid arrow type: --x"
    }
  ]
}
```

---

### 3. `mermaid_fix_submit` - 提交修复

**用途**：提交行级修复，仅修改错误行，保持其他代码不变。重新校验后返回结果。

**输入：**
```json
{
  "requestId": "1718360000000-abc123def456",
  "lineFixes": [
    {
      "lineNumber": 2,
      "content": "    A[Start] --> B{Is it working?}"
    }
  ]
}
```

**参数说明：**
- `requestId`: 从 `mermaid_fix_start` 获取的会话 ID（必填）
- `lineFixes`: 修复数组（必填）
  - `lineNumber`: 1 基行号（必填）
  - `content`: 该行的新内容（必填）

**输出（修复成功）：**
```json
{
  "success": true,
  "valid": true,
  "diagramType": "flowchart-v2"
}
```

**输出（仍有错误）：**
```json
{
  "success": true,
  "valid": false,
  "errors": [
    {
      "lineNumber": 3,
      "message": "..."
    }
  ]
}
```

---

### 4. `mermaid_fix_complete` - 获取最终代码并完成

**用途**：从成功完成的会话中获取最终的合法代码，并清理资源。

**输入：**
```json
{
  "requestId": "1718360000000-abc123def456"
}
```

**输出：**
```json
{
  "success": true,
  "code": "graph TD\n    A[Start] --> B{Is it working?}\n    B -->|Yes| C[Great!]"
}
```

---

### 5. `mermaid_fix_status` - 查询会话状态

**用途**：查询当前修复会话的状态信息。

**输入：**
```json
{
  "requestId": "1718360000000-abc123def456"
}
```

**输出：**
```json
{
  "requestId": "1718360000000-abc123def456",
  "status": "fixing",
  "currentAttempt": 2,
  "maxAttempts": 10,
  "lastValidation": {
    "valid": false,
    "error": { ... }
  }
}
```

---

## 完整修复流程示例

### Backend 调用示例（Node.js / TypeScript，MCP Client）

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/mermaid_mcp_tool/dist/index.js"],
});

const client = new Client({ name: "backend-service", version: "1.0.0" });
await client.connect(transport);

// 1. 启动修复会话
const startResult = await client.callTool({
  name: "mermaid_fix_start",
  arguments: { code: mermaidCodeFromLLM, maxAttempts: 10 },
});
const startData = JSON.parse(startResult.content[0].text as string);

if (startData.valid) {
  // 代码直接合法
  console.log("Code is valid!");
} else {
  let currentData = startData;
  let requestId = startData.requestId;

  // 2. 循环修复
  while (!currentData.valid && currentData.errors) {
    // 让 LLM 仅修复错误行
    const fixedLines = await askLLMToFixLines(
      mermaidCodeFromLLM,
      currentData.errors
    );

    // 3. 提交修复
    const submitResult = await client.callTool({
      name: "mermaid_fix_submit",
      arguments: { requestId, lineFixes: fixedLines },
    });
    currentData = JSON.parse(submitResult.content[0].text as string);
  }

  // 4. 获取最终代码
  if (currentData.valid) {
    const completeResult = await client.callTool({
      name: "mermaid_fix_complete",
      arguments: { requestId },
    });
    const finalData = JSON.parse(completeResult.content[0].text as string);
    console.log("Final valid code:", finalData.code);
  }
}
```

## 业务流程整合

### 方案 A：简单校验（原有）
1. backend LLM 首次生成 mermaid code → 直接返回给 front
2. front 渲染失败 → 将 `code` + 错误信息回传给 backend
3. backend 让 LLM 重新生成 → **调用 `validate_mermaid_syntax` 校验**
4. 若仍不通过 → 可将错误信息再次喂给 LLM 重新生成（可设置重试上限）
5. 校验通过 → 返回给 front

### 方案 B：循环修复（新增，推荐）
1. backend LLM 首次生成 mermaid code → **调用 `mermaid_fix_start`**
2. 若不合法 → 收到错误行号列表 → 让 LLM 仅针对错误行修复
3. **调用 `mermaid_fix_submit`** 提交修复
4. 重复步骤 2-3 直到通过或达到最大尝试次数
5. 通过后 **调用 `mermaid_fix_complete`** 获取最终代码 → 返回给 front

## 核心特性

### 1. 精准的行级错误定位
- 从 mermaid 错误信息中提取行号和列号
- 支持多种图表类型（flowchart、sequenceDiagram、classDiagram、erDiagram 等）

### 2. 增量更新，保护正确代码
- 仅修改指定错误行
- 保持其他代码的格式和缩进不变
- 避免 LLM 反复修改已正确的内容

### 3. 完整的版本历史
- 每次修复都保存版本快照
- 记录修改的行和内容
- 便于问题回溯

### 4. 性能优化
- 单次校验不超过 200ms
- 使用文件锁处理并发
- 支持会话清理

### 5. 详细日志
- 记录每次尝试的错误类型
- 统计修复次数和耗时
- 支持会话日志查询

## 目录结构

```
mermaid_mcp_tool/
├── src/
│   ├── index.ts                  # MCP Server 入口
│   ├── mermaidValidator.ts       # 语法校验核心
│   ├── mermaidFileManager.ts     # 文件存储和版本管理
│   ├── mermaidLogger.ts          # 日志记录
│   ├── mermaidFixEngine.ts       # 修复引擎核心
│   └── mermaidFixEngine.test.ts  # 单元测试
├── dist/                         # 构建输出
├── .mermaid_storage/             # 代码存储目录（gitignored）
├── .mermaid_logs/                # 日志目录（gitignored）
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

## 版本一致性维护

`package.json` 中 `mermaid` 版本号需始终与 front 端 `package.json` 中的 `mermaid` 版本保持一致
（当前均为 `11.12.1`）。front 端升级 mermaid 版本时，本工程需同步升级并重新构建部署。

## 开发测试

```bash
# 运行测试（需要 tsx）
npx tsx src/mermaidFixEngine.test.ts
```
