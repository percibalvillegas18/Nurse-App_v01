/**
 * In-memory session token store.
 *
 * Access/refresh tokens and the session id are intentionally kept OUT of
 * `localStorage` (and `sessionStorage`): anything readable by JavaScript is
 * exfiltratable by an XSS, and on shared clinical workstations a persisted
 * token is a standing account takeover. Holding the session in module memory
 * means it survives SPA navigations but is dropped the moment the tab closes
 * (or the page is reloaded) — the user simply signs in again.
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let sessionId: string | null = null;

export const tokenStore = {
  setSession(tokens: SessionTokens): void {
    accessToken = tokens.accessToken ?? null;
    refreshToken = tokens.refreshToken ?? null;
    sessionId = tokens.sessionId ?? null;
  },

  setAccessToken(token: string): void {
    accessToken = token;
  },

  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    return refreshToken;
  },

  getSessionId(): string | null {
    return sessionId;
  },

  /** True when a full session (access token) is held in memory. */
  hasSession(): boolean {
    return !!accessToken;
  },

  clear(): void {
    accessToken = null;
    refreshToken = null;
    sessionId = null;
  },
};
