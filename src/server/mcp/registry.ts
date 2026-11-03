import "server-only";
import type { McpTool } from "./tool";
import { attachmentTools } from "./tools/attachments";
import { bikeTools } from "./tools/bikes";
import { componentTools } from "./tools/components";
import { maintenanceTools } from "./tools/maintenance";
import { procedureTools } from "./tools/procedures";
import { rideTools } from "./tools/rides";
import { runTools } from "./tools/runs";
import { ruleTools } from "./tools/rules";
import { setupTools } from "./tools/setups";
import { todoTools } from "./tools/todo";
import { usageTools } from "./tools/usage";
import { workshopTools } from "./tools/workshop";

/**
 * Every MCP tool, one file per domain in ./tools (D-90, D-92 to D-99). A new domain adds its file
 * and one line here; tool names are never renamed once released.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  ...bikeTools,
  ...componentTools,
  ...usageTools,
  ...setupTools,
  ...ruleTools,
  ...maintenanceTools,
  ...rideTools,
  ...todoTools,
  ...workshopTools,
  ...procedureTools,
  ...runTools,
  ...attachmentTools,
];
