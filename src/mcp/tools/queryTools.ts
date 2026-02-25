import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SQLClient } from "../../db/sqlClient.js";

function stripComments(sql: string): string {
  // remove /* */ and -- comments (simple, not a full parser)
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
}

function containsForbiddenTokens(sqlUpper: string): boolean {
  // block common write / execution / delay primitives
  const forbidden =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|EXEC|EXECUTE|GRANT|REVOKE|DENY|WAITFOR|DBCC|OPENROWSET|OPENDATASOURCE|BULK|SHUTDOWN)\b/;
  return forbidden.test(sqlUpper);
}

export function registerQueryTools(server: McpServer) {
  server.registerTool(
    "db.select",
    {
      title: "Execute dynamic SELECT query",
      description:
        "Executes a read-only SELECT (or WITH..SELECT) query. Rows capped server-side. Single statement only.",
      inputSchema: {
        sql: z.string().min(1),
        maxRows: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max rows (default 100, max 200)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ sql, maxRows }) => {
      const limit = Math.min(maxRows ?? 100, 200);

      // normalize + basic sanitization
      let q = stripComments(sql).trim();

      // single statement: allow ONE trailing semicolon only
      if (q.includes(";")) {
        const onlyTrailing =
          q.endsWith(";") && q.slice(0, -1).indexOf(";") === -1;
        if (!onlyTrailing) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Only a single SELECT statement is allowed (no multiple statements).",
              },
            ],
          };
        }
        q = q.slice(0, -1).trim();
      }

      const upper = q.toUpperCase();

      // allow SELECT or WITH (CTE)
      if (!(upper.startsWith("SELECT") || upper.startsWith("WITH"))) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Only SELECT queries are allowed (CTE starting with WITH is allowed).",
            },
          ],
        };
      }

      if (containsForbiddenTokens(upper) || /\bINTO\b/.test(upper)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Query rejected: forbidden keyword detected (write/exec/dangerous feature).",
            },
          ],
        };
      }

      // row cap that works with WITH/ORDER BY/etc.
      const cappedBatch = `
        SET NOCOUNT ON;

        BEGIN TRY
            SET ROWCOUNT ${limit};
            ${q}
            SET ROWCOUNT 0;
        END TRY
        BEGIN CATCH
            SET ROWCOUNT 0;
            THROW;
        END CATCH
        `;

      try {
        const result = await SQLClient.query(cappedBatch);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  rowCount: result.recordset?.length ?? 0,
                  cappedAt: limit,
                  data: result.recordset ?? [],
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            { type: "text", text: `SQL Error: ${err?.message ?? String(err)}` },
          ],
        };
      }
    },
  );
}
