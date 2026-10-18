export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
        ChatIQ Booking
      </h1>
      <p style={{ color: "#666", lineHeight: 1.5 }}>
        Sibling booking service. Persistence: Supabase when configured.
        Default timezone: Asia/Bangkok.
      </p>
      <ul style={{ marginTop: "1.5rem", lineHeight: 1.8 }}>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          POST /api/v1/turns/handle — Bearer{" "}
          <code>BOOKING_SERVICE_TOKEN</code>
        </li>
        <li>
          <a href="/admin">Admin schedule</a> — list bookings
        </li>
      </ul>
    </main>
  );
}
