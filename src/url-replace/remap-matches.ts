import { applyFieldReplace } from "./replace-urls";
import type { UrlReplaceMatch, UrlReplaceOptions } from "./types";

/**
 * Remap existing find-matches to a new replace string without re-scanning.
 * Body/params replace all occurrences; URLs respect wholeOrigin.
 */
export function remapMatchReplace(
  matches: UrlReplaceMatch[],
  find: string,
  replace: string,
  options: Pick<UrlReplaceOptions, "matchCase" | "wholeOrigin">,
): UrlReplaceMatch[] {
  const findTrim = find.trim();
  const replaceTrim = replace.trim();
  if (!findTrim) return matches;

  if (!replaceTrim || findTrim === replaceTrim) {
    return matches.map((m) =>
      m.after === m.before
        ? m
        : {
            ...m,
            after: m.before,
          },
    );
  }

  return matches.map((m) => {
    const result = applyFieldReplace(m.before, findTrim, replaceTrim, m.field, {
      matchCase: options.matchCase,
      wholeOrigin:
        m.field === "url" ||
        m.field === "folder-base" ||
        m.field === "open-tab"
          ? options.wholeOrigin
          : false,
    });
    if (!result) {
      return m.after === m.before
        ? m
        : {
            ...m,
            after: m.before,
          };
    }
    if (
      m.after === result.next &&
      m.matchStart === result.matchStart &&
      m.occurrenceCount === result.count
    ) {
      return m;
    }
    return {
      ...m,
      after: result.next,
      matchStart: result.matchStart,
      matchLength: result.matchLength,
      occurrenceCount: result.count,
    };
  });
}
