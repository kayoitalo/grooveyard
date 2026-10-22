/** APP_ORIGIN is the public deployment origin; forwarded headers are never trusted. */
export function isTrustedMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site && site !== "same-origin" && site !== "none")) return false;
  try {
    const configured = process.env.APP_ORIGIN;
    if (process.env.NODE_ENV === "production" && !configured) return false;
    const expected = new URL(configured || request.url);
    if (process.env.NODE_ENV === "production" && expected.protocol !== "https:") return false;
    return new URL(origin).origin === expected.origin;
  } catch { return false; }
}
