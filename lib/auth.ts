export const AUTH_COOKIE = "dashboard_auth";

/** SHA-256 hash using Web Crypto, safe for both edge middleware and Node runtimes. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedAuthToken(): Promise<string | null> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}
