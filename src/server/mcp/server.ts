import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type { AccessContext } from "@/server/db";
import packageJson from "../../../package.json";
import { MCP_TOOLS } from "./registry";

const INSTRUCTIONS = `Bike-Book tracks the owner's bikes, their parts, rides and maintenance. These tools act as the owner, in their workspace only.
- Units are the app's raw units: distances in metres, durations in seconds, weights in grams, money in euro cents (integers); calendar dates YYYY-MM-DD; instants ISO 8601 UTC. Enum values are English codes.
- Every write takes dry_run. Call it with dry_run true first, show the owner what would be written (a table), and write (dry_run false) only once they agree.
- A refused input answers isError with errors: [{ field, message }], the message in French as the app shows it: fix those fields and try again.
- Nothing can be deleted through these tools; the frame number is never read nor written.
- Read list_component_types before adding parts. Answer with the bike page's link (url) once written.
- A part's maintenance rules count from its fitting day (an original part: the bike's purchase day), so on a bike bought a while ago the day-based ones (fork or shock service, brake bleed, tubeless sealant) start overdue. The dry run gives each rule's status: ask the owner when each overdue or due-soon one was last done and pass it as rules[].last_done_on (today if they do not know).`;

/** A server for one request, its tools bound to the caller's access context (D-25, D-90). */
export function createMcpServer(ctx: AccessContext): McpServer {
  const server = new McpServer(
    { name: "bike-book", title: "Bike-Book", version: packageJson.version },
    { instructions: INSTRUCTIONS },
  );
  for (const tool of MCP_TOOLS) tool.register(server, ctx);
  return server;
}
