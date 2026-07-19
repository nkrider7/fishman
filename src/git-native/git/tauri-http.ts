/**
 * isomorphic-git HTTP client backed by Tauri/reqwest.
 *
 * `isomorphic-git/http/web` uses browser fetch, which fails in Tauri WebKit
 * with opaque errors like "Load failed" (CORS / network policy). Desktop Git
 * traffic must go through Rust.
 */
import { invoke } from "@tauri-apps/api/core";

interface GitHttpRequestPayload {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body_base64?: string | null;
  timeout_ms?: number;
}

interface GitHttpResponsePayload {
  url: string;
  method: string;
  status_code: number;
  status_message: string;
  headers: Record<string, string>;
  body_base64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function collectBody(
  body: AsyncIterableIterator<Uint8Array> | Uint8Array | undefined,
): Promise<Uint8Array | undefined> {
  if (!body) return undefined;
  if (body instanceof Uint8Array) return body;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function fromValue(value: Uint8Array): AsyncIterableIterator<Uint8Array> {
  let done = false;
  return {
    next() {
      if (done) return Promise.resolve({ done: true, value: undefined as never });
      done = true;
      return Promise.resolve({ done: false, value });
    },
    return() {
      done = true;
      return Promise.resolve({ done: true, value: undefined as never });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export const tauriGitHttp = {
  async request({
    url,
    method,
    headers,
    body,
  }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: AsyncIterableIterator<Uint8Array> | Uint8Array;
  }) {
    const collected = await collectBody(body);
    const payload: GitHttpRequestPayload = {
      url,
      method: method ?? "GET",
      headers: headers ?? {},
      body_base64: collected ? bytesToBase64(collected) : null,
      timeout_ms: 180_000,
    };

    const res = await invoke<GitHttpResponsePayload>("git_http_request", {
      payload,
    });

    const bytes = base64ToBytes(res.body_base64);
    return {
      url: res.url,
      method: res.method,
      statusCode: res.status_code,
      statusMessage: res.status_message,
      headers: res.headers,
      body: fromValue(bytes),
    };
  },
};
