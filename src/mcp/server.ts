// Main MCP Server initialization

/**
 * 💡 ADVENTUREWORKS MCP SERVER ORCHESTRATOR
 * * This file initializes the central MCP Server instance here and export it so that our modular tools and resources to register themselves cleanly.
 * By isolating this, we prevent circular dependencies and allow

 */

/**
 * @file server.ts
 * @description Factory for creating fully-configured MCP Server instances.
 * Separates protocol definition from network transport logic.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSchemaTools } from "./tools/schemaTools.js";
import { registerTestTools } from "./tools/testTools.js";
// import { registerInventoryTools } from "./tools/inventoryTools.js";
// import { registerAuditTools } from "./tools/auditTools.js"; 

/**
 * createAdventureWorksServer
 * @description Creates and configures a fresh McpServer instance.
 * @returns {McpServer} A server instance with all tools registered.
 */
export function createAdventureWorksServer(): McpServer {
    const server = new McpServer({
        name: "adventureworks-manager",
        version: "1.0.0",
    });

    // Register all tool modules here
    registerSchemaTools(server);
    registerTestTools(server);
    // registerInventoryTools(server);
    
    // As you grow, add more registrations here:
    // registerAuditTools(server);

    return server;
}