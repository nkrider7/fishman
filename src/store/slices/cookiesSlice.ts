import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CookieInput, StoredCookie } from "@/types/cookie";
import * as cookieService from "@/services/cookieService";
import {
  parsedToCookieInput,
  parseSetCookieHeader,
} from "@/utils/cookies";

interface CookiesState {
  cookies: StoredCookie[];
  loaded: boolean;
  loading: boolean;
}

const initialState: CookiesState = {
  cookies: [],
  loaded: false,
  loading: false,
};

export const loadCookies = createAsyncThunk(
  "cookies/load",
  async (_arg, { getState }) => {
    const state = getState() as import("../index").RootState;
    return cookieService.listCookies(state.workspaces.activeWorkspaceId);
  },
);

export const upsertCookie = createAsyncThunk(
  "cookies/upsert",
  async (input: CookieInput, { getState }) => {
    const state = getState() as import("../index").RootState;
    return cookieService.upsertCookie(
      input,
      state.workspaces.activeWorkspaceId,
    );
  },
);

export const deleteCookie = createAsyncThunk(
  "cookies/delete",
  async (id: string) => {
    await cookieService.deleteCookie(id);
    return id;
  },
);

export const deleteCookiesByDomain = createAsyncThunk(
  "cookies/deleteByDomain",
  async (domain: string, { getState }) => {
    const state = getState() as import("../index").RootState;
    await cookieService.deleteCookiesByDomain(
      domain,
      state.workspaces.activeWorkspaceId,
    );
    return domain;
  },
);

export const clearAllCookies = createAsyncThunk(
  "cookies/clearAll",
  async (_arg, { getState }) => {
    const state = getState() as import("../index").RootState;
    await cookieService.clearAllCookies(state.workspaces.activeWorkspaceId);
  },
);

export const ingestSetCookies = createAsyncThunk(
  "cookies/ingestSetCookies",
  async (
    {
      setCookies,
    }: {
      setCookies: Array<{ url: string; value: string } | string>;
    },
    { getState },
  ) => {
    if (setCookies.length === 0) return [] as StoredCookie[];

    const rootState = getState() as import("../index").RootState;
    const workspaceId = rootState.workspaces.activeWorkspaceId;
    const state = getState() as { cookies: CookiesState };
    let existing = [...state.cookies.cookies];
    let savedCount = 0;

    for (const entry of setCookies) {
      const header = typeof entry === "string" ? entry : entry?.value;
      const requestUrl =
        typeof entry === "string" ? "" : entry?.url || "";
      if (!header || typeof header !== "string") {
        console.warn("[fishman] skip Set-Cookie: missing value", entry);
        continue;
      }

      const parsed = parseSetCookieHeader(
        header,
        requestUrl || "https://localhost/",
      );
      if (!parsed?.domain || !parsed.name) {
        console.warn("[fishman] skip Set-Cookie: parse failed", header.slice(0, 80));
        continue;
      }

      // Max-Age=0 / past Expires → delete matching cookie
      if (parsed.expires && Date.parse(parsed.expires) <= Date.now()) {
        const match = existing.find(
          (c) =>
            c.domain === parsed.domain &&
            c.name === parsed.name &&
            c.path === (parsed.path ?? "/"),
        );
        if (match) {
          await cookieService.deleteCookie(match.id);
          existing = existing.filter((c) => c.id !== match.id);
        }
        continue;
      }

      const prior = existing.find(
        (c) =>
          c.domain === parsed.domain &&
          c.name === parsed.name &&
          c.path === (parsed.path ?? "/"),
      );
      const saved = await cookieService.upsertCookie(
        parsedToCookieInput(parsed, prior),
        workspaceId,
      );
      savedCount += 1;
      const idx = existing.findIndex((c) => c.id === saved.id);
      if (idx >= 0) existing[idx] = saved;
      else existing.push(saved);
    }

    const listed = await cookieService.listCookies(workspaceId);
    console.info(
      `[fishman] ingested ${savedCount}/${setCookies.length} Set-Cookie header(s); jar size=${listed.length}`,
    );
    return listed;
  },
);

const cookiesSlice = createSlice({
  name: "cookies",
  initialState,
  reducers: {
    cookiesReplaced: (state, action: PayloadAction<StoredCookie[]>) => {
      state.cookies = action.payload;
      state.loaded = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCookies.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadCookies.fulfilled, (state, action) => {
        state.cookies = action.payload;
        state.loaded = true;
        state.loading = false;
      })
      .addCase(loadCookies.rejected, (state) => {
        state.loading = false;
      })
      .addCase(upsertCookie.fulfilled, (state, action) => {
        const idx = state.cookies.findIndex((c) => c.id === action.payload.id);
        if (idx >= 0) state.cookies[idx] = action.payload;
        else state.cookies.push(action.payload);
      })
      .addCase(deleteCookie.fulfilled, (state, action) => {
        state.cookies = state.cookies.filter((c) => c.id !== action.payload);
      })
      .addCase(deleteCookiesByDomain.fulfilled, (state, action) => {
        state.cookies = state.cookies.filter((c) => c.domain !== action.payload);
      })
      .addCase(clearAllCookies.fulfilled, (state) => {
        state.cookies = [];
      })
      .addCase(ingestSetCookies.fulfilled, (state, action) => {
        state.cookies = action.payload;
        state.loaded = true;
      });
  },
});

export const { cookiesReplaced } = cookiesSlice.actions;
export default cookiesSlice.reducer;
