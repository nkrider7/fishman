import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodegenToolbar } from "@/components/codegen/CodegenToolbar";
import { CodeSnippetViewer } from "@/components/codegen/CodeSnippetViewer";
import {
  generateCode,
  getDefaultClientId,
  getLanguage,
  loadCodegenPrefs,
  saveCodegenPrefs,
} from "@/codegen";
import { useAppSelector } from "@/hooks/redux";
import { selectResolvedVariables } from "@/store/slices/environmentSlice";
import type { RequestDraft } from "@/types/request";

interface GenerateCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RequestDraft;
}

export function GenerateCodeDialog({
  open,
  onOpenChange,
  draft,
}: GenerateCodeDialogProps) {
  const prefs = useMemo(() => loadCodegenPrefs(), []);
  const [languageId, setLanguageId] = useState(prefs.languageId);
  const [clientId, setClientId] = useState(prefs.clientId);
  const [interpolateVariables, setInterpolateVariables] = useState(
    prefs.interpolateVariables,
  );

  const theme = useAppSelector((s) => s.settings.theme);
  const variables = useAppSelector((s) =>
    selectResolvedVariables(s, draft.collectionId),
  );

  const editorTheme =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "vs-dark"
      : "light";

  const monacoLanguage =
    getLanguage(languageId)?.monacoLanguage ?? "plaintext";

  const snippet = useMemo(
    () =>
      generateCode(draft, variables, {
        languageId,
        clientId,
        interpolateVariables,
      }),
    [draft, variables, languageId, clientId, interpolateVariables],
  );

  useEffect(() => {
    if (!open) return;
    saveCodegenPrefs({ languageId, clientId, interpolateVariables });
  }, [open, languageId, clientId, interpolateVariables]);

  const handleLanguageChange = (next: string) => {
    setLanguageId(next);
    const lang = getLanguage(next);
    if (!lang?.clients.some((c) => c.id === clientId)) {
      setClientId(getDefaultClientId(next));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(80vh,820px)] w-full max-w-4xl flex-col gap-4 overflow-hidden p-6">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Generate Code</DialogTitle>
          <DialogDescription className="sr-only">
            Generate a code snippet for the current request in your preferred
            language and client library.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0">
          <CodegenToolbar
            languageId={languageId}
            clientId={clientId}
            interpolateVariables={interpolateVariables}
            onLanguageChange={handleLanguageChange}
            onClientChange={setClientId}
            onInterpolateChange={setInterpolateVariables}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <CodeSnippetViewer
            code={snippet}
            language={monacoLanguage}
            theme={editorTheme}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
