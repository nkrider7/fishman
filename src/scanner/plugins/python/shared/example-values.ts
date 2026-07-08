export function exampleForType(
  type: string,
  validation?: Record<string, unknown>,
): string | number | boolean | unknown[] | Record<string, unknown> | null {
  if (validation?.example !== undefined) return validation.example as string | number | boolean;

  const lower = type.toLowerCase();
  const base = type.replace(/^List\[|\]$/g, "").replace(/^Optional\[|\]$/g, "");

  if (validation?.enum) {
    const enums = validation.enum as unknown[];
    if (enums.length > 0) return enums[0] as string;
  }

  switch (base) {
    case "EmailStr":
    case "email":
      return "john@example.com";
    case "UUID":
    case "uuid":
      return "550e8400-e29b-41d4-a716-446655440000";
    case "HttpUrl":
    case "url":
      return "https://example.com";
    case "int":
    case "integer":
      return validation?.ge ? Number(validation.ge) : 0;
    case "float":
    case "decimal":
    case "Decimal":
      return 0.0;
    case "bool":
    case "boolean":
      return true;
    case "datetime":
      return "2026-01-01T00:00:00Z";
    case "date":
      return "2026-01-01";
    case "phone":
      return "9876543210";
    case "str":
    case "string":
      if (validation?.min_length) return "a".repeat(Number(validation.min_length));
      return "";
    case "List":
    case "list":
      return [];
    case "Dict":
    case "dict":
      return {};
    case "Set":
    case "set":
      return [];
    default:
      if (lower.startsWith("list[")) return [];
      if (lower.startsWith("dict")) return {};
      if (lower === "optional") return null;
      return "";
  }
}

export function parseDocstring(docstring: string | undefined): {
  description?: string;
  args: Record<string, string>;
  returns?: string;
  raises: string[];
} {
  if (!docstring) return { args: {}, raises: [] };

  const trimmed = docstring.trim();
  if (/^Args:/m.test(trimmed) || /^Parameters:/m.test(trimmed)) {
    return parseGoogleDocstring(trimmed);
  }
  if (/^Parameters\s*$/m.test(trimmed) || /^\s*-+\s*$/m.test(trimmed)) {
    return parseNumpyDocstring(trimmed);
  }
  if (/:param\s/.test(trimmed) || /:return:/.test(trimmed)) {
    return parseSphinxDocstring(trimmed);
  }

  const firstPara = trimmed.split(/\n\n/)[0]?.trim();
  return { description: firstPara, args: {}, raises: [] };
}

function parseGoogleDocstring(text: string): ReturnType<typeof parseDocstring> {
  const args: Record<string, string> = {};
  const raises: string[] = [];
  let description = "";
  let returns: string | undefined;

  const sections = text.split(/\n(?=(?:Args|Arguments|Parameters|Returns|Raises):)/);
  for (const section of sections) {
    if (section.match(/^(Args|Arguments|Parameters):/)) {
      const body = section.replace(/^(Args|Arguments|Parameters):\s*/, "");
      for (const line of body.split("\n")) {
        const m = line.match(/^\s*(\w+):\s*(.+)/);
        if (m) args[m[1]] = m[2].trim();
      }
    } else if (section.match(/^Returns:/)) {
      returns = section.replace(/^Returns:\s*/, "").trim();
    } else if (section.match(/^Raises:/)) {
      const body = section.replace(/^Raises:\s*/, "");
      raises.push(...body.split("\n").map((l) => l.trim()).filter(Boolean));
    } else {
      description = section.trim();
    }
  }

  return { description, args, returns, raises };
}

function parseNumpyDocstring(text: string): ReturnType<typeof parseDocstring> {
  return parseGoogleDocstring(text.replace(/Parameters\s*-+/g, "Args:"));
}

function parseSphinxDocstring(text: string): ReturnType<typeof parseDocstring> {
  const args: Record<string, string> = {};
  const raises: string[] = [];
  let returns: string | undefined;
  let description = "";

  for (const line of text.split("\n")) {
    const param = line.match(/:param\s+(\w+):\s*(.+)/);
    if (param) {
      args[param[1]] = param[2].trim();
      continue;
    }
    const ret = line.match(/:returns?:\s*(.+)/);
    if (ret) {
      returns = ret[1].trim();
      continue;
    }
    const raise = line.match(/:raises?\s+(\w+):/);
    if (raise) {
      raises.push(raise[1]);
      continue;
    }
    if (!line.startsWith(":")) {
      description += (description ? "\n" : "") + line;
    }
  }

  return { description: description.trim(), args, returns, raises };
}
