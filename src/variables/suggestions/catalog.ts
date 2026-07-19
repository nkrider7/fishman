import type { VariableInfo } from "@/utils/variableSubstitution";
import { listDynamicVariables } from "@/script-engine/builtins";
import type { VariableSuggestion } from "./types";

const DYNAMIC_DETAILS: Record<string, string> = {
  $uuid: "Random UUID",
  $guid: "Random GUID",
  $timestamp: "Unix timestamp (ms)",
  $isoTimestamp: "ISO-8601 timestamp",
  $randomInt: "Random integer",
  $randomFloat: "Random float",
  $randomBoolean: "Random boolean",
  $randomFirstName: "Random first name",
  $randomLastName: "Random last name",
  $randomFullName: "Random full name",
  $randomEmail: "Random email",
  $randomPhone: "Random phone",
  $randomCompany: "Random company",
  $randomCity: "Random city",
  $randomCountry: "Random country",
  $randomColor: "Random color",
  $randomPassword: "Random password",
  $randomLorem: "Random word",
  $randomSentence: "Random sentence",
  $randomParagraph: "Random paragraph",
  $randomImage: "Random image URL",
  $randomAvatar: "Random avatar URL",
};

function truncate(value: string, max = 48): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "collection":
      return "collection";
    case "global":
      return "global";
    case "folder":
      return "folder";
    default:
      return scope;
  }
}

export function buildEnvironmentSuggestions(
  variableInfo: Record<string, VariableInfo>,
): VariableSuggestion[] {
  return Object.entries(variableInfo)
    .filter(([name]) => Boolean(name))
    .map(([name, info]) => ({
      id: `env:${info.scope}:${name}`,
      name,
      kind: "environment" as const,
      detail: truncate(info.value),
      sourceLabel: scopeLabel(info.scope),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildFolderSuggestions(
  folderVariables: Record<string, string>,
): VariableSuggestion[] {
  return Object.entries(folderVariables)
    .filter(([name]) => Boolean(name))
    .map(([name, value]) => ({
      id: `folder:${name}`,
      name,
      kind: "folder" as const,
      detail: truncate(value),
      sourceLabel: "folder",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildDynamicSuggestions(): VariableSuggestion[] {
  return listDynamicVariables()
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: `dynamic:${name}`,
      name,
      kind: "dynamic" as const,
      detail: DYNAMIC_DETAILS[name] ?? "Dynamic variable",
      sourceLabel: "dynamic",
    }));
}

/**
 * Merge env → folder → dynamic. Env/folder names win over dynamic duplicates.
 */
export function buildSuggestionCatalog(input: {
  variableInfo: Record<string, VariableInfo>;
  folderVariables?: Record<string, string>;
}): VariableSuggestion[] {
  const seen = new Set<string>();
  const out: VariableSuggestion[] = [];

  const pushAll = (items: VariableSuggestion[]) => {
    for (const item of items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  };

  pushAll(buildEnvironmentSuggestions(input.variableInfo));
  pushAll(buildFolderSuggestions(input.folderVariables ?? {}));
  pushAll(buildDynamicSuggestions());

  return out;
}
