import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "./redux";
import {
  setAiOpen,
  toggleAiOpen,
  setAiSidebarOpen,
  toggleAiSidebarOpen,
  addChatMessage,
  clearChatMessages,
  setPrompt,
  setLoading,
  setStatus,
  setResult,
  setError,
  clearResult,
} from "@/store/slices/aiSlice";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { setSearchQuery } from "@/store/slices/collectionsSlice";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { updateEnvironment } from "@/store/slices/environmentSlice";
import { selectActiveEnvironmentContext } from "@/store/selectors/environmentSelectors";
import { getAiEngineStatus, runAiCopilot } from "@/services/aiService";
import type {
  AiChatMessage,
  AiCopilotResult,
  AiGeneratedRequest,
  AiWorkspaceContext,
} from "@/types/ai";
import { createEmptyRequest, type RequestDraft } from "@/types/request";

export function useAiCopilot() {
  const dispatch = useAppDispatch();
  const ai = useAppSelector((s) => s.ai);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const activeDraft = useAppSelector((s) =>
    activeTabId ? s.request.drafts[activeTabId] : undefined,
  );
  const envContext = useAppSelector(selectActiveEnvironmentContext);
  const globalEnvs = useAppSelector((s) => s.environments.globalEnvironments);

  const checkStatus = useCallback(async () => {
    try {
      const status = await getAiEngineStatus();
      dispatch(setStatus(status));
      return status;
    } catch (err) {
      dispatch(
        setStatus({
          ready: true,
          modelLoaded: false,
          engineType: "Rule Router",
          ramUsageMb: 28,
          error: String(err),
        }),
      );
    }
  }, [dispatch]);

  const submitPrompt = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;

      const userMsg: AiChatMessage = {
        id: `user_${Date.now()}`,
        sender: "user",
        text: trimmed,
        timestamp: Date.now(),
      };
      dispatch(addChatMessage(userMsg));

      dispatch(setLoading(true));
      dispatch(setPrompt(trimmed));

      const context: AiWorkspaceContext = {
        activeUrl: activeDraft?.url,
        activeMethod: activeDraft?.method,
        environmentNames: globalEnvs.map((e) => e.name),
      };

      try {
        const result: AiCopilotResult = await runAiCopilot(trimmed, context);
        dispatch(setResult(result));

        const aiMsg: AiChatMessage = {
          id: `ai_${Date.now()}`,
          sender: "ai",
          text: `Executed ${result.toolCall.name}`,
          timestamp: Date.now(),
          result,
        };
        dispatch(addChatMessage(aiMsg));
      } catch (err) {
        const errMsg = String(err);
        dispatch(setError(errMsg));

        const aiMsg: AiChatMessage = {
          id: `ai_${Date.now()}`,
          sender: "ai",
          text: "Error executing request",
          timestamp: Date.now(),
          error: errMsg,
        };
        dispatch(addChatMessage(aiMsg));
      }
    },
    [dispatch, activeDraft, globalEnvs],
  );

  const applyToCurrentTab = useCallback(
    (req: AiGeneratedRequest) => {
      if (!activeTabId) return;

      const changes: Partial<RequestDraft> = {
        name: req.name,
        method: req.method,
        url: req.url,
        headers: req.headers.map((h) => ({
          id: h.id,
          key: h.key,
          value: h.value,
          enabled: h.enabled,
        })),
        params: req.params.map((p) => ({
          id: p.id,
          key: p.key,
          value: p.value,
          enabled: p.enabled,
        })),
        bodyType: req.bodyType,
        body: req.body,
      };

      dispatch(updateDraft({ tabId: activeTabId, changes }));
      dispatch(
        updateTab({
          id: activeTabId,
          changes: {
            title: req.name || `${req.method} ${req.url}`,
            unsaved: true,
          },
        }),
      );
      dispatch(setAiOpen(false));
    },
    [dispatch, activeTabId],
  );

  const applyToNewTab = useCallback(
    (req: AiGeneratedRequest) => {
      const draft = createEmptyRequest();
      draft.name = req.name || "Generated Request";
      draft.method = req.method;
      draft.url = req.url;
      draft.headers = req.headers.map((h) => ({
        id: h.id,
        key: h.key,
        value: h.value,
        enabled: h.enabled,
      }));
      draft.params = req.params.map((p) => ({
        id: p.id,
        key: p.key,
        value: p.value,
        enabled: p.enabled,
      }));
      draft.bodyType = req.bodyType;
      draft.body = req.body;

      const tabTitle = req.name || `${req.method} ${req.url}`;
      void dispatch(
        openRequestTab({
          request: draft,
          title: tabTitle,
          forceNew: true,
        }),
      );
      dispatch(setAiOpen(false));
    },
    [dispatch],
  );

  const applySetVariable = useCallback(
    async (key: string, value: string) => {
      const activeEnv = envContext.globalEnv;
      if (!activeEnv) return;

      const existingVars = [...activeEnv.variables];
      const foundIdx = existingVars.findIndex((v) => v.key === key);

      if (foundIdx >= 0) {
        existingVars[foundIdx] = {
          ...existingVars[foundIdx],
          value,
          enabled: true,
        };
      } else {
        existingVars.push({
          id: `var_${Date.now()}`,
          key,
          value,
          enabled: true,
        });
      }

      await dispatch(
        updateEnvironment({
          id: activeEnv.id,
          variables: existingVars,
        }),
      );
      dispatch(setAiOpen(false));
    },
    [dispatch, envContext],
  );

  const applySearch = useCallback(
    (query: string) => {
      dispatch(setSearchQuery(query));
      dispatch(setAiOpen(false));
    },
    [dispatch],
  );

  return {
    isOpen: ai.isOpen,
    isSidebarOpen: ai.isSidebarOpen,
    messages: ai.messages,
    status: ai.status,
    loading: ai.loading,
    prompt: ai.prompt,
    lastResult: ai.lastResult,
    error: ai.error,
    history: ai.history,
    openCopilot: (initialPrompt?: string) => {
      if (initialPrompt !== undefined) {
        dispatch(setPrompt(initialPrompt));
      }
      dispatch(setAiOpen(true));
      void checkStatus();
    },
    closeCopilot: () => dispatch(setAiOpen(false)),
    toggleCopilot: () => {
      dispatch(toggleAiOpen());
      void checkStatus();
    },
    openSidebar: () => {
      dispatch(setAiSidebarOpen(true));
      void checkStatus();
    },
    closeSidebar: () => dispatch(setAiSidebarOpen(false)),
    toggleSidebar: () => {
      dispatch(toggleAiSidebarOpen());
      void checkStatus();
    },
    clearChatMessages: () => dispatch(clearChatMessages()),
    setPrompt: (p: string) => dispatch(setPrompt(p)),
    submitPrompt,
    applyToCurrentTab,
    applyToNewTab,
    applySetVariable,
    applySearch,
    clearResult: () => dispatch(clearResult()),
    checkStatus,
  };
}
