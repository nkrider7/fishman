/**
 * OpenCollection-compatible docs generation for Fishman.
 *
 * Reference architecture (KitBag-documentation.html / Bruno Generate Docs):
 * - Standalone HTML shell with `#opencollection-container`
 * - CDN viewer CSS/JS (Bruno docs CDN as requested)
 * - Collection embedded as an OpenCollection YAML string
 * - Viewer boots with `new OpenCollection({ target, opencollection, theme })`
 *   (with OpenCollectionPlayground fallbacks)
 *
 * Fishman customizations:
 * - No Try / Run playground (CSS + DOM scrub)
 * - Watermark branded "Fishman"
 * - Secrets redacted by default
 */

export const DOCS_CDN_CSS = "https://cdn.usebruno.com/docs/docs.css";
export const DOCS_CDN_JS = "https://cdn.usebruno.com/docs/docs.js";

export interface DocsGenerateOptions {
  /** Always false in v1 — secrets never written to docs HTML. */
  includeSecrets?: boolean;
  theme?: "light" | "dark";
}

export interface OpenCollectionHttpParam {
  name: string;
  value: string;
  type: "query" | "path" | "header";
  disabled?: boolean;
}

export interface OpenCollectionHttpBody {
  type: string;
  data?: string;
}

export interface OpenCollectionHttp {
  method: string;
  url: string;
  params?: OpenCollectionHttpParam[];
  headers?: Array<{ name: string; value: string; disabled?: boolean }>;
  body?: OpenCollectionHttpBody;
  auth?: string | Record<string, unknown>;
}

export interface OpenCollectionItem {
  info: {
    name: string;
    type: "folder" | "http";
    seq: number;
  };
  docs?: string;
  http?: OpenCollectionHttp;
  request?: { auth?: string };
  runtime?: {
    scripts?: {
      preRequest?: string;
      postResponse?: string;
      tests?: string;
    };
  };
  items?: OpenCollectionItem[];
}

export interface OpenCollectionDocument {
  opencollection: string;
  info: {
    name: string;
    description?: string;
  };
  config?: {
    environments?: Array<{ name: string; variables: unknown[] }>;
  };
  items: OpenCollectionItem[];
  extensions?: {
    fishman?: {
      exportedAt: string;
      exportedUsing: string;
    };
  };
}
