# mermaid_mcp_tool

一个用于自动修复 Mermaid 图表语法的 API 服务，使用 LLM 技术解决 LLM 生成 Mermaid 代码时的幻觉问题。

## ✨ 特性

- **双重文件备份**：自动创建原始只读备份和工作副本
- **智能语法校验**：使用与前端完全一致的 mermaid@11.12.1 版本
- **LLM 自动修复**：调用 LLM 进行智能修复
- **循环修复机制**：持续修复直到语法完全正确
- **超时重试机制**：LLM 调用失败时自动重试
- **完整日志记录**：记录所有操作步骤和错误信息
- **标准 REST API**：易于与任何后端系统集成

## 📦 技术栈

- **Express** - API 服务框架
- **pi-agent-core** - 核心 AI agent 框架
- **pi-ai** - 统一 LLM 调用接口
- **mermaid@11.12.1** - Mermaid 语法解析引擎
- **winston** - 日志记录
- **TypeScript** - 类型安全

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 API keys
```

### 3. 构建项目

```bash
npm run build
```

### 4. 启动服务

```bash
npm start
# 或开发模式
npm run dev
```

服务将在 `http://localhost:3000` 启动。

## 🔧 API 接口

### 健康检查

```http
GET /health
```

**响应：**
```json
{
  "status": "healthy",
  "timestamp": 1234567890
}
```

### 修复 Mermaid 代码

```http
POST /api/v1/fix
Content-Type: application/json

{
  "code": "graph TD\n    A[Start] --x B{Is it working?}",
  "maxAttempts": 10,
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini"
}
```

**参数说明：**
- `code` (必需): Mermaid 图表代码
- `maxAttempts` (可选): 最大修复尝试次数，默认 10
- `llmProvider` (可选): LLM 提供商 (openai)
- `llmModel` (可选): 模型名称

**成功响应 (200)：**
```json
{
  "success": true,
  "requestId": "1718360000000-abc123def456",
  "originalCode": "graph TD\n    A[Start] --x B{Is it working?}",
  "finalCode": "graph TD\n    A[Start] --> B{Is it working?}",
  "attempts": 1,
  "duration": 2500
}
```

**失败响应 (400)：**
```json
{
  "success": false,
  "requestId": "1718360000000-abc123def456",
  "originalCode": "...",
  "attempts": 10,
  "duration": 30000,
  "errors": ["Maximum number of attempts reached"]
}
```

### 验证 Mermaid 代码

```http
POST /api/v1/validate
Content-Type: application/json

{
  "code": "graph TD\n    A --> B"
}
```

**响应：**
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "diagramType": "flowchart-v2",
    "errors": []
  }
}
```

### 获取日志

```http
GET /api/v1/logs
GET /api/v1/logs/:requestId
```

**响应：**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": 1718360000000,
      "level": "info",
      "category": "file",
      "requestId": "1718360000000-abc123def456",
      "message": "Original file created"
    }
  ]
}
```

### 清理文件

```http
DELETE /api/v1/cleanup/:requestId
```

**响应：**
```json
{
  "success": true,
  "message": "Cleanup completed"
}
```

## 💡 使用示例

### cURL 示例

```bash
# 修复代码
curl -X POST http://localhost:3000/api/v1/fix \
  -H "Content-Type: application/json" \
  -d '{
    "code": "graph TD\n    A[Start] --x B{Is it working?}",
    "maxAttempts": 5
  }'

# 验证代码
curl -X POST http://localhost:3000/api/v1/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "graph TD\n    A --> B"}'
```

### JavaScript/TypeScript 示例

```javascript
const response = await fetch('http://localhost:3000/api/v1/fix', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: 'graph TD\n    A[Start] --x B{Is it working?}',
    maxAttempts: 5
  })
});

const result = await response.json();
if (result.success) {
  console.log('Fixed code:', result.finalCode);
}
```

## 🏗️ 架构概览

```
mermaid_mcp_tool/
├── src/                        # 源代码
│   ├── index.ts               # Express API 入口
│   ├── fixEngine.ts           # 核心修复流程引擎
│   ├── mermaidValidator.ts    # Mermaid 语法校验
│   ├── llmClient.ts           # LLM 客户端
│   ├── fileManager.ts         # 文件管理（双重备份）
│   ├── logger.ts              # 日志记录
│   ├── types.ts               # TypeScript 类型定义
│   └── test.ts                # 测试文件
├── dist/                       # 构建产物
├── .mermaid_storage/          # 存储目录 (gitignored)
├── .mermaid_logs/             # 日志目录 (gitignored)
├── tsconfig.json              # TypeScript 配置
└── package.json
```

## 🔄 修复流程

1. **接收请求** → API 接收 Mermaid 代码
2. **创建文件** → 创建原始只读备份和工作副本
3. **语法校验** → 使用 mermaid 解析器验证
4. **LLM 修复** → 如有错误，调用 LLM 修复（含重试机制）
5. **更新文件** → 仅更新工作副本
6. **循环校验** → 重复 3-5 直到通过校验
7. **返回结果** → 返回修复后的完整代码

## 📝 运行测试

```bash
npm test
```

## ⚙️ 配置

### 支持的 LLM 提供商

- **OpenAI** (默认)
  - `OPENAI_API_KEY` 环境变量

## 🐳 Docker 部署

```bash
docker build -t mermaid-mcp-tool .
docker run -p 3000:3000 -e OPENAI_API_KEY=your_key mermaid-mcp-tool
```

## 📄 License

MIT
