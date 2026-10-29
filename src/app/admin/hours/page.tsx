"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

type HoursRow = {
  id?: string;
  weekday: number;
  start_local: string;
  end_local: string;
};

type ExceptionRow = {
  id: string;
  on_date: string;
  closed: boolean;
  start_local: string | null;
  end_local: string | null;
  note: string | null;
};

type BlockRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

/** Accepts `HH:mm` or Postgres `HH:mm:ss`. */
function toHm(value: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(value.trim());
  if (!m) return "09:00";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(min) ||
    h < 0 ||
    h > 23 ||
    min < 0 ||
    min > 59
  ) {
    return "09:00";
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function HoursPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [hours, setHours] = useState<HoursRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const load = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "availability.get_schedule",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const settings = result.data.settings as
      | { timezone?: string }
      | undefined;
    if (settings?.timezone) setTimezone(settings.timezone);
    const hourRows = Array.isArray(result.data.hours)
      ? (result.data.hours as HoursRow[])
      : [];
    setHours(
      hourRows.map((h) => ({
        ...h,
        start_local: toHm(String(h.start_local)),
        end_local: toHm(String(h.end_local)),
      }))
    );
    setExceptions(
      Array.isArray(result.data.exceptions)
        ? (result.data.exceptions as ExceptionRow[])
        : []
    );
    setBlocks(
      Array.isArray(result.data.blocks)
        ? (result.data.blocks as BlockRow[])
        : []
    );
  }, [ready, session]);

  useEffect(() => {
    void load();
  }, [load]);

  function windowsForDay(weekday: number): HoursRow[] {
    return hours.filter((h) => h.weekday === weekday);
  }

  function setDayWindow(
    weekday: number,
    field: "start_local" | "end_local",
    value: string
  ) {
    setHours((prev) => {
      const others = prev.filter((h) => h.weekday !== weekday);
      const existing = prev.find((h) => h.weekday === weekday);
      if (!existing) {
        return [
          ...others,
          {
            weekday,
            start_local: field === "start_local" ? value : "09:00",
            end_local: field === "end_local" ? value : "17:00",
          },
        ];
      }
      return [
        ...others,
        { ...existing, [field]: value },
      ].sort((a, b) => a.weekday - b.weekday);
    });
  }

  function toggleDay(weekday: number, open: boolean) {
    setHours((prev) => {
      const others = prev.filter((h) => h.weekday !== weekday);
      if (!open) return others;
      return [
        ...others,
        { weekday, start_local: "09:00", end_local: "17:00" },
      ].sort((a, b) => a.weekday - b.weekday);
    });
  }

  async function saveHours() {
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "availability.set_hours",
      slots: {
        timezone,
        hours: hours.map((h) => ({
          weekday: h.weekday,
          start_local: h.start_local,
          end_local: h.end_local,
        })),
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function addClosedException() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
      setError("Exception date must be YYYY-MM-DD");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "availability.set_exception",
      slots: {
        on_date: exceptionDate,
        closed: true,
        note: exceptionNote.trim() || null,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setExceptionDate("");
    setExceptionNote("");
    await load();
  }

  async function addBlock() {
    if (!blockStart.trim() || !blockEnd.trim()) {
      setError("Block needs start and end (ISO or datetime-local)");
      return;
    }
    const starts_at = new Date(blockStart).toISOString();
    const ends_at = new Date(blockEnd).toISOString();
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "availability.block",
      slots: {
        starts_at,
        ends_at,
        reason: blockReason.trim() || null,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBlockStart("");
    setBlockEnd("");
    setBlockReason("");
    await load();
  }

  async function removeBlock(id: string) {
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "availability.unblock",
      slots: { block_id: id },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (!ready) {
    return <p style={adminUi.muted}>Connect to edit weekly hours for this bot.</p>;
  }

  return (
    <>
      {error ? <p style={adminUi.error}>{error}</p> : null}

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 8,
          padding: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          Weekly hours
        </h2>
        <div style={adminUi.field}>
          <label style={adminUi.label}>Timezone</label>
          <input
            style={{ ...adminUi.input, maxWidth: 280, fontFamily: "inherit" }}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
        <table style={adminUi.table}>
          <thead>
            <tr>
              <th style={adminUi.th}>Day</th>
              <th style={adminUi.th}>Open</th>
              <th style={adminUi.th}>Start</th>
              <th style={adminUi.th}>End</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => {
              const win = windowsForDay(day.value)[0];
              const open = Boolean(win);
              return (
                <tr key={day.value}>
                  <td style={adminUi.td}>{day.label}</td>
                  <td style={adminUi.td}>
                    <input
                      type="checkbox"
                      checked={open}
                      onChange={(e) => toggleDay(day.value, e.target.checked)}
                    />
                  </td>
                  <td style={adminUi.td}>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="09:00"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                      title="24-hour time HH:mm"
                      disabled={!open}
                      style={{
                        ...adminUi.input,
                        fontFamily: "ui-monospace, monospace",
                        width: 88,
                      }}
                      value={win?.start_local ?? "09:00"}
                      onChange={(e) =>
                        setDayWindow(day.value, "start_local", e.target.value)
                      }
                      onBlur={(e) =>
                        setDayWindow(
                          day.value,
                          "start_local",
                          toHm(e.target.value || "09:00")
                        )
                      }
                    />
                  </td>
                  <td style={adminUi.td}>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="17:00"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                      title="24-hour time HH:mm"
                      disabled={!open}
                      style={{
                        ...adminUi.input,
                        fontFamily: "ui-monospace, monospace",
                        width: 88,
                      }}
                      value={win?.end_local ?? "17:00"}
                      onChange={(e) =>
                        setDayWindow(day.value, "end_local", e.target.value)
                      }
                      onBlur={(e) =>
                        setDayWindow(
                          day.value,
                          "end_local",
                          toHm(e.target.value || "17:00")
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ ...adminUi.row, marginTop: "0.75rem" }}>
          <button
            type="button"
            style={adminUi.button}
            disabled={busy}
            onClick={() => void saveHours()}
          >
            Save weekly hours
          </button>
          <button
            type="button"
            style={adminUi.buttonSecondary}
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 8,
          padding: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          Closed dates
        </h2>
        <div style={adminUi.row}>
          <input
            type="date"
            style={{ ...adminUi.input, fontFamily: "inherit" }}
            value={exceptionDate}
            onChange={(e) => setExceptionDate(e.target.value)}
          />
          <input
            type="text"
            placeholder="Note (optional)"
            style={{ ...adminUi.input, flex: 1, fontFamily: "inherit" }}
            value={exceptionNote}
            onChange={(e) => setExceptionNote(e.target.value)}
          />
          <button
            type="button"
            style={adminUi.button}
            disabled={busy}
            onClick={() => void addClosedException()}
          >
            Add closed day
          </button>
        </div>
        {exceptions.length === 0 ? (
          <p style={adminUi.muted}>No exceptions yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {exceptions.map((ex) => (
              <li key={ex.id} style={{ marginBottom: 6 }}>
                <strong>{ex.on_date}</strong>
                {ex.closed ? " — closed" : ` — open ${ex.start_local}–${ex.end_local}`}
                {ex.note ? ` (${ex.note})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 8,
          padding: "1rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          Blocks
        </h2>
        <p style={{ ...adminUi.muted, marginBottom: "0.75rem" }}>
          Opaque busy intervals (lunch, private event). Uses local datetime inputs
          converted to UTC.
        </p>
        <div style={adminUi.row}>
          <input
            type="datetime-local"
            style={{ ...adminUi.input, fontFamily: "inherit" }}
            value={blockStart}
            onChange={(e) => setBlockStart(e.target.value)}
          />
          <input
            type="datetime-local"
            style={{ ...adminUi.input, fontFamily: "inherit" }}
            value={blockEnd}
            onChange={(e) => setBlockEnd(e.target.value)}
          />
          <input
            type="text"
            placeholder="Reason"
            style={{ ...adminUi.input, flex: 1, fontFamily: "inherit" }}
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
          />
          <button
            type="button"
            style={adminUi.button}
            disabled={busy}
            onClick={() => void addBlock()}
          >
            Add block
          </button>
        </div>
        {blocks.length === 0 ? (
          <p style={adminUi.muted}>No blocks.</p>
        ) : (
          <table style={adminUi.table}>
            <thead>
              <tr>
                <th style={adminUi.th}>From</th>
                <th style={adminUi.th}>To</th>
                <th style={adminUi.th}>Reason</th>
                <th style={adminUi.th} />
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id}>
                  <td style={adminUi.td}>
                    {new Date(b.starts_at).toLocaleString()}
                  </td>
                  <td style={adminUi.td}>
                    {new Date(b.ends_at).toLocaleString()}
                  </td>
                  <td style={adminUi.td}>{b.reason || "—"}</td>
                  <td style={adminUi.td}>
                    <button
                      type="button"
                      style={adminUi.buttonSecondary}
                      disabled={busy}
                      onClick={() => void removeBlock(b.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default function AdminHoursPage() {
  return (
    <AdminShell
      path="/admin/hours"
      title="Hours"
      subtitle="Weekly open windows, closed dates, and opaque blocks. Slot search follows these rules."
    >
      {({ session, ready }) => <HoursPanel session={session} ready={ready} />}
    </AdminShell>
  );
}
