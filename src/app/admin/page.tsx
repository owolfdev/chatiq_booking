"use client";

import { useCallback, useEffect, useState } from "react";

type BookingRow = {
  id: string;
  team_id: string;
  bot_id: string;
  contact_id: string;
  status: string;
  starts_at: string | null;
  timezone: string;
  created_at: string;
};

const TOKEN_KEY = "chatiq_booking_admin_token";

function formatWhen(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default function AdminSchedulePage() {
  const [token, setToken] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      setDraftToken(stored);
    }
  }, []);

  const load = useCallback(async (authToken: string) => {
    if (!authToken.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/bookings", {
        headers: { Authorization: `Bearer ${authToken.trim()}` },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        bookings?: BookingRow[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBookings(data.bookings ?? []);
    } catch (err) {
      setBookings([]);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  return (
    <main style={{ padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/">← ChatIQ Booking</a>
      </p>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.35rem" }}>
        Schedule
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        Pilot admin — upcoming / recent bookings (Asia/Bangkok labels). Auth
        with the same <code>BOOKING_SERVICE_TOKEN</code> as the API.
      </p>

      <form
        style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          const next = draftToken.trim();
          sessionStorage.setItem(TOKEN_KEY, next);
          setToken(next);
        }}
      >
        <input
          type="password"
          value={draftToken}
          onChange={(e) => setDraftToken(e.target.value)}
          placeholder="BOOKING_SERVICE_TOKEN"
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 6,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Load
        </button>
      </form>

      {loading ? <p>Loading…</p> : null}
      {error ? (
        <p style={{ color: "#b00020", marginBottom: "1rem" }}>{error}</p>
      ) : null}

      {!loading && !error && token ? (
        bookings.length === 0 ? (
          <p>No bookings yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                  <th style={{ padding: "0.5rem" }}>When</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem" }}>Booking</th>
                  <th style={{ padding: "0.5rem" }}>Contact</th>
                  <th style={{ padding: "0.5rem" }}>Bot</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                      {formatWhen(row.starts_at, row.timezone)}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{row.status}</td>
                    <td
                      style={{
                        padding: "0.5rem",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {row.id.slice(0, 8)}…
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {row.contact_id.slice(0, 8)}…
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {row.bot_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </main>
  );
}
