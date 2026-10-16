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
