import type { CodegenLanguage } from "./types";

export const CODEGEN_LANGUAGES: CodegenLanguage[] = [
  {
    id: "shell",
    label: "Shell",
    monacoLanguage: "shell",
    clients: [
      { id: "curl", label: "cURL" },
      { id: "httpie", label: "HTTPie" },
      { id: "wget", label: "Wget" },
    ],
  },
  {
    id: "javascript",
    label: "JavaScript",
    monacoLanguage: "javascript",
    clients: [
      { id: "fetch", label: "fetch" },
      { id: "axios", label: "axios" },
      { id: "xhr", label: "XHR" },
      { id: "jquery", label: "jQuery" },
    ],
  },
  {
    id: "nodejs",
    label: "Node.js",
    monacoLanguage: "javascript",
    clients: [
      { id: "fetch", label: "fetch" },
      { id: "axios", label: "axios" },
      { id: "native-http", label: "http" },
    ],
  },
  {
    id: "python",
    label: "Python",
    monacoLanguage: "python",
    clients: [
      { id: "requests", label: "requests" },
      { id: "http-client", label: "http.client" },
    ],
  },
  {
    id: "go",
    label: "Go",
    monacoLanguage: "go",
    clients: [{ id: "net-http", label: "net/http" }],
  },
  {
    id: "java",
    label: "Java",
    monacoLanguage: "java",
    clients: [{ id: "okhttp", label: "OkHttp" }],
  },
  {
    id: "csharp",
    label: "C#",
    monacoLanguage: "csharp",
    clients: [{ id: "httpclient", label: "HttpClient" }],
  },
  {
    id: "php",
    label: "PHP",
    monacoLanguage: "php",
    clients: [{ id: "curl", label: "cURL" }],
  },
  {
    id: "ruby",
    label: "Ruby",
    monacoLanguage: "ruby",
    clients: [{ id: "net-http", label: "net/http" }],
  },
  {
    id: "rust",
    label: "Rust",
    monacoLanguage: "rust",
    clients: [{ id: "reqwest", label: "reqwest" }],
  },
];

export function getLanguage(languageId: string): CodegenLanguage | undefined {
  return CODEGEN_LANGUAGES.find((l) => l.id === languageId);
}

export function getDefaultClientId(languageId: string): string {
  return getLanguage(languageId)?.clients[0]?.id ?? "curl";
}

export const DEFAULT_LANGUAGE_ID = "shell";
export const DEFAULT_CLIENT_ID = "curl";

const STORAGE_KEY = "fishman.codegen.prefs";

export interface CodegenPrefs {
  languageId: string;
  clientId: string;
  interpolateVariables: boolean;
}

export function loadCodegenPrefs(): CodegenPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CodegenPrefs>;
      const languageId = parsed.languageId ?? DEFAULT_LANGUAGE_ID;
      const lang = getLanguage(languageId);
      const clientId =
        lang?.clients.some((c) => c.id === parsed.clientId)
          ? (parsed.clientId as string)
          : getDefaultClientId(languageId);
      return {
        languageId,
        clientId,
        interpolateVariables: parsed.interpolateVariables ?? true,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    languageId: DEFAULT_LANGUAGE_ID,
    clientId: DEFAULT_CLIENT_ID,
    interpolateVariables: true,
  };
}

export function saveCodegenPrefs(prefs: CodegenPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
