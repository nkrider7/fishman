import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScriptEditor } from "@/components/request/ScriptEditor";
import type { RequestScripts } from "@/types/request";
import { SCRIPT_TEMPLATES } from "@/script-engine/utils/templates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ScriptsPanelProps {
  scripts: RequestScripts;
  onChange: (scripts: RequestScripts) => void;
  editorTheme: "vs-dark" | "light";
  onSave?: () => void;
  collectionId?: string | null;
}

type ScriptTab = keyof RequestScripts;

const SCRIPT_TABS: { value: ScriptTab; label: string }[] = [
  { value: "preRequest", label: "Pre Request" },
  { value: "postResponse", label: "Post Response" },
  { value: "tests", label: "Tests" },
];

export function ScriptsPanel({
  scripts,
  onChange,
  editorTheme,
  onSave,
  collectionId,
}: ScriptsPanelProps) {
  const [activeTab, setActiveTab] = useState<ScriptTab>("preRequest");

  const update = (key: ScriptTab, value: string) => {
    onChange({ ...scripts, [key]: value });
  };

  const applyTemplate = (templateId: string) => {
    const template = SCRIPT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const target =
      template.tab === "any" ? activeTab : (template.tab as ScriptTab);
    update(target, template.code);
    setActiveTab(target);
  };

  const templatesForTab = SCRIPT_TEMPLATES.filter(
    (t) => t.tab === activeTab || t.tab === "any",
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ScriptTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-2">
          <TabsList>
            {SCRIPT_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {scripts[tab.value]?.trim() ? (
                  <span className="ml-1 text-amber-500">*</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <Select onValueChange={applyTemplate}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="Insert template" />
            </SelectTrigger>
            <SelectContent>
              {templatesForTab.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {SCRIPT_TABS.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border data-[state=inactive]:hidden"
          >
            <ScriptEditor
              value={scripts[tab.value]}
              onChange={(code) => update(tab.value, code)}
              theme={editorTheme}
              onSave={onSave}
              collectionId={collectionId}
              modelPath={`fishman-${tab.value}.js`}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
