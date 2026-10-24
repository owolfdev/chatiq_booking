"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import {
  actorLabel,
  filterCommands,
  type CommandActor,
  type CommandCategory,
  type CommandEntry,
} from "@/lib/admin/command-catalog";

function CommandsPanel() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q")?.trim() ?? "";

  const [query, setQuery] = useState(initialQ);
  const [actor, setActor] = useState<CommandActor | "all">("all");
  const [category, setCategory] = useState<CommandCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialQ || null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialQ) {
      setQuery(initialQ);
      setSelectedId(initialQ);
    }
  }, [initialQ]);

  const rows = useMemo(
    () => filterCommands(query, { actor, category }),
    [query, actor, category]
  );

  const selected: CommandEntry | null =
    rows.find((r) => r.id === selectedId) ??
    rows[0] ??
    null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [selected, selectedId]);

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

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
        <div style={{ flex: "1 1 240px" }}>
          <label style={adminUi.label}>Search</label>
          <input
            style={adminUi.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. cancel, unmerge, hours"
          />
        </div>
        <div>
          <label style={adminUi.label}>Who</label>
          <select
            style={adminUi.input}
            value={actor}
            onChange={(e) => setActor(e.target.value as CommandActor | "all")}
          >
            <option value="all">All actors</option>
            <option value="staff">Staff can run</option>
            <option value="customer">Customer can run</option>
            <option value="both">Both only</option>
          </select>
        </div>
        <div>
          <label style={adminUi.label}>Category</label>
          <select
            style={adminUi.input}
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as CommandCategory | "all")
            }
          >
            <option value="all">All</option>
            <option value="booking">Booking</option>
            <option value="identity">Identity</option>
            <option value="catalog">Catalog</option>
            <option value="availability">Availability</option>
          </select>
        </div>
      </div>

      <p style={{ ...adminUi.muted, marginTop: 0, fontSize: "0.9rem" }}>
        {rows.length} command{rows.length === 1 ? "" : "s"} · same bus as chat
        and Schedule. Tip: press ⌘K anywhere in admin.
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
              <th style={adminUi.th}>Command</th>
              <th style={adminUi.th}>Who</th>
              <th style={adminUi.th}>Mutates</th>
              <th style={adminUi.th}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                style={{
                  cursor: "pointer",
                  background:
                    selected?.id === row.id ? "#f0f0f0" : undefined,
                }}
              >
                <td
                  style={{
                    ...adminUi.td,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.8rem",
                  }}
                >
                  {row.id}
                </td>
                <td style={adminUi.td}>{actorLabel(row.actor)}</td>
                <td style={adminUi.td}>{row.mutating ? "yes" : "no"}</td>
                <td style={adminUi.td}>{row.summary}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...adminUi.td, color: "#666" }}>
                  No matches
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
            }}
          >
            <h2
              style={{
                fontSize: "0.95rem",
                margin: "0 0 0.5rem",
                fontFamily: "ui-monospace, monospace",
                wordBreak: "break-all",
              }}
            >
              {selected.id}
            </h2>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>
              {selected.summary}
            </p>
            <dl style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}>
              <dt style={adminUi.muted}>Who may run</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {actorLabel(selected.actor)}
              </dd>
              <dt style={adminUi.muted}>Mutating</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {selected.mutating ? "Yes — needs care / confirmed" : "No"}
              </dd>
              <dt style={adminUi.muted}>Slots</dt>
              <dd
                style={{
                  margin: "0 0 0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.8rem",
                }}
              >
                {selected.slots.length > 0
                  ? selected.slots.join(", ")
                  : "(none)"}
              </dd>
              <dt style={adminUi.muted}>Category</dt>
              <dd style={{ margin: "0 0 0.75rem" }}>{selected.category}</dd>
            </dl>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                style={adminUi.buttonSecondary}
                onClick={() => void copyId(selected.id)}
              >
                {copied ? "Copied" : "Copy id"}
              </button>
              {selected.adminHref ? (
                <a href={selected.adminHref} style={{ fontSize: "0.9rem" }}>
                  Open related UI →
                </a>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default function CommandsPage() {
  return (
    <AdminShell
      title="Commands"
      subtitle="Every verb on the booking command bus — who can run it, what it takes, and whether it mutates."
      path="/admin/commands"
    >
      {() => (
        <Suspense fallback={<p style={adminUi.muted}>Loading…</p>}>
          <CommandsPanel />
        </Suspense>
      )}
    </AdminShell>
  );
}
