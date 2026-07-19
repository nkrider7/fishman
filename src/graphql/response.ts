/**
 * Split a GraphQL HTTP response into data / errors / extensions views.
 */

export interface GraphQLResponseParts {
  isGraphQLShaped: boolean;
  data: unknown;
  errors: unknown;
  extensions: unknown;
  dataJson: string;
  errorsJson: string;
  extensionsJson: string;
  hasErrors: boolean;
  hasExtensions: boolean;
}

export function parseGraphQLResponseBody(body: string): GraphQLResponseParts {
  const empty: GraphQLResponseParts = {
    isGraphQLShaped: false,
    data: undefined,
    errors: undefined,
    extensions: undefined,
    dataJson: "",
    errorsJson: "",
    extensionsJson: "",
    hasErrors: false,
    hasExtensions: false,
  };

  if (!body.trim()) return empty;

  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return empty;
    }
    const obj = parsed as Record<string, unknown>;
    const hasData = "data" in obj;
    const hasErrors = "errors" in obj;
    const hasExtensions = "extensions" in obj;
    if (!hasData && !hasErrors) return empty;

    const data = obj.data;
    const errors = obj.errors;
    const extensions = obj.extensions;

    return {
      isGraphQLShaped: true,
      data,
      errors,
      extensions,
      dataJson: data !== undefined ? JSON.stringify(data, null, 2) : "",
      errorsJson: errors !== undefined ? JSON.stringify(errors, null, 2) : "",
      extensionsJson:
        extensions !== undefined ? JSON.stringify(extensions, null, 2) : "",
      hasErrors: Array.isArray(errors) && errors.length > 0,
      hasExtensions: hasExtensions && extensions !== undefined,
    };
  } catch {
    return empty;
  }
}
