import { useCallback, useMemo } from "react";
import { useAppSelector } from "@/hooks/redux";
import { useVariableContext } from "@/hooks/useVariableContext";
import {
  buildFolderChain,
  mergeFolderVariables,
} from "@/collections/inheritance";
import {
  buildSuggestionCatalog,
  filterSuggestions,
  type VariableSuggestion,
} from "@/variables/suggestions";

/**
 * Builds the filtered suggestion catalog for a collection-scoped input.
 */
export function useVariableSuggestionCatalog(
  collectionId?: string | null,
  query = "",
): VariableSuggestion[] {
  const { variableInfo } = useVariableContext(collectionId);
  const folders = useAppSelector((s) => s.collections.folders);

  const folderVariables = useMemo(() => {
    if (!collectionId) return {};
    const chain = buildFolderChain(collectionId, folders);
    return mergeFolderVariables(chain);
  }, [collectionId, folders]);

  const catalog = useMemo(
    () =>
      buildSuggestionCatalog({
        variableInfo,
        folderVariables,
      }),
    [variableInfo, folderVariables],
  );

  return useMemo(() => filterSuggestions(catalog, query), [catalog, query]);
}

export function useVariableSuggestionCatalogFactory(
  collectionId?: string | null,
) {
  const { variableInfo } = useVariableContext(collectionId);
  const folders = useAppSelector((s) => s.collections.folders);

  const folderVariables = useMemo(() => {
    if (!collectionId) return {};
    const chain = buildFolderChain(collectionId, folders);
    return mergeFolderVariables(chain);
  }, [collectionId, folders]);

  const catalog = useMemo(
    () =>
      buildSuggestionCatalog({
        variableInfo,
        folderVariables,
      }),
    [variableInfo, folderVariables],
  );

  return useCallback(
    (query: string) => filterSuggestions(catalog, query),
    [catalog],
  );
}
