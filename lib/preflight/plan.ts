import type { PreflightInspection, PreflightState } from "./types";

export type PreflightPlan = {
  passed: string[];
  canFix: string[];
  needsDecision: string[];
  willNotChange: string[];
  notChecked: string[];
};

export function buildPreflightPlan(inspection: PreflightInspection): PreflightPlan {
  const byState = (state: PreflightState) => inspection.checks.filter(check => check.state === state).map(check => check.label);
  const optional = inspection.safety
    .filter(item => item.checked && (item.count ?? 0) > 0 && ["metadata", "attachments", "external-links", "comments"].includes(item.key))
    .map(item => item.label);
  return {
    passed: byState("pass"),
    canFix: byState("can-fix"),
    needsDecision: [...byState("fail"), ...byState("needs-decision"), ...optional],
    willNotChange: ["Page content and dimensions", "Form fields and stored values", "Internal page destinations"],
    notChecked: [...byState("not-checked"), ...inspection.safety.filter(item => !item.checked).map(item => item.label)],
  };
}
