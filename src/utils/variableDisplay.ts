const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;

export interface TextSegment {
  type: "text" | "variable";
  text: string;
  name?: string;
  start: number;
  end: number;
}

export function parseVariableSegments(text: string): TextSegment[] {
  if (!text) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(VARIABLE_PATTERN.source, "g");

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }
    segments.push({
      type: "variable",
      text: match[0],
      name: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
      start: lastIndex,
      end: text.length,
    });
  }

  return segments;
}

export function getVariableAtIndex(text: string, index: number): string | null {
  for (const segment of parseVariableSegments(text)) {
    if (
      segment.type === "variable" &&
      index >= segment.start &&
      index < segment.end
    ) {
      return segment.name ?? null;
    }
  }
  return null;
}
