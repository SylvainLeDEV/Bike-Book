import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type { AccessContext } from "@/server/db";
import packageJson from "../../../package.json";
import { MCP_TOOLS } from "./registry";

const INSTRUCTIONS = `Bike-Book tracks the owner's bikes, their parts, rides and maintenance. These tools act as the owner, in their workspace only.
- Units are the app's raw units: distances in metres, durations in seconds, weights in grams, money in euro cents (integers); calendar dates YYYY-MM-DD; instants ISO 8601 UTC. Enum values are English codes.
- Every write takes dry_run. Call it with dry_run true first, show the owner what would be written (a table), and write (dry_run false) only once they agree.
- A refused input answers isError with errors: [{ field, message }], the message in French as the app shows it: fix those fields and try again.
- Deletes (delete_ride, delete_rides, delete_maintenance, delete_setup, delete_attachment, abandon_run) are for mistakes: dry run first, then delete only once the owner has confirmed. Nothing else is deleted; the frame number is never read nor written.
- Read list_component_types before adding parts. Answer with the bike page's link (url) once written.
- Parts fitted to a bike are components (add_component); spare parts, products (oil, grease, sealant…) and tools are the workshop's items (add_workshop_item, update_stock). Read list_workshop_items before adding one, to avoid a duplicate. To buy: set_restock ("À commander", "En commande"), then receive_item when it arrives.
- "What do I have to do?": list_due_work gives the overdue and due-soon rules, the open tasks and the runs in progress, each with its procedure's material read against the workshop (ok, low, missing). get_procedure gives the steps and the material for a bike. Say what to do first and what the owner lacks.
- Work done on a bike: record_maintenance (its lines with rule_id are "C'est fait" on those rules: their counters restart), replace_component for a part changed (from_item_id takes it from the workshop's stock). A task done is set_task_done; record the work itself too.
- "When did I last…?": list_maintenance (filters bike, part, rule, days, words). A mistake in an event: update_maintenance.
- "How many km on my chain?", "what has this bike cost?": get_bike_usage (each part's wear, the parts before it, the total cost).
- A procedure written for the owner (create_procedure): steps from the manufacturer's documents, their source as a link resource; never invent a torque. update_procedure replaces whole lists: pass back each step's id to keep it and its photos.
- Doing a procedure with the owner: start_run (from a task, a rule with a procedure, or a procedure and a bike), guide them one step at a time and check each with update_run_steps, then finish_run: one event, the parts and products taken from the workshop, the rule restarted. get_run shows what finish_run will propose; ask about the parts and products actually used.
- Photos and PDFs never go through these tools: get_upload_link gives a link for one element, and you send each file from the owner's computer with curl (a photo the owner sent from the phone is under ~/.claude/uploads/). Then update_attachment for its caption or kind.
- Suspension and tyre setup (the "Réglages" tab): list_setups gives the current one first; add_setup starts from it and changes only the values given.
- A history of rides (a spreadsheet, a log): create_rides, up to 500 at a time, dry run first; tell the owner about its warnings (duplicates, initial counters that may already hold that wear) and keep the ride_ids it answers: delete_rides undoes it.
- A ride's wear counts on its bike's parts (on a bike park day, the descent time): create_ride and update_ride answer the rules they make due; tell the owner.
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
