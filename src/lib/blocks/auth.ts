import { blocksClient } from "./client";
import { blocksConfig } from "./config";
import { isJwtExpired, jwtExpiryMs } from "./jwt";

// Refresh a bearer access token 60s before it actually expires, so a
// logged-in idle tab renews silently instead of waiting for the next API
// call to hit a 401. No-ops in the default cookie flow (nothing to decode).
const PROACTIVE_REFRESH_SKEW_MS = 60_000;
const MIN_PROACTIVE_REFRESH_DELAY_MS = 5_000;

// IAM's hosted IdP flow sets the session as a Secure, httpOnly cookie by
// default -- this app never sees that token and must not try to. Bearer
// tokens below are only populated when a tenant's OIDC config explicitly
// opts into returning tokens in the response body instead of a cookie; in
// the default cookie flow every function below simply no-ops around them.
const TOKEN_KEY = "blocks-app:access-token";
const REFRESH_TOKEN_KEY = "blocks-app:refresh-token";
const RETURN_KEY = "blocks-app:oidc-return-to";

export type CallbackResult = { ok: true; returnTo: string } | { ok: false; message: string };

let cachedAccessToken: string | undefined;
let cachedRefreshToken: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | undefined;

function clearProactiveRefresh(): void {
  if (proactiveRefreshTimer !== undefined) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = undefined;
  }
}

function scheduleProactiveRefresh(accessToken: string): void {
  clearProactiveRefresh();
  const expiryMs = jwtExpiryMs(accessToken);
  if (!expiryMs) return;

  const delay = Math.max(expiryMs - Date.now() - PROACTIVE_REFRESH_SKEW_MS, MIN_PROACTIVE_REFRESH_DELAY_MS);
  proactiveRefreshTimer = setTimeout(() => {
    // Only ever scheduled from persistTokens, which only runs when a real
    // access token was cached -- an explicit-token tenant, so there is
    // always a refresh token to spend here.
    const refreshToken = getRefreshToken();
    if (refreshToken) void dedupedRefresh(refreshToken);
  }, delay);
}

// AuthProvider subscribes to this to learn the session died out-of-band (a
// refresh came back invalid_grant) so it can flip status to unauthenticated
// and let RequireAuth redirect to /login -- this module has no router access
// of its own to do that navigation directly.
const sessionExpiredListeners = new Set<() => void>();

export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

function getAccessToken(): string | undefined {
  if (cachedAccessToken && !isJwtExpired(cachedAccessToken)) return cachedAccessToken;

  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored && !isJwtExpired(stored)) {
    cachedAccessToken = stored;
    return stored;
  }

  return undefined;
}

// Never written to storage by this app, deliberately: a refresh token is
// long-lived, and anything readable from JS is readable by an XSS payload.
// The access token is short-lived, so that one is persisted to keep a
// reload from bouncing the user, and IAM's httpOnly session cookie
// re-establishes the session once it expires.
//
// The stored value is still *read* as a fallback, for a host that can
// re-establish a session but cannot reach this module's variables -- a
// build running inside blocks-studio's preview is the case that matters:
// the session lives in an httpOnly cookie the page cannot see, and there
// is no reload-surviving cookie flow to fall back on, so the host seeds a
// non-secret marker here to say "ask for a refresh". Reading it is safe
// precisely because this app never puts a real token there.
function getRefreshToken(): string | undefined {
  if (cachedRefreshToken) return cachedRefreshToken;

  const seeded = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  return seeded ?? undefined;
}

function persistTokens(accessToken: string, refreshToken?: string): void {
  cachedAccessToken = accessToken;
  sessionStorage.setItem(TOKEN_KEY, accessToken);

  if (refreshToken) cachedRefreshToken = refreshToken;
  scheduleProactiveRefresh(accessToken);
}

