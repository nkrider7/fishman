import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setApiTestingOpen } from "@/store/slices/uiSlice";
import {
  backToApiTestingConfig,
  patchApiTestingConfig,
  replaceApiTestingConfig,
  setApiTestingError,
  setApiTestingResultsTab,
} from "@/store/slices/apiTestingSlice";
import {
  startApiTest,
  stopApiTest,
} from "@/store/thunks/apiTestingThunks";
import { configFromActiveRequest } from "@/api-testing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigView } from "./ConfigView";
import { ResultsView } from "./ResultsView";

export function ApiTestingDialog() {
  const open = useAppSelector((s) => s.ui.apiTestingOpen);
  if (!open) return null;
  return <ApiTestingDialogOpen />;
}

function ApiTestingDialogOpen() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.apiTesting.view);
  const config = useAppSelector((s) => s.apiTesting.config);
  const run = useAppSelector((s) => s.apiTesting.run);
  const running = useAppSelector((s) => s.apiTesting.running);
  const resultsTab = useAppSelector((s) => s.apiTesting.resultsTab);
  const lastError = useAppSelector((s) => s.apiTesting.lastError);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const draft = useAppSelector((s) =>
    activeTabId ? s.request.drafts[activeTabId] : null,
  );

  const handleOpenChange = (next: boolean) => {
    if (!next && running) {
      const ok = window.confirm(
        "A test is still running. Stop it and close?",
      );
      if (!ok) return;
      void dispatch(stopApiTest());
    }
    dispatch(setApiTestingOpen(next));
  };

  const useActiveRequest = () => {
    if (!draft) {
      dispatch(
        setApiTestingError(
          "No active request tab — open a request first, then try again.",
        ),
      );
      return;
    }
    dispatch(setApiTestingError(null));
    dispatch(
      patchApiTestingConfig(
        configFromActiveRequest({
          method: draft.method,
          url: draft.url,
          headers: draft.headers,
          params: draft.params,
          bodyType: draft.bodyType,
          body: draft.body,
          authType: draft.auth.type,
          auth: { ...draft.auth },
        }),
      ),
    );
  };

  const goBack = () => {
    if (running) {
      void dispatch(stopApiTest());
      return;
    }
    dispatch(backToApiTestingConfig());
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[min(90vh,820px)] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0"
        // Select/Tooltip portals render outside the dialog node — without this,
        // picking a dropdown option dismisses the whole modal.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (running) {
            e.preventDefault();
            const ok = window.confirm(
              "A test is still running. Stop it and close?",
            );
            if (ok) {
              void dispatch(stopApiTest());
              dispatch(setApiTestingOpen(false));
            }
            return;
          }
          // Allow Escape to close when idle
        }}
      >
        <TooltipProvider delayDuration={180} skipDelayDuration={0}>
          <DialogHeader className="shrink-0 border-b border-border px-5 py-3 text-left">
            <DialogTitle className="text-base">API Testing</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Pick a colored preset, tweak settings, then run — hover the{" "}
              <span className="font-medium text-foreground">i</span> icons for
              help.
            </DialogDescription>
          </DialogHeader>

          {view === "config" ? (
            <ConfigView
              config={config}
              onChange={(patch) => {
                dispatch(setApiTestingError(null));
                dispatch(patchApiTestingConfig(patch));
              }}
              onReplace={(next) => {
                dispatch(setApiTestingError(null));
                dispatch(replaceApiTestingConfig(next));
              }}
              onUseActiveRequest={useActiveRequest}
              onRun={() => void dispatch(startApiTest())}
              disabled={running}
              error={lastError}
              hasActiveRequest={Boolean(draft)}
            />
          ) : (
            <ResultsView
              config={config}
              run={run}
              resultsTab={resultsTab}
              onResultsTab={(tab) => dispatch(setApiTestingResultsTab(tab))}
              onStop={() => void dispatch(stopApiTest())}
              onBack={goBack}
              onRunAgain={() => void dispatch(startApiTest())}
              running={running}
            />
          )}
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
