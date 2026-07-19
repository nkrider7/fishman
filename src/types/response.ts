import type { QueryHostCapability } from "@/http-methods";

export interface ResponseTiming {
  total_ms: number;
  dns_ms: number | null;
  connect_ms: number | null;
  ttfb_ms: number | null;
}

export interface SetCookieCapture {
  url: string;
  value: string;
}

export interface ApiResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  /** Set-Cookie headers collected across the redirect chain. */
  set_cookies?: SetCookieCapture[];
  /** Final URL after redirects. */
  final_url?: string | null;
  body: string;
  size_bytes: number;
  duration_ms: number;
  timing: ResponseTiming;
  error?: string | null;
  /** Method actually sent on the wire (from the HTTP engine). */
  request_method?: string | null;
  /** Cached QUERY capability for this host (client-side, RFC 10008). */
  query_support?: QueryHostCapability | null;
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
