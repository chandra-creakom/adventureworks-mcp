/**
 * @file schemaTools.ts
 * @description Bridges SchemaService to MCP tools (schema discovery).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SchemaService } from "../../features/schema.js";

export function registerSchemaTools(server: McpServer) {
  //   server.registerTool(
  //     "db.listTables",
  //     {
  //       title: "List database tables",
  //       description:
  //         "Returns a list of all tables in the configured schema. Use this first to see what data is available.",
  //       inputSchema: {},
  //       annotations: { readOnlyHint: true },
  //     },
  //     async () => {
  //       const tables = await SchemaService.getTables();
  //       return {
  //         content: [{ type: "text", text: JSON.stringify(tables, null, 2) }],
  //       };
  //     },
  //   );

  server.registerTool(
    "db.describeTable",
    {
      title: "Describe table structure",
      description:
        "Returns columns and primary keys for a specific table. Use before writing queries.",
      inputSchema: {
        tableName: z.string().min(1).describe("Table name, e.g. 'Product'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tableName }) => {
      const [columns, allPrimaryKeys] = await Promise.all([
        SchemaService.getTableSchema(tableName),
        SchemaService.getPrimaryKeys(),
      ]);

      const primaryKeys = allPrimaryKeys
        .filter((pk) => pk.tableName === tableName)
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ tableName, columns, primaryKeys }, null, 2),
          },
        ],
      };
    },
  );

  //   server.registerTool(
  //     "db.listRelationships",
  //     {
  //       title: "List foreign key relationships",
  //       description:
  //         "Returns foreign keys so the agent can understand how to JOIN tables correctly.",
  //       inputSchema: {},
  //       annotations: { readOnlyHint: true },
  //     },
  //     async () => {
  //       const foreignKeys = await SchemaService.getForeignKeys();
  //       return {
  //         content: [{ type: "text", text: JSON.stringify(foreignKeys, null, 2) }],
  //       };
  //     },
  //   );

  server.registerTool(
    "db.getDatabaseContext",
    {
      title: "Get complete database schema context",
      description:
        "Returns tables, primary keys, and foreign key relationships. Use at the start to understand the DB structure.",
      inputSchema: {
        maxTables: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Limit number of tables returned."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ maxTables }) => {
      const schema = process.env.DB_SCHEMA ?? "SalesLT";

      const [tablesAll, primaryKeys, foreignKeys] = await Promise.all([
        SchemaService.getTables(),
        SchemaService.getPrimaryKeys(),
        SchemaService.getForeignKeys(),
      ]);

      const tables = maxTables ? tablesAll.slice(0, maxTables) : tablesAll;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                schema,
                tables,
                primaryKeys,
                foreignKeys,
                note: "All results are filtered to the configured schema.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
