/**
 * @file index.ts
 * @description 2026 SDK v1.26.0+ Compliant Stateless Entry Point.
 * Implements the Factory Pattern: New Server & Transport per request
 * to ensure thread safety and prevent cross-client response leaking.
 */

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAdventureWorksServer } from "./mcp/server.js";
import dotenv from "dotenv";
import { SchemaService } from "./features/schema.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

/**
 * 📡 STATELESS REQUEST HANDLER
 * Following the SDK advisory: Create a fresh server and transport for every request.
 */
app.post("/mcp", async (req, res) => {
  // 1. Create a fresh transport for this specific Request/Response cycle
  const transport = new StreamableHTTPServerTransport({});

  // 2. Create server
  const server = createAdventureWorksServer();

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    // 4. Connect and handle using the stable v1.26.0 signature
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP Request Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
});

async function bootstrap() {
  try {
    // 1. Warm up the singleton SQL pool and Schema cache
    console.log("🔥 [System] Priming database metadata...");
    await SchemaService.getTables();

    // 2. Start the server
    app.listen(port, () => {
      console.log(`🚀 AdventureWorks Agent Online | Port: ${port}`);
    });
  } catch (error) {
    console.error("❌ Bootstrap failed:", error);
  }
}
bootstrap();
