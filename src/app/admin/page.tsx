"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
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
  catalog_item_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  service_title: string | null;
  service_slug: string | null;
  service_duration_minutes: number | null;
};

type OfferSlot = { starts_at: string; label: string; timezone?: string };

type ViewMode = "week" | "table";
type StatusFilter = "open" | "all" | "cancelled" | "no_show";

type ServiceOption = {
  id: string;
  slug: string;
  title: string;
  duration_minutes: number;
};

function formatWhen(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function ymdInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function SchedulePanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<OfferSlot[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createServiceSlug, setCreateServiceSlug] = useState("");
  const [createSlots, setCreateSlots] = useState<OfferSlot[]>([]);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const tz = "Asia/Bangkok";
  const weekStart = useMemo(() => startOfWeekMonday(weekAnchor), [weekAnchor]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const load = useCallback(async () => {
    if (!ready || !session.token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/v1/admin/bookings", window.location.origin);
      if (session.teamId) url.searchParams.set("team_id", session.teamId);
      if (session.botId) url.searchParams.set("bot_id", session.botId);
      if (statusFilter === "open") {
        url.searchParams.set("status", "pending,confirmed");
      } else if (statusFilter === "cancelled") {
        url.searchParams.set("status", "cancelled");
      } else if (statusFilter === "no_show") {
        url.searchParams.set("status", "no_show");
      }
      url.searchParams.set("limit", "150");
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
  }, [ready, session.token, session.teamId, session.botId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = bookings.find((b) => b.id === selectedId) ?? null;

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const day of weekDays) {
      map.set(ymdInTz(day, tz), []);
    }
    for (const b of bookings) {
      if (!b.starts_at) continue;
      const key = ymdInTz(new Date(b.starts_at), b.timezone || tz);
      const list = map.get(key);
      if (list) list.push(b);
    }
    return map;
  }, [bookings, weekDays, tz]);

  async function cancelSelected() {
    if (!selected) return;
    if (!window.confirm(`Cancel booking for ${selected.contact_name || "customer"}?`)) {
      return;
    }
    setBusyAction(true);
    setActionMsg(null);
    const result = await executeAdminCommand({
      session,
      command: "booking.cancel",
      slots: {
        booking_id: selected.id,
        contact_id: selected.contact_id,
        confirmed: true,
      },
      timezone: selected.timezone || tz,
    });
    setBusyAction(false);
    if (!result.ok) {
      setActionMsg(result.error);
      return;
    }
    setActionMsg("Cancelled.");
    setSelectedId(null);
    setRescheduleSlots([]);
    await load();
  }

  async function markNoShowSelected() {
    if (!selected) return;
    if (
      !window.confirm(
        `Mark no-show for ${selected.contact_name || "customer"}?`
      )
    ) {
      return;
    }
    setBusyAction(true);
    setActionMsg(null);
    const result = await executeAdminCommand({
      session,
      command: "booking.mark_no_show",
      slots: {
        booking_id: selected.id,
        contact_id: selected.contact_id,
        confirmed: true,
      },
      timezone: selected.timezone || tz,
    });
    setBusyAction(false);
    if (!result.ok) {
      setActionMsg(result.error);
      return;
    }
    setActionMsg("Marked no-show.");
    setSelectedId(null);
    setRescheduleSlots([]);
    await load();
  }

  async function openCreatePanel() {
    setShowCreate(true);
    setCreateMsg(null);
    setCreateSlots([]);
    const result = await executeAdminCommand({
      session,
      command: "booking.list_services",
      slots: {},
      timezone: tz,
    });
    if (!result.ok) {
      setCreateMsg(result.error);
      return;
    }
    const rows = Array.isArray(result.data.services)
      ? (result.data.services as ServiceOption[])
      : [];
    setServices(rows);
    if (rows[0] && !createServiceSlug) {
      setCreateServiceSlug(rows[0].slug);
    }
  }

  async function loadCreateSlots() {
    if (!createServiceSlug) {
      setCreateMsg("Pick a service first");
      return;
    }
    setBusyAction(true);
    setCreateMsg(null);
    const result = await executeAdminCommand({
      session,
      command: "booking.get_availability",
      slots: { service_slug: createServiceSlug, limit: 5 },
      timezone: tz,
    });
    setBusyAction(false);
    if (!result.ok) {
      setCreateMsg(result.error);
      setCreateSlots([]);
      return;
    }
    const slots = Array.isArray(result.data.slots)
      ? (result.data.slots as OfferSlot[])
      : [];
    setCreateSlots(slots);
    if (slots.length === 0) setCreateMsg("No open slots right now.");
  }

  async function createOnBehalf(startsAt: string) {
    if (!createServiceSlug) return;
    if (!createName.trim()) {
      setCreateMsg("Customer name is required");
      return;
    }
    setBusyAction(true);
    setCreateMsg(null);
    const guestId = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await executeAdminCommand({
      session,
      command: "booking.create",
      slots: {
        service_slug: createServiceSlug,
        starts_at: startsAt,
      },
      timezone: tz,
      identity_claims: [
        {
          provider: "admin_created",
          external_id: guestId,
          verified: false,
        },
      ],
      contact_profile: {
        name: createName.trim(),
        email: createEmail.trim() || null,
      },
    });
    setBusyAction(false);
    if (!result.ok) {
      setCreateMsg(result.error);
      return;
    }
    setCreateMsg("Booking created.");
    setCreateSlots([]);
    setCreateName("");
    setCreateEmail("");
    setShowCreate(false);
    await load();
  }

  async function loadRescheduleSlots() {
    if (!selected) return;
    setBusyAction(true);
    setActionMsg(null);
    const result = await executeAdminCommand({
      session,
      command: "booking.get_availability",
      slots: {
        service_slug: selected.service_slug || undefined,
        service_id: selected.catalog_item_id || undefined,
        limit: 5,
      },
      timezone: selected.timezone || tz,
    });
    setBusyAction(false);
    if (!result.ok) {
      setActionMsg(result.error);
      setRescheduleSlots([]);
      return;
    }
    const slots = Array.isArray(result.data.slots)
      ? (result.data.slots as OfferSlot[])
      : [];
    setRescheduleSlots(slots);
    if (slots.length === 0) setActionMsg("No open slots in the next window.");
  }

  async function confirmReschedule(startsAt: string) {
    if (!selected) return;
    setBusyAction(true);
    setActionMsg(null);
    const result = await executeAdminCommand({
      session,
      command: "booking.reschedule",
      slots: {
        booking_id: selected.id,
        contact_id: selected.contact_id,
        new_starts_at: startsAt,
        confirmed: true,
      },
      timezone: selected.timezone || tz,
    });
    setBusyAction(false);
    if (!result.ok) {
      setActionMsg(result.error);
      return;
    }
    setActionMsg("Rescheduled.");
    setRescheduleSlots([]);
    setSelectedId(null);
    await load();
  }

  if (!ready) {
    return (
      <p style={adminUi.muted}>
        Connect with the service token to load the schedule.
      </p>
    );
  }

  return (
    <>
      <div style={{ ...adminUi.row, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            style={view === "week" ? adminUi.button : adminUi.buttonSecondary}
            onClick={() => setView("week")}
          >
            Week
          </button>
          <button
            type="button"
            style={view === "table" ? adminUi.button : adminUi.buttonSecondary}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ ...adminUi.input, fontFamily: "inherit" }}
        >
          <option value="open">Open (pending/confirmed)</option>
          <option value="all">All statuses</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        <button
          type="button"
          style={adminUi.buttonSecondary}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          type="button"
          style={adminUi.button}
          onClick={() => void openCreatePanel()}
        >
          New booking
        </button>
      </div>

      {error ? <p style={adminUi.error}>{error}</p> : null}

      {showCreate ? (
        <section
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.75rem",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Create on behalf</h2>
            <button
              type="button"
              style={adminUi.buttonSecondary}
              onClick={() => {
                setShowCreate(false);
                setCreateSlots([]);
                setCreateMsg(null);
              }}
            >
              Close
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div>
              <label style={adminUi.label}>Customer name</label>
              <input
                style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div>
              <label style={adminUi.label}>Email (optional)</label>
              <input
                style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
            </div>
            <div>
              <label style={adminUi.label}>Service</label>
              <select
                style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
                value={createServiceSlug}
                onChange={(e) => setCreateServiceSlug(e.target.value)}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.title} ({s.duration_minutes}m)
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ ...adminUi.row, marginTop: "0.75rem" }}>
            <button
              type="button"
              style={adminUi.button}
              disabled={busyAction}
              onClick={() => void loadCreateSlots()}
            >
              Find open slots
            </button>
          </div>
          {createMsg ? (
            <p
              style={{
                marginTop: 8,
                color: createMsg.endsWith(".") ? "#0a7" : "#b00020",
                fontSize: "0.9rem",
              }}
            >
              {createMsg}
            </p>
          ) : null}
          {createSlots.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 8,
              }}
            >
              {createSlots.map((s) => (
                <button
                  key={s.starts_at}
                  type="button"
                  style={adminUi.buttonSecondary}
                  disabled={busyAction}
                  onClick={() => void createOnBehalf(s.starts_at)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "1fr 320px" : "1fr",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        <div>
          {view === "week" ? (
            <>
              <div style={{ ...adminUi.row, marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  onClick={() => setWeekAnchor(addDays(weekStart, -7))}
                >
                  ← Prev
                </button>
                <strong>
                  Week of{" "}
                  {weekStart.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </strong>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  onClick={() => setWeekAnchor(addDays(weekStart, 7))}
                >
                  Next →
                </button>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  onClick={() => setWeekAnchor(new Date())}
                >
                  Today
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {weekDays.map((day) => {
                  const key = ymdInTz(day, tz);
                  const dayBookings = bookingsByDay.get(key) ?? [];
                  const isToday = key === ymdInTz(new Date(), tz);
                  return (
                    <div
                      key={key}
                      style={{
                        border: isToday ? "2px solid #111" : "1px solid #e5e5e5",
                        borderRadius: 8,
                        padding: 8,
                        minHeight: 140,
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          marginBottom: 8,
                        }}
                      >
                        {day.toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {dayBookings.length === 0 ? (
                          <span style={{ fontSize: "0.75rem", color: "#999" }}>—</span>
                        ) : (
                          dayBookings.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setSelectedId(b.id);
                                setRescheduleSlots([]);
                                setActionMsg(null);
                              }}
                              style={{
                                textAlign: "left",
                                border:
                                  selectedId === b.id
                                    ? "1px solid #111"
                                    : "1px solid #ddd",
                                borderRadius: 6,
                                padding: "6px 8px",
                                background: selectedId === b.id ? "#111" : "#fff",
                                color: selectedId === b.id ? "#fff" : "#111",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                lineHeight: 1.35,
                              }}
                            >
                              <div>
                                {b.starts_at
                                  ? new Intl.DateTimeFormat("en-GB", {
                                      timeZone: b.timezone || tz,
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    }).format(new Date(b.starts_at))
                                  : "—"}
                              </div>
                              <div>
                                {b.contact_name || "Guest"} ·{" "}
                                {b.service_title || "Service"}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={adminUi.table}>
                <thead>
                  <tr>
                    <th style={adminUi.th}>When</th>
                    <th style={adminUi.th}>Customer</th>
                    <th style={adminUi.th}>Service</th>
                    <th style={adminUi.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        setSelectedId(row.id);
                        setRescheduleSlots([]);
                        setActionMsg(null);
                      }}
                      style={{
                        cursor: "pointer",
                        background:
                          selectedId === row.id ? "#f0f0f0" : undefined,
                      }}
                    >
                      <td style={{ ...adminUi.td, whiteSpace: "nowrap" }}>
                        {formatWhen(row.starts_at, row.timezone)}
                      </td>
                      <td style={adminUi.td}>
                        {row.contact_name || "Guest"}
                        {row.contact_email ? (
                          <div style={{ fontSize: "0.8rem", color: "#666" }}>
                            {row.contact_email}
                          </div>
                        ) : null}
                      </td>
                      <td style={adminUi.td}>{row.service_title || "—"}</td>
                      <td style={adminUi.td}>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bookings.length === 0 && !loading ? (
                <p style={{ marginTop: "1rem" }}>No bookings in this filter.</p>
              ) : null}
            </div>
          )}
        </div>

        {selected ? (
          <aside
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "1rem",
              position: "sticky",
              top: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.75rem",
              }}
            >
              <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Booking</h2>
              <button
                type="button"
                style={adminUi.buttonSecondary}
                onClick={() => {
                  setSelectedId(null);
                  setRescheduleSlots([]);
                  setActionMsg(null);
                }}
              >
                Close
              </button>
            </div>
            <dl style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
              <dt style={adminUi.muted}>When</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {formatWhen(selected.starts_at, selected.timezone)}
              </dd>
              <dt style={adminUi.muted}>Customer</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {selected.contact_name || "Guest"}
                {selected.contact_email ? (
                  <>
                    <br />
                    {selected.contact_email}
                  </>
                ) : null}
              </dd>
              <dt style={adminUi.muted}>Service</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {selected.service_title || "—"}
                {selected.service_duration_minutes
                  ? ` (${selected.service_duration_minutes} min)`
                  : ""}
              </dd>
              <dt style={adminUi.muted}>Status</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>{selected.status}</dd>
              <dt style={adminUi.muted}>Ids</dt>
              <dd
                style={{
                  margin: 0,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                booking {selected.id}
                <br />
                contact {selected.contact_id}
              </dd>
            </dl>

            {actionMsg ? (
              <p
                style={{
                  marginTop: "0.75rem",
                  color: actionMsg.endsWith(".") ? "#0a7" : "#b00020",
                  fontSize: "0.9rem",
                }}
              >
                {actionMsg}
              </p>
            ) : null}

            {selected.status === "pending" || selected.status === "confirmed" ? (
              <div
                style={{
                  ...adminUi.row,
                  marginTop: "1rem",
                  flexDirection: "column",
                }}
              >
                {selected.starts_at &&
                new Date(selected.starts_at).getTime() > Date.now() ? (
                  <>
                    <button
                      type="button"
                      style={adminUi.button}
                      disabled={busyAction}
                      onClick={() => void loadRescheduleSlots()}
                    >
                      Offer reschedule slots
                    </button>
                    <button
                      type="button"
                      style={adminUi.buttonSecondary}
                      disabled={busyAction}
                      onClick={() => void cancelSelected()}
                    >
                      Cancel booking
                    </button>
                  </>
                ) : (
                  <p style={{ ...adminUi.muted, margin: 0 }}>
                    Past booking — cancel/reschedule closed; you can mark no-show.
                  </p>
                )}
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  disabled={busyAction}
                  onClick={() => void markNoShowSelected()}
                >
                  Mark no-show
                </button>
              </div>
            ) : (
              <p style={{ ...adminUi.muted, marginTop: "1rem" }}>
                No mutate actions for inactive bookings.
              </p>
            )}

            {rescheduleSlots.length > 0 ? (
              <div style={{ marginTop: "1rem" }}>
                <p style={{ fontSize: "0.85rem", marginBottom: 8 }}>
                  Pick a new time:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rescheduleSlots.map((s) => (
                    <button
                      key={s.starts_at}
                      type="button"
                      style={adminUi.buttonSecondary}
                      disabled={busyAction}
                      onClick={() => void confirmReschedule(s.starts_at)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}

export default function AdminSchedulePage() {
  return (
    <AdminShell
      path="/admin"
      title="Schedule"
      subtitle="Week/table views. Detail: cancel, reschedule, no-show. New booking = create on behalf."
    >
      {({ session, ready }) => <SchedulePanel session={session} ready={ready} />}
    </AdminShell>
  );
}
