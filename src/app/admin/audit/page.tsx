"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

type AuditRow = {
  id: string;
  command: string;
  actor_type: string;
  actor_id: string | null;
  via: string;
  contact_id: string | null;
  bot_id: string;
  ok: boolean;
  error_code: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  slots: Record<string, unknown>;
  created_at: string;
};

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function compactJson(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  if (keys.length === 0) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function AuditPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [botScoped, setBotScoped] = useState(true);
  const [filterCommand, setFilterCommand] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const result = await executeAdminCommand({
        session,
        command: "booking.admin_list_command_audit",
        slots: {
          limit: 50,
          bot_scoped: botScoped,
          ...(filterCommand.trim()
            ? { filter_command: filterCommand.trim() }
            : {}),
        },
      });
      if (!result.ok) {
        setError(result.error);
        setRows([]);
        return;
      }
      setRows((result.data.audit as AuditRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [botScoped, filterCommand, ready, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-end",
          marginBottom: "1rem",
        }}
      >
        <div style={{ flex: "1 1 220px" }}>
          <label style={adminUi.label}>Filter command</label>
          <input
            style={adminUi.input}
            value={filterCommand}
            onChange={(e) => setFilterCommand(e.target.value)}
            placeholder="e.g. booking.cancel"
          />
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.9rem",
            marginBottom: 4,
          }}
        >
          <input
            type="checkbox"
            checked={botScoped}
            onChange={(e) => setBotScoped(e.target.checked)}
          />
          This bot only
        </label>
        <button
          type="button"
          style={adminUi.button}
          disabled={!ready || loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <p style={adminUi.error}>{error}</p> : null}

      <p style={{ ...adminUi.muted, marginTop: 0, fontSize: "0.9rem" }}>
        Mutating commands only (create, cancel, hours, unmerge, …). Tokens and
        codes are redacted. Customer scope: own contact only; staff: team-wide.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "minmax(0, 1fr) 320px" : "1fr",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <table style={adminUi.table}>
          <thead>
            <tr>
              <th style={adminUi.th}>When</th>
              <th style={adminUi.th}>Command</th>
              <th style={adminUi.th}>Actor</th>
              <th style={adminUi.th}>Via</th>
              <th style={adminUi.th}>Ok</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                style={{
                  cursor: "pointer",
                  background: selectedId === row.id ? "#f0f0f0" : undefined,
                }}
              >
                <td style={adminUi.td}>{formatWhen(row.created_at)}</td>
                <td
                  style={{
                    ...adminUi.td,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.8rem",
                  }}
                >
                  {row.command}
                </td>
                <td style={adminUi.td}>
                  {row.actor_type}
                  {row.actor_id ? ` · ${row.actor_id}` : ""}
                </td>
                <td style={adminUi.td}>{row.via}</td>
                <td style={adminUi.td}>{row.ok ? "yes" : row.error_code || "no"}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} style={{ ...adminUi.td, color: "#666" }}>
                  No audit rows yet — run a cancel/create/hours change first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {selected ? (
          <aside
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "1rem",
              position: "sticky",
              top: 16,
              fontSize: "0.85rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Detail</h2>
            <dl style={{ margin: 0, lineHeight: 1.55 }}>
              <dt style={adminUi.muted}>Command</dt>
              <dd
                style={{
                  margin: "0 0 0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  wordBreak: "break-all",
                }}
              >
                {selected.command}
              </dd>
              <dt style={adminUi.muted}>Contact</dt>
              <dd
                style={{
                  margin: "0 0 0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                {selected.contact_id || "—"}
              </dd>
              <dt style={adminUi.muted}>Before</dt>
              <dd
                style={{
                  margin: "0 0 0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                {compactJson(selected.before)}
              </dd>
              <dt style={adminUi.muted}>After</dt>
              <dd
                style={{
                  margin: "0 0 0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                {compactJson(selected.after)}
              </dd>
              <dt style={adminUi.muted}>Slots</dt>
              <dd
                style={{
                  margin: 0,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                {compactJson(selected.slots)}
              </dd>
            </dl>
            {selected.contact_id ? (
              <p style={{ marginTop: "0.75rem" }}>
                <a
                  href={`/admin/customers?contact_id=${encodeURIComponent(selected.contact_id)}`}
                >
                  View customer →
                </a>
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <AdminShell
      title="Audit"
      subtitle="Who changed what — mutating commands with actor, via, and before→after."
      path="/admin/audit"
    >
      {({ session, ready }) => <AuditPanel session={session} ready={ready} />}
    </AdminShell>
  );
}
