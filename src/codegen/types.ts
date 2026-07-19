import type { BodyType, RequestDraft } from "@/types/request";

export interface GenerateCodeOptions {
  languageId: string;
  clientId: string;
  interpolateVariables: boolean;
}

export interface CodegenClient {
  id: string;
  label: string;
}

export interface CodegenLanguage {
  id: string;
  label: string;
  clients: CodegenClient[];
  /** Monaco language id for syntax highlighting */
  monacoLanguage: string;
}

export interface EffectiveHeader {
  key: string;
  value: string;
}

export interface EffectiveFormField {
  key: string;
  type: "text" | "file";
  value?: string;
  filePath?: string;
}

/** Normalized request used by all generators (mirrors send preparation). */
export interface EffectiveRequest {
  method: string;
  url: string;
  headers: EffectiveHeader[];
  body?: string;
  bodyType: BodyType;
  formData?: EffectiveFormField[];
}

export type CodegenGenerator = (req: EffectiveRequest) => string;

export interface GenerateCodeInput {
  draft: RequestDraft;
  variables: Record<string, string>;
  options: GenerateCodeOptions;
}
