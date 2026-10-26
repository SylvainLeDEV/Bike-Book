import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { ComponentGroup, ComponentTypeCode, EvidenceLevel, TemplateSource } from "@/lib/enums";
import type { AccessContext } from "./access-context";
import { getDb } from "./client";
import { componentTypes, ruleTemplates } from "./schema";

// Reference data (feature 2). Component types are shared by every workspace; rule templates are
// either built-in (workspace_id null) or the current workspace's own (D-25).

export type ComponentType = {
  code: ComponentTypeCode;
  componentGroup: ComponentGroup;
  hasPosition: boolean;
  singleSlot: boolean;
};

export type RuleTemplate = {
  id: number;
  /** Built-in templates only. */
  code: string | null;
  builtIn: boolean;
  componentTypeCode: ComponentTypeCode | null;
  title: string;
  intervalDistanceM: number | null;
  intervalWearS: number | null;
  intervalDays: number | null;
  source: TemplateSource;
  evidenceLevel: EvidenceLevel;
  sourceUrl: string | null;
  notes: string | null;
};

/** Every component type. Not scoped: reference data shared by all workspaces. */
export function listComponentTypes(): ComponentType[] {
  return getDb()
    .select({
      code: componentTypes.code,
      componentGroup: componentTypes.componentGroup,
      hasPosition: componentTypes.hasPosition,
      singleSlot: componentTypes.singleSlot,
    })
    .from(componentTypes)
    .all() as ComponentType[];
}

/**
 * The templates the workspace can use: built-in ones and its own, optionally for one slot type
 * (`null`: bike-level templates).
 */
export function listRuleTemplates(
  ctx: AccessContext,
  componentTypeCode?: ComponentTypeCode | null,
): RuleTemplate[] {
  const rows = getDb()
    .select({
      id: ruleTemplates.id,
      code: ruleTemplates.code,
      workspaceId: ruleTemplates.workspaceId,
      componentTypeCode: ruleTemplates.componentTypeCode,
      title: ruleTemplates.title,
      intervalDistanceM: ruleTemplates.intervalDistanceM,
      intervalWearS: ruleTemplates.intervalWearS,
      intervalDays: ruleTemplates.intervalDays,
      source: ruleTemplates.source,
      evidenceLevel: ruleTemplates.evidenceLevel,
      sourceUrl: ruleTemplates.sourceUrl,
      notes: ruleTemplates.notes,
    })
    .from(ruleTemplates)
    .where(
      and(
        or(isNull(ruleTemplates.workspaceId), eq(ruleTemplates.workspaceId, ctx.workspace.id)),
        componentTypeCode === undefined
          ? undefined
          : componentTypeCode === null
            ? isNull(ruleTemplates.componentTypeCode)
            : eq(ruleTemplates.componentTypeCode, componentTypeCode),
      ),
    )
    .orderBy(asc(ruleTemplates.id))
    .all();
  return rows.map(({ workspaceId, componentTypeCode: type, ...template }) => ({
    ...template,
    builtIn: workspaceId == null,
    componentTypeCode: type as ComponentTypeCode | null,
  }));
}
