import "server-only";
import type { McpTool } from "./tool";
import { bikeTools } from "./tools/bikes";
import { componentTools } from "./tools/components";

/**
 * Every MCP tool, one file per domain in ./tools (D-90). A new domain (the rides: `rides.ts`)
 * adds its file and one line here; tool names are never renamed once released.
 */
export const MCP_TOOLS: readonly McpTool[] = [...bikeTools, ...componentTools];
