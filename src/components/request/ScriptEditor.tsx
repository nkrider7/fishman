import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import fishmanTypes from "@/script-engine/definitions/fishman.d.ts?raw";
import { useMonacoVariableCompletions } from "@/hooks/useMonacoVariableCompletions";

const FISHMAN_LIB_URI = "ts:fishman-globals.d.ts";

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: "vs-dark" | "light";
  readOnly?: boolean;
  onSave?: () => void;
  /** Scopes env / folder variable suggestions. */
  collectionId?: string | null;
  /** Unique model path so multiple script tabs don't share one Monaco model. */
  modelPath?: string;
}

function registerFishmanScriptTypes(monaco: Parameters<OnMount>[1]) {
  const js = monaco.languages.typescript.javascriptDefaults;
  const ts = monaco.languages.typescript.typescriptDefaults;

  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: true,
    noEmit: true,
    lib: ["es2020"],
  };

  js.setCompilerOptions(compilerOptions);
  ts.setCompilerOptions(compilerOptions);

  js.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [
      // Top-level await is wrapped by the sandbox; ignore in editor.
      1375,
      // Prefer ambient globals over "cannot find name" noise for dynamic APIs
      1108,
    ],
  });
  ts.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  // Re-register so hot reload / remount picks up definition changes.
  js.addExtraLib(fishmanTypes, FISHMAN_LIB_URI);
  ts.addExtraLib(fishmanTypes, FISHMAN_LIB_URI);
}

export function ScriptEditor({
  value,
  onChange,
  theme,
  readOnly = false,
  onSave,
  collectionId,
  modelPath = "fishman-script.js",
}: ScriptEditorProps) {
  const typesRegistered = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(320);
  const { enhanceOnMount } = useMonacoVariableCompletions(collectionId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const nextHeight = container.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setEditorHeight(Math.floor(nextHeight));
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleMount: OnMount = enhanceOnMount(
    ["javascript", "typescript"],
    (editor, monaco) => {
      registerFishmanScriptTypes(monaco);
      typesRegistered.current = true;

      if (onSave) {
        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => onSave(),
        );
      }

      // Nudge suggestions when typing `fm.` / `bru.` etc.
      editor.onDidChangeModelContent(() => {
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!model || !position) return;
        const line = model.getLineContent(position.lineNumber);
        const before = line.slice(0, position.column - 1);
        if (/\b(fm|fishman|pm|bru|res)\.$/.test(before)) {
          void editor.trigger("fishman", "editor.action.triggerSuggest", {});
        }
      });

      requestAnimationFrame(() => editor.layout());
    },
  );

  return (
    <div ref={containerRef} className="h-full min-h-[280px] w-full">
      <Editor
        height={editorHeight}
        language="javascript"
        path={modelPath}
        theme={theme}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 20,
          padding: { top: 8, bottom: 8 },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          readOnly,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnCommitCharacter: true,
          snippetSuggestions: "inline",
          tabCompletion: "on",
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
          suggest: {
            showWords: false,
            preview: true,
            snippetsPreventQuickSuggestions: false,
          },
          parameterHints: { enabled: true },
          folding: true,
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </div>
  );
}
