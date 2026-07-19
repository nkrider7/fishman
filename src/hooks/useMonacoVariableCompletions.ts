import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import type { IDisposable } from "monaco-editor";
import { useAppSelector } from "@/hooks/redux";
import { useVariableContext } from "@/hooks/useVariableContext";
import {
  buildFolderChain,
  mergeFolderVariables,
} from "@/collections/inheritance";
import {
  bindMonacoVariableSuggestTrigger,
  buildSuggestionCatalog,
  ensureMonacoVariableCompletionsForLanguages,
  setSharedMonacoVariableCatalog,
  type VariableSuggestion,
} from "@/variables/suggestions";

/**
 * Keeps the Monaco completion catalog in sync with env / folder variables,
 * and returns an `onMount` helper that registers providers once per language.
 */
export function useMonacoVariableCompletions(collectionId?: string | null) {
  const { variableInfo } = useVariableContext(collectionId);
  const folders = useAppSelector((s) => s.collections.folders);
  const triggerDisposablesRef = useRef<IDisposable[]>([]);

  const folderVariables = useMemo(() => {
    if (!collectionId) return {};
    return mergeFolderVariables(buildFolderChain(collectionId, folders));
  }, [collectionId, folders]);

  const catalog = useMemo(
    (): VariableSuggestion[] =>
      buildSuggestionCatalog({
        variableInfo,
        folderVariables,
      }),
    [variableInfo, folderVariables],
  );

  useEffect(() => {
    setSharedMonacoVariableCatalog(() => catalog);
  }, [catalog]);

  useEffect(() => {
    return () => {
      for (const d of triggerDisposablesRef.current) d.dispose();
      triggerDisposablesRef.current = [];
    };
  }, []);

  const attachCompletions = useCallback(
    (monaco: Monaco, languages: string | string[]) => {
      const list = Array.isArray(languages) ? languages : [languages];
      setSharedMonacoVariableCatalog(() => catalog);
      ensureMonacoVariableCompletionsForLanguages(monaco, list);
    },
    [catalog],
  );

  const enhanceOnMount = useCallback(
    (languages: string | string[], existing?: OnMount): OnMount => {
      return (editor, monaco) => {
        attachCompletions(monaco, languages);
        const trigger = bindMonacoVariableSuggestTrigger(editor);
        triggerDisposablesRef.current.push(trigger);
        existing?.(editor, monaco);
      };
    },
    [attachCompletions],
  );

  return { attachCompletions, enhanceOnMount, catalog };
}
