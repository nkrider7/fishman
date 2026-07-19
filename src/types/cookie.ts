export type CookieSameSite = "Strict" | "Lax" | "None";

export interface StoredCookie {
  id: string;
  domain: string;
  name: string;
  value: string;
  path: string;
  /** ISO-8601 datetime, or null for session cookies. */
  expires: string | null;
  secure: boolean;
  httpOnly: boolean;
  sameSite: CookieSameSite | null;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
}

export interface CookieInput {
  id?: string;
  domain: string;
  name: string;
  value: string;
  path?: string;
  expires?: string | null;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: CookieSameSite | null;
  workspaceId?: string;
}

export interface CookieChange {
  name: string;
  value: string;
}
