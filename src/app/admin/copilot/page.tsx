"use client";

import { useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

type Proposal = {
  kind: "command" | "clarify" | "unsupported";
  summary: string;
  command?: string;
  slots?: Record<string, unknown>;
  mutating?: boolean;
  clarify_question?: string;
  engine: "llm" | "heuristic";
};

function CopilotPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [editSlots, setEditSlots] = useState("{}");
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);

  async function propose() {
    if (!ready || !message.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setNotifyNote(null);
    setProposal(null);
    setEditing(false);
    try {
      const res = await fetch("/api/v1/admin/copilot/propose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token.trim()}`,
        },
        body: JSON.stringify({
          message: message.trim(),
          team_id: session.teamId.trim(),
          bot_id: session.botId.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        proposal?: Proposal;
      };
      if (!res.ok || !json.ok || !json.proposal) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }
      setProposal(json.proposal);
      setEditSlots(JSON.stringify(json.proposal.slots ?? {}, null, 2));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal || proposal.kind !== "command" || !proposal.command) return;
    let slots: Record<string, unknown> = proposal.slots ?? {};
    if (editing) {
      try {
        slots = JSON.parse(editSlots) as Record<string, unknown>;
      } catch {
        setError("Slots JSON is invalid");
        return;
      }
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const exec = await executeAdminCommand({
        session,
        command: proposal.command,
        slots,
        via: "llm",
        actor_id: "admin-copilot",
      });
      if (!exec.ok) {
        setError(exec.error);
        return;
      }
      setResult(JSON.stringify(exec.data ?? {}, null, 2));
      if (proposal.mutating) {
        setNotifyNote(
          "If ChatIQ notify is configured, the customer was messaged on LINE/web about this change."
        );
      }
      setProposal(null);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setProposal(null);
    setEditing(false);
    setError(null);
  }

  return (
    <div>
      <p style={{ ...adminUi.muted, marginTop: 0 }}>
        Describe what you want in plain language. Mutating actions show a
        confirm card and never run until you click Confirm. Uses OpenAI when{" "}
        <code>BOOKING_COPILOT_OPENAI_KEY</code> / <code>OPENAI_API_KEY</code> is
        set; otherwise a built-in heuristic.
      </p>

      <label style={adminUi.label}>Request</label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder='e.g. "list services" or "cancel 6499b0ef-…"'
        style={{
          ...adminUi.input,
          width: "100%",
          fontFamily: "inherit",
          resize: "vertical",
          marginBottom: "0.75rem",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void propose();
          }
        }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
        <button
          type="button"
          style={adminUi.button}
          disabled={!ready || busy || !message.trim()}
          onClick={() => void propose()}
        >
          {busy ? "Working…" : "Propose"}
        </button>
        <span style={{ ...adminUi.muted, fontSize: "0.85rem", alignSelf: "center" }}>
          ⌘↵ to propose
        </span>
      </div>

      {error ? <p style={adminUi.error}>{error}</p> : null}

      {proposal ? (
        <section
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1.25rem",
            background: proposal.mutating ? "#fff8f0" : "#f7faf7",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: "0.5rem",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>
              {proposal.kind === "command"
                ? proposal.mutating
                  ? "Proposed change"
                  : "Proposed lookup"
                : proposal.kind === "clarify"
                  ? "Need a detail"
                  : "Can't map that yet"}
            </h2>
            <span style={{ ...adminUi.muted, fontSize: "0.75rem" }}>
              via {proposal.engine}
            </span>
          </div>
          <p style={{ margin: "0 0 0.75rem" }}>{proposal.summary}</p>

          {proposal.kind === "clarify" ? (
            <p style={{ margin: 0, fontWeight: 500 }}>
              {proposal.clarify_question}
            </p>
          ) : null}

          {proposal.kind === "command" ? (
            <>
              <p
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.85rem",
                  margin: "0 0 0.5rem",
                }}
              >
                {proposal.command}
                {proposal.mutating ? " · mutates" : " · read-only"}
              </p>
              {editing ? (
                <textarea
                  value={editSlots}
                  onChange={(e) => setEditSlots(e.target.value)}
                  rows={8}
                  style={{
                    ...adminUi.input,
                    width: "100%",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.8rem",
                    marginBottom: "0.75rem",
                  }}
                />
              ) : (
                <pre
                  style={{
                    margin: "0 0 0.75rem",
                    padding: "0.5rem 0.75rem",
                    background: "#fff",
                    border: "1px solid #eee",
                    borderRadius: 6,
                    fontSize: "0.8rem",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(proposal.slots ?? {}, null, 2)}
                </pre>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  style={adminUi.button}
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  disabled={busy}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? "Hide edit" : "Edit"}
                </button>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  disabled={busy}
                  onClick={dismiss}
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : (
            <button type="button" style={adminUi.buttonSecondary} onClick={dismiss}>
              Dismiss
            </button>
          )}
        </section>
      ) : null}

      {result ? (
        <section style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Result</h2>
          <pre
            style={{
              margin: 0,
              padding: "0.75rem",
              background: "#f7f7f7",
              borderRadius: 6,
              fontSize: "0.8rem",
              overflow: "auto",
              maxHeight: 320,
            }}
          >
            {result}
          </pre>
          {notifyNote ? (
            <p style={{ ...adminUi.muted, marginTop: "0.75rem", fontSize: "0.85rem" }}>
              {notifyNote}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default function CopilotPage() {
  return (
    <AdminShell
      title="Copilot"
      subtitle="Plain language → proposed command → Confirm / Edit / Dismiss. Never mutates silently."
      path="/admin/copilot"
    >
      {({ session, ready }) => <CopilotPanel session={session} ready={ready} />}
    </AdminShell>
  );
}