function clearLocalTokens(): void {
  cachedAccessToken = undefined;
  cachedRefreshToken = undefined;
  clearProactiveRefresh();
  sessionStorage.removeItem(TOKEN_KEY);
  // This app never writes that key, but a host may have seeded it (see
  // getRefreshToken) and an earlier build of this app may have persisted a
  // real token there -- either way it must not survive a sign-out.
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Passed to createBlocksClient as the `accessToken` resolver -- called
// before EVERY outgoing request, including auth endpoints like
// `auth.userInfo()`/`auth.isAuthenticated()` themselves. That's exactly why
// this must stay a pure, no-network-call no-op when there's no refresh
// token cached: in the default cookie flow that's every single call, and
// calling back into any Blocks API from here would resolve its own bearer
// token through this same function -- an infinite loop that never sends a
// real request and eventually crashes the tab. (Learned this the hard way:
// an earlier version called `isAuthenticated()` from here "to reconfirm the
// session," which recurses through exactly that path.)
export async function getValidAccessToken(): Promise<string | undefined> {
  const current = getAccessToken();
  if (current) return current;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return undefined; // cookie flow: nothing to attach, the cookie does the work
  return dedupedRefresh(refreshToken);
}

// Passed to createBlocksClient as `onUnauthorized` -- called only once a
// request has already come back 401, so unlike getValidAccessToken this is
// allowed to treat "no refresh token" as a real, final answer instead of a
// quiet no-op: the server just said this exact session is invalid, cookie
// included, so there is nothing left to verify. (Deliberately does NOT call
// any Blocks API to double-check -- see getValidAccessToken's comment for
// why that recurses.)
export async function handleUnauthorized(): Promise<string | undefined> {
  const refreshToken = getRefreshToken();
  if (refreshToken) return dedupedRefresh(refreshToken);

  clearLocalTokens();
  notifySessionExpired();
  return undefined;
}

// Shared by both entry points above so a burst of concurrent 401s (and any
// proactive caller racing them) spend one refresh-token grant instead of one
// each.
function dedupedRefresh(refreshToken: string): Promise<string | undefined> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(refreshToken).finally(() => {
      refreshInFlight = undefined;
    });
  }
  return refreshInFlight;
}

async function refreshAccessToken(refreshToken: string): Promise<string | undefined> {
  let response: Awaited<ReturnType<typeof blocksClient.auth.oidc.refreshToken>>;
  try {
    response = await blocksClient.auth.oidc.refreshToken({ refreshToken });
  } catch {
    // A network/transport failure here says nothing about whether the
    // refresh token itself is still valid -- keep it cached so the next
    // attempt can still use it, instead of forcing a fresh sign-in over a
    // transient blip (e.g. the dev server restarting mid-session).
    return undefined;
  }

  const accessToken = response.access_token ?? response.accessToken;
  if (!accessToken) {
    // IAM answered but explicitly rejected the grant (e.g. invalid_grant --
    // the refresh token expired or was already rotated away) -- now it
    // really is dead, so this is a full sign-out, not just a cache clear.
    // Clear local state before the logout call so its own accessToken
    // lookup finds nothing to refresh and doesn't loop back into us.
    clearLocalTokens();
    await blocksClient.auth.logout({ refreshToken }).catch(() => undefined);
    notifySessionExpired();
    return undefined;
  }

  // The identity provider may not rotate the refresh token on every call --
  // keep the previous one instead of overwriting a working token with undefined.
  const nextRefreshToken = response.refresh_token ?? response.refreshToken ?? refreshToken;
  persistTokens(accessToken, nextRefreshToken);
  return accessToken;
}

// The session's source of truth is IAM, not a token this app can inspect --
// `GET /iam/v4/auth/me` (blocksClient.auth.userInfo()) validates the
// httpOnly session cookie (or bearer token, if one is cached) and returns
// its claims in one round trip. `iam.me()` is a different, heavier call --
// the full IAM user profile with roles/permissions -- and is used
// separately on the Profile page; it is not a substitute for this check.
export async function fetchSessionClaims(): Promise<Record<string, unknown> | undefined> {
  try {
    return await blocksClient.auth.userInfo();
  } catch {
    return undefined;
  }
}

export async function startLogin(returnTo?: string): Promise<void> {
  if (!blocksConfig.oidcClientId) {
    throw new Error("Login is not configured. Set VITE_BLOCKS_OIDC_CLIENT_ID in .env.");
  }

  sessionStorage.setItem(RETURN_KEY, returnTo || "/");
  await blocksClient.auth.idp.redirectToProvider();
}

export async function completeLogin(callbackUrl: string): Promise<CallbackResult> {
  const returnTo = sessionStorage.getItem(RETURN_KEY) || "/";

  sessionStorage.removeItem(RETURN_KEY);

  const data = await blocksClient.auth.idp.callback(callbackUrl);

  if (data.error) {
    return { message: data.error_description || data.error, ok: false };
  }

  // In the default cookie flow IAM sets the session via Set-Cookie on this
  // same response and returns no token in the body -- that's success, not
  // a failure. Only cache a token here if a non-default OIDC config made
  // IAM return one.
  const accessToken = data.access_token ?? data.accessToken;
  if (accessToken) persistTokens(accessToken, data.refresh_token ?? data.refreshToken);

  return { ok: true, returnTo };
}

export async function logout(): Promise<void> {
  // Ask IAM to end the session (clears the httpOnly cookie server-side)
  // before dropping any locally cached bearer token; best-effort so a
  // network failure never blocks the user from leaving a protected page.
  await blocksClient.auth.logout({ refreshToken: getRefreshToken() }).catch(() => undefined);
  clearLocalTokens();
}
