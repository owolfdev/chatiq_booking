"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import type { AdminSession } from "@/lib/admin/session";

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

function SchedulePanel({ session, ready }: { session: AdminSession; ready: boolean }) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ready || !session.token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/v1/admin/bookings", window.location.origin);
      if (session.teamId) url.searchParams.set("team_id", session.teamId);
      if (session.botId) url.searchParams.set("bot_id", session.botId);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${session.token.trim()}` },
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
  }, [ready, session.token, session.teamId, session.botId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return <p style={adminUi.muted}>Connect with the service token to load bookings.</p>;
  }

  return (
    <>
      <div style={adminUi.row}>
        <button type="button" style={adminUi.button} onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error ? <p style={adminUi.error}>{error}</p> : null}
      {!loading && !error ? (
        bookings.length === 0 ? (
          <p>No bookings yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={adminUi.table}>
              <thead>
                <tr>
                  <th style={adminUi.th}>When</th>
                  <th style={adminUi.th}>Status</th>
                  <th style={adminUi.th}>Booking</th>
                  <th style={adminUi.th}>Contact</th>
                  <th style={adminUi.th}>Bot</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...adminUi.td, whiteSpace: "nowrap" }}>
                      {formatWhen(row.starts_at, row.timezone)}
                    </td>
                    <td style={adminUi.td}>{row.status}</td>
                    <td style={{ ...adminUi.td, fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
                      {row.id.slice(0, 8)}…
                    </td>
                    <td style={{ ...adminUi.td, fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
                      {row.contact_id.slice(0, 8)}…
                    </td>
                    <td style={{ ...adminUi.td, fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
                      {row.bot_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </>
  );
}

export default function AdminSchedulePage() {
  return (
    <AdminShell
      path="/admin"
      title="Schedule"
      subtitle="Upcoming / recent bookings. Auth with BOOKING_SERVICE_TOKEN; scope by team and bot."
    >
      {({ session, ready }) => <SchedulePanel session={session} ready={ready} />}
    </AdminShell>
  );
}
