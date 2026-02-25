/**
 * @file testTools.ts
 * @description Simple diagnostic tools to verify MCP connectivity.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerTestTools(server: McpServer) {
  server.registerTool(
    "sys.echo",
    {
      title: "Echo Test",
      description: "Returns the input string to verify the connection is working.",
      inputSchema: {
        message: z.string().describe("The message to echo back"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ message }) => {
      return {
        content: [
          {
            type: "text",
            text: `🚀 Server is LIVE! Message: ${message}. Time: ${new Date().toISOString()}`,
          },
        ],
      };
    }
  );
}