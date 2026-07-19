import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { selectResolvedVariables } from "../slices/environmentSlice";
import { findRootCollectionId } from "@/utils/collectionUtils";
import { buildRequestPayload } from "@/utils/requestBuilder";
import { executeRequest } from "@/tauri/http";
import {
  buildIntrospectionRequestBody,
  parseIntrospectionResponse,
  schemaCacheKey,
  setCachedSchema,
  type GraphQLSchemaCacheEntry,
} from "@/graphql";
import type { RequestDraft } from "@/types/request";
import { createKeyValue } from "@/types/request";

export const fetchGraphQLSchemaThunk = createAsyncThunk(
  "graphql/fetchSchema",
  async (
    tabId: string,
    { getState },
  ): Promise<GraphQLSchemaCacheEntry> => {
    const state = getState() as RootState;
    const draft = state.request.drafts[tabId];
    if (!draft) {
      throw new Error("No active request");
    }
    if (!draft.url?.trim()) {
      throw new Error("Enter a GraphQL endpoint URL first");
    }

    const rootCollectionId = findRootCollectionId(
      draft.collectionId,
      state.collections.folders,
    );
    const variables = selectResolvedVariables(state, rootCollectionId);

    const introspectionDraft: RequestDraft = {
      ...draft,
      method: "POST",
      bodyType: "json",
      body: buildIntrospectionRequestBody(),
      graphql: undefined,
      headers: ensureJsonContentType(draft.headers),
    };

    const payload = buildRequestPayload(introspectionDraft, {
      ignoreSsl: state.settings.ignoreSsl,
      timeoutMs: Math.max(state.settings.timeoutMs, 30_000),
      variables,
      cookies: state.cookies.cookies,
    });

    const response = await executeRequest(payload);
    if (response.error) {
      throw new Error(response.error);
    }
    if (response.status === 0) {
      throw new Error(response.status_text || "Introspection request failed");
    }

    const parsed = parseIntrospectionResponse(response.body);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const resolvedUrl = payload.url;
    const key = schemaCacheKey(resolvedUrl, authFingerprint(draft));
    return setCachedSchema(key, {
      endpoint: resolvedUrl,
      docs: parsed.docs,
      schemaJson: parsed.schemaJson,
      typeCount: parsed.typeCount,
    });
  },
);

function ensureJsonContentType(
  headers: RequestDraft["headers"],
): RequestDraft["headers"] {
  const hasCt = headers.some(
    (h) => h.enabled && h.key.toLowerCase() === "content-type",
  );
  if (hasCt) return headers;
  return [
    ...headers,
    { ...createKeyValue(), key: "Content-Type", value: "application/json" },
  ];
}

function authFingerprint(draft: RequestDraft): string {
  return `${draft.auth.type}:${JSON.stringify(draft.auth)}`;
}
