import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const TEAM_DOMAIN = "https://dink-lounge.cloudflareaccess.com";
const JWT_HEADER = "cf-access-jwt-assertion";

type AccessPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
};

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyAccessToken(token: string): Promise<AccessPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { kid?: string };
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as AccessPayload;
    if (!header.kid || !payload.email || !payload.exp || payload.exp * 1000 <= Date.now()) return null;
    if (payload.iss?.replace(/\/$/, "") !== TEAM_DOMAIN) return null;

    const response = await fetch(`${TEAM_DOMAIN}/cdn-cgi/access/certs`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!response.ok) return null;
    const jwks = await response.json() as { keys?: JsonWebKey[] };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const token = requestHeaders.get(JWT_HEADER);
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload?.email) return null;

  return {
    displayName: payload.email,
    email: payload.email,
    fullName: null,
  };
}

export async function requireChatGPTUser(_returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect("/admin/access-required");
}

export function chatGPTSignInPath(returnTo: string): string {
  return safeRelativeReturnPath(returnTo);
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/cdn-cgi/access/logout?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
