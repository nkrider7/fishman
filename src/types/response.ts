export interface ResponseTiming {
  total_ms: number;
  dns_ms: number | null;
  connect_ms: number | null;
  ttfb_ms: number | null;
}

export interface ApiResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  size_bytes: number;
  duration_ms: number;
  timing: ResponseTiming;
  error?: string | null;
}

export interface FormDataPart {
  key: string;
  type: "text" | "file";
  value?: string;
  file_path?: string;
  enabled: boolean;
}

export interface HttpRequestPayload {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body?: string;
  body_type: string;
  form_data?: FormDataPart[];
  timeout_ms?: number;
  ignore_ssl: boolean;
}
