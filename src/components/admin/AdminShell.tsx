"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/admin/CommandPalette";
import {
  readAdminSession,
  writeAdminSession,
  type AdminSession,
} from "@/lib/admin/session";

const NAV = [
  { href: "/admin", label: "Schedule" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/stays", label: "Stays" },
  { href: "/admin/hours", label: "Hours" },
  { href: "/admin/commands", label: "Commands" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/copilot", label: "Copilot" },
] as const;

const styles = {
  main: { padding: "2rem", maxWidth: 1100, margin: "0 auto" } as const,
  muted: { color: "#666" } as const,
  nav: {
    display: "flex",
    gap: "1rem",
    marginBottom: "1.25rem",
    flexWrap: "wrap" as const,
    alignItems: "center",
  },
  navLink: (active: boolean) =>
    ({
      color: active ? "#111" : "#555",
      fontWeight: active ? 600 : 400,
      textDecoration: active ? "underline" : "none",
    }) as const,
  form: {
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: "1fr 1fr auto",
    marginBottom: "1.5rem",
  } as const,
  input: {
    padding: "0.5rem 0.75rem",
    border: "1px solid #ccc",
    borderRadius: 6,
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.85rem",
  } as const,
  button: {
    padding: "0.5rem 1rem",
    borderRadius: 6,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  } as const,
};

export function AdminShell(props: {
  title: string;
  subtitle?: string;
  path: string;
  children: (ctx: {
    session: AdminSession;
    ready: boolean;
  }) => ReactNode;
}) {
  const [draft, setDraft] = useState<AdminSession>({
    token: "",
    teamId: "",
    botId: "",
  });
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    const stored = readAdminSession();
    setDraft(stored);
    if (stored.token.trim()) setSession(stored);
  }, []);

  const ready = Boolean(session?.token.trim());

  return (
    <main style={styles.main}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/">← ChatIQ Booking</a>
      </p>
      <nav style={styles.nav} aria-label="Admin">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            style={styles.navLink(props.path === item.href)}
          >
            {item.label}
          </a>
        ))}
        <CommandPalette />
      </nav>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.35rem" }}>
        {props.title}
      </h1>
      {props.subtitle ? (
        <p style={{ ...styles.muted, marginBottom: "1.25rem" }}>
          {props.subtitle}
        </p>
      ) : null}

      <form
        style={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          const next: AdminSession = {
            token: draft.token.trim(),
            teamId: draft.teamId.trim(),
            botId: draft.botId.trim(),
          };
          writeAdminSession(next);
          setSession(next);
        }}
      >
        <input
          type="password"
          value={draft.token}
          onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))}
          placeholder="BOOKING_SERVICE_TOKEN"
          style={{ ...styles.input, gridColumn: "1 / -1" }}
          autoComplete="off"
        />
        <input
          type="text"
          value={draft.teamId}
          onChange={(e) => setDraft((d) => ({ ...d, teamId: e.target.value }))}
          placeholder="team_id"
          style={styles.input}
        />
        <input
          type="text"
          value={draft.botId}
          onChange={(e) => setDraft((d) => ({ ...d, botId: e.target.value }))}
          placeholder="bot_id"
          style={styles.input}
        />
        <button type="submit" style={styles.button}>
          Connect
        </button>
      </form>

      {props.children({
        session: session ?? draft,
        ready,
      })}
    </main>
  );
}

export const adminUi = {
  muted: styles.muted,
  input: styles.input,
  button: styles.button,
  buttonSecondary: {
    ...styles.button,
    background: "#fff",
    color: "#111",
  } as const,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.9rem",
  },
  th: { padding: "0.5rem", textAlign: "left" as const, borderBottom: "2px solid #ddd" },
  td: { padding: "0.5rem", borderBottom: "1px solid #eee", verticalAlign: "top" as const },
  error: { color: "#b00020", marginBottom: "1rem" } as const,
  row: { display: "flex", gap: "0.5rem", flexWrap: "wrap" as const, marginBottom: "1rem" },
  label: { display: "block", fontSize: "0.8rem", color: "#555", marginBottom: 4 } as const,
  field: { marginBottom: "0.75rem" } as const,
};
