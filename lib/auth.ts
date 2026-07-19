import type { Role } from "@/lib/roles";

export const AUTH_COOKIE = "dashboard_auth";

/** SHA-256 hash using Web Crypto, safe for both edge middleware and Node runtimes. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface RoleAccessEntry {
  role: Role;
  password: string;
  /** People who share this role's password; shown in the post-login name picker. */
  names: string[];
}

/**
 * Access config. Preferred: env `ROLE_ACCESS` = JSON array of
 *   [{ "role": "closer", "password": "…", "names": ["Edward","Adeyemi"] }, …]
 * Each role has its own password; after entering it the person picks their name.
 *
 * Backwards compatible: if `ROLE_ACCESS` is unset but `DASHBOARD_PASSWORD` is set,
 * that single password grants full (oliver) access. If neither is set the site is
 * open (no gate) — same as before.
 */
export function getRoleAccess(): RoleAccessEntry[] {
  const raw = process.env.ROLE_ACCESS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((e) => e && typeof e.role === "string" && typeof e.password === "string")
          .map((e) => ({
            role: e.role as Role,
            password: String(e.password),
            names: Array.isArray(e.names) ? e.names.map(String) : [],
          }));
      }
    } catch {
      /* fall through to single-password mode */
    }
  }
  const single = process.env.DASHBOARD_PASSWORD;
  if (single) return [{ role: "operations" as Role, password: single, names: ["Oliver"] }];
  return [];
}

/** Whether any gate is configured at all. */
export function authConfigured(): boolean {
  return getRoleAccess().length > 0;
}

/** Session token for a (role, password) pair — what we store in the cookie. */
export async function sessionToken(role: Role, password: string): Promise<string> {
  return sha256Hex(`${role}:${password}`);
}

/** Given a cookie token, return the role/names it corresponds to, or null. */
export async function roleForToken(token: string | undefined): Promise<RoleAccessEntry | null> {
  if (!token) return null;
  for (const entry of getRoleAccess()) {
    const expected = await sessionToken(entry.role, entry.password);
    if (expected === token) return entry;
  }
  return null;
}
