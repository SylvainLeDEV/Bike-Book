import "server-only";
import type { CallToolResult, McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AccessContext } from "@/server/db";

// The building blocks of the MCP tools (D-90). A tool is a thin layer: it maps its snake_case
// input to the forms' input, validates it with the forms' Zod schemas, calls the data-access
// layer, and answers with structured JSON and a short text summary. No business rule here.

/** One problem with the input: the tool's field (snake_case path) and the form's French message. */
export type FieldError = { field: string; message: string };

/** Thrown inside a write to refuse it; inside `atomically` or `previewWrite`, it undoes the write. */
export class ToolRefusal extends Error {
  constructor(
    readonly errors: FieldError[],
    readonly summary = "The input was refused; fix the fields listed and try again.",
  ) {
    super(summary);
  }
}

type ToolDefinition<Shape extends z.ZodRawShape> = {
  /** `verb_noun`, stable: tools are added, never renamed. */
  name: string;
  title: string;
  /** For the assistant: what it does, and the units and enums of its input (D-50). */
  description: string;
  /** Strict (`z.strictObject`), nested objects too: an unknown field is refused. */
  input: z.ZodObject<Shape>;
  /** Writes are never destructive (no delete tool) and take `dry_run`. */
  kind: "read" | "write";
  run: (ctx: AccessContext, args: z.output<z.ZodObject<Shape>>) => CallToolResult;
};

export type McpTool = {
  name: string;
  register: (server: McpServer, ctx: AccessContext) => void;
};

const ANNOTATIONS: Record<"read" | "write", ToolAnnotations> = {
  read: { readOnlyHint: true, openWorldHint: false },
  write: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/** A tool of the registry; a `ToolRefusal` thrown by `run` becomes the error answer. */
export function defineTool<Shape extends z.ZodRawShape>(tool: ToolDefinition<Shape>): McpTool {
  return {
    name: tool.name,
    register: (server, ctx) =>
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
          annotations: { title: tool.title, ...ANNOTATIONS[tool.kind] },
        },
        // The SDK checks the input against `tool.input` before calling: types, enums, and no
        // unknown field (strict objects), so a misspelt field is refused rather than ignored.
        (args) => {
          try {
            return tool.run(ctx, args as z.output<z.ZodObject<Shape>>);
          } catch (error) {
            if (error instanceof ToolRefusal) return refused(error.errors, error.summary);
            throw error;
          }
        },
      ),
  };
}

/** A successful answer: the summary for a person, then the same data as JSON. */
export function answer(summary: string, data: Record<string, unknown>): CallToolResult {
  return {
    content: [
      { type: "text", text: summary },
      { type: "text", text: JSON.stringify(data) },
    ],
    structuredContent: data,
  };
}

/** A refused input: `errors` lists each field with the message the app's form would show. */
export function refused(errors: FieldError[], summary: string): CallToolResult {
  const data = { errors };
  return {
    isError: true,
    content: [
      { type: "text", text: summary },
      { type: "text", text: JSON.stringify(data) },
    ],
    structuredContent: data,
  };
}

/** `modelYear` → `model_year`; the keys already in snake_case stay as they are. */
function snakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * A form path as the tool's field: `["maxClicks", "low_speed_rebound"]` under `suspension` →
 * `suspension.max_clicks.low_speed_rebound`; under `components[2]`, `components[2].brand`.
 * `rename` maps the form keys whose tool name is not their snake_case.
 */
function fieldPath(
  prefix: string,
  path: readonly PropertyKey[],
  rename: Record<string, string>,
): string {
  const parts = prefix ? [prefix] : [];
  for (const key of path) {
    if (typeof key === "number") parts.push(`${parts.pop() ?? ""}[${key}]`);
    else parts.push(rename[String(key)] ?? snakeCase(String(key)));
  }
  return parts.join(".") || "input";
}

/** The issues of a form schema, as the tool's fields with the form's French messages. */
export function fieldErrorsOf(
  issues: readonly z.core.$ZodIssue[],
  prefix = "",
  rename: Record<string, string> = {},
): FieldError[] {
  return issues.map((issue) => ({
    field: fieldPath(prefix, issue.path, rename),
    message: issue.message,
  }));
}

/** The form's field errors (`{ modelYear: "…" }`), as the tool's fields. */
export function fieldErrorsFrom(
  errors: Partial<Record<string, string>>,
  prefix = "",
  rename: Record<string, string> = {},
): FieldError[] {
  return Object.entries(errors).flatMap(([key, message]) =>
    message ? [{ field: fieldPath(prefix, [key], rename), message }] : [],
  );
}

// --- Pagination --------------------------------------------------------------------------------

export const pageInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Items per page, 1 to 100 (default 50)."),
  cursor: z
    .string()
    .optional()
    .describe("`next_cursor` of the previous page; omit for the first page."),
};

/**
 * One page of `items` (in a stable order), after the item whose key is `cursor`. The cursor is
 * opaque to the assistant: the last key of the previous page.
 */
export function paginate<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  page: { limit?: number; cursor?: string },
): { items: T[]; next_cursor: string | null } {
  const limit = page.limit ?? 50;
  let start = 0;
  if (page.cursor != null) {
    const index = items.findIndex((item) => keyOf(item) === page.cursor);
    if (index < 0) {
      throw new ToolRefusal(
        [{ field: "cursor", message: "Curseur inconnu : recommence sans curseur." }],
        "Unknown cursor.",
      );
    }
    start = index + 1;
  }
  const slice = items.slice(start, start + limit);
  const last = slice.at(-1);
  return {
    items: slice,
    next_cursor: last && start + limit < items.length ? keyOf(last) : null,
  };
}

// --- Writes --------------------------------------------------------------------------------------

export const dryRunInput = z
  .boolean()
  .describe(
    "Required. true: validate everything and answer with what would be written, warnings included, writing nothing. false: write. Always call with true first and show the preview to the owner.",
  );

/**
 * One log line per MCP write (D-90): the tool, the workspace, the token and the ids written. No
 * value typed by the owner, never the token.
 */
export function logWrite(
  ctx: AccessContext,
  tool: string,
  ids: Record<string, number | number[] | null>,
): void {
  console.info(
    JSON.stringify({
      event: "mcp_write",
      tool,
      workspace_id: ctx.workspace.id,
      token_id: ctx.tokenId ?? null,
      ...ids,
    }),
  );
}
