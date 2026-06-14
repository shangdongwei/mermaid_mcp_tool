#!/usr/bin/env node
/**
 * index.ts
 *
 * mermaid_mcp_tool 的 MCP Server 入口。
 *
 * 暴露 tools：
 * 1. validate_mermaid_syntax - 基础语法校验
 * 2. mermaid_fix_start - 启动修复会话（初始提交）
 * 3. mermaid_fix_submit - 提交修复并继续校验
 * 4. mermaid_fix_complete - 获取最终代码并完成会话
 * 5. mermaid_fix_status - 查询会话状态
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { validateMermaidSyntax } from "./mermaidValidator.js";
import { MermaidFixEngine } from "./mermaidFixEngine.js";

const VALIDATE_TOOL_NAME = "validate_mermaid_syntax";
const FIX_START_TOOL_NAME = "mermaid_fix_start";
const FIX_SUBMIT_TOOL_NAME = "mermaid_fix_submit";
const FIX_COMPLETE_TOOL_NAME = "mermaid_fix_complete";
const FIX_STATUS_TOOL_NAME = "mermaid_fix_status";

const ValidateInputSchema = z.object({
  code: z
    .string()
    .min(1, "code must not be empty")
    .describe("The Mermaid diagram source code to validate."),
});

const FixStartInputSchema = z.object({
  code: z
    .string()
    .min(1, "code must not be empty")
    .describe("The initial Mermaid diagram source code."),
  maxAttempts: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum number of fix attempts allowed."),
});

const FixSubmitInputSchema = z.object({
  requestId: z
    .string()
    .min(1, "requestId must not be empty")
    .describe("The session requestId from mermaid_fix_start."),
  lineFixes: z
    .array(
      z.object({
        lineNumber: z.number().int().min(1),
        content: z.string(),
      })
    )
    .min(1, "At least one line fix is required")
    .describe("Array of line fixes to apply."),
});

const FixCompleteInputSchema = z.object({
  requestId: z
    .string()
    .min(1, "requestId must not be empty")
    .describe("The session requestId from mermaid_fix_start."),
});

const FixStatusInputSchema = z.object({
  requestId: z
    .string()
    .min(1, "requestId must not be empty")
    .describe("The session requestId from mermaid_fix_start."),
});

const server = new Server(
  {
    name: "mermaid_mcp_tool",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const fixEngine = MermaidFixEngine.getInstance();

// 1. 列出可用 tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: VALIDATE_TOOL_NAME,
        description:
          "Validate the syntax of a Mermaid diagram code string using the same " +
          "mermaid npm package version (11.12.1) and parse() API as the frontend renderer. " +
          "Returns whether the code is syntactically valid, the detected diagram type if valid, " +
          "or a structured error (message/hash/str) if invalid, which can be fed back to an LLM " +
          "for self-correction.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The Mermaid diagram source code to validate.",
            },
          },
          required: ["code"],
        },
      },
      {
        name: FIX_START_TOOL_NAME,
        description:
          "Start a new Mermaid diagram fix session. Submits the initial code and performs first validation. " +
          "If invalid, returns detailed errors with line numbers for targeted fixes.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The initial Mermaid diagram source code.",
            },
            maxAttempts: {
              type: "number",
              description:
                "Maximum number of fix attempts allowed (default: 10, max: 50).",
            },
          },
          required: ["code"],
        },
      },
      {
        name: FIX_SUBMIT_TOOL_NAME,
        description:
          "Submit line-level fixes to an ongoing fix session. Only modifies specified lines, " +
          "keeps other lines intact, and re-validates the complete diagram.",
        inputSchema: {
          type: "object",
          properties: {
            requestId: {
              type: "string",
              description: "The session requestId from mermaid_fix_start.",
            },
            lineFixes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  lineNumber: { type: "number" },
                  content: { type: "string" },
                },
                required: ["lineNumber", "content"],
              },
              description:
                "Array of line fixes: specify lineNumber (1-based) and new content for that line.",
            },
          },
          required: ["requestId", "lineFixes"],
        },
      },
      {
        name: FIX_COMPLETE_TOOL_NAME,
        description:
          "Get the final valid code from a completed session and clean up resources.",
        inputSchema: {
          type: "object",
          properties: {
            requestId: {
              type: "string",
              description: "The session requestId from mermaid_fix_start.",
            },
          },
          required: ["requestId"],
        },
      },
      {
        name: FIX_STATUS_TOOL_NAME,
        description: "Get the current status of an ongoing fix session.",
        inputSchema: {
          type: "object",
          properties: {
            requestId: {
              type: "string",
              description: "The session requestId from mermaid_fix_start.",
            },
          },
          required: ["requestId"],
        },
      },
    ],
  };
});

// 2. 执行 tool 调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === VALIDATE_TOOL_NAME) {
      const parsed = ValidateInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${parsed.error.message}`,
            },
          ],
        };
      }
      const result = await validateMermaidSyntax(parsed.data.code);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    }

    if (name === FIX_START_TOOL_NAME) {
      const parsed = FixStartInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${parsed.error.message}`,
            },
          ],
        };
      }
      const result = await fixEngine.submitInitialCode(
        parsed.data.code,
        parsed.data.maxAttempts
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    }

    if (name === FIX_SUBMIT_TOOL_NAME) {
      const parsed = FixSubmitInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${parsed.error.message}`,
            },
          ],
        };
      }
      const result = await fixEngine.submitFixes(
        parsed.data.requestId,
        parsed.data.lineFixes
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    }

    if (name === FIX_COMPLETE_TOOL_NAME) {
      const parsed = FixCompleteInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${parsed.error.message}`,
            },
          ],
        };
      }
      const finalCode = await fixEngine.getFinalCode(parsed.data.requestId);
      if (finalCode) {
        await fixEngine.cleanupSession(parsed.data.requestId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, code: finalCode }),
            },
          ],
        };
      }
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              message: "Session not completed or not found",
            }),
          },
        ],
      };
    }

    if (name === FIX_STATUS_TOOL_NAME) {
      const parsed = FixStatusInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments: ${parsed.error.message}`,
            },
          ],
        };
      }
      const session = await fixEngine.getSession(parsed.data.requestId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(session || { error: "Session not found" }),
          },
        ],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Internal error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mermaid_mcp_tool MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mermaid_mcp_tool:", err);
  process.exit(1);
});
