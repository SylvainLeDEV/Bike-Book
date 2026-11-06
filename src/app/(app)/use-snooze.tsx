"use client";

import * as React from "react";
import { SnoozeSheet } from "@/components/plan/snooze-sheet";
import { useToast } from "@/components/ui/toast";
import type { LocalDate } from "@/lib/format";
import type { RuleRowVM } from "@/lib/view-models";
import { snoozeRuleAction, undoSnoozeAction } from "@/server/actions/rules";

/**
 * "Reporter" on a rule: the sheet to pick the day it comes back, and "Réactiver" at once
 * (D-105); both with "Annuler" restoring the previous snooze (D-60). Render `sheet` once.
 */
export function useSnooze(today: LocalDate) {
  const toast = useToast();
  const [state, setState] = React.useState<{ open: boolean; rule: RuleRowVM | null }>({
    open: false,
    rule: null,
  });

  async function apply(rule: RuleRowVM, until: LocalDate | null): Promise<string | null> {
    const result = await snoozeRuleAction(rule.id, until);
    if (!result.ok) return result.message;
    toast(`${result.message} : ${rule.title}`, {
      undo: async () => toast((await undoSnoozeAction(rule.id, result.previous)).message),
    });
    return null;
  }

  const rule = state.rule;
  return {
    open: (rule: RuleRowVM) => setState({ open: true, rule }),
    reactivate: async (rule: RuleRowVM) => {
      const error = await apply(rule, null);
      if (error) toast(error);
    },
    sheet: (
      <SnoozeSheet
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        rule={rule}
        today={today}
        onSubmit={async (until) => {
          if (!rule) return null;
          const error = await apply(rule, until);
          if (!error) setState((s) => ({ ...s, open: false }));
          return error;
        }}
      />
    ),
  };
}
