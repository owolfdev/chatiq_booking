export function getBookingServiceToken(): string | null {
  const token = process.env.BOOKING_SERVICE_TOKEN?.trim();
  return token || null;
}

export function requireServiceAuth(authHeader: string | null): boolean {
  const expected = getBookingServiceToken();
  if (!expected) {
    // Fail closed in production-shaped deploys; allow open in local when unset
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    return true;
  }
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const provided = authHeader.slice("Bearer ".length).trim();
  return provided.length > 0 && provided === expected;
}

/** Vercel Cron auth (CRON_SECRET) or booking service token for manual pings. */
export function requireCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (cronSecret) {
    if (authHeader === `Bearer ${cronSecret}`) return true;
    const headerSecret = request.headers.get("x-cron-secret");
    if (headerSecret === cronSecret) return true;
  }
  if (requireServiceAuth(authHeader)) return true;
  if (!cronSecret && process.env.NODE_ENV !== "production") {
    return true;
  }
  return false;
}
