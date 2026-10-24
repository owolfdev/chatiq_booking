"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

type Binding = {
  provider: string;
  external_id: string;
  verified: boolean;
  created_at?: string;
};

type Upcoming = {
  id: string;
  status: string;
  starts_at: string | null;
  timezone: string;
  catalog_item_id: string | null;
};

type AuditRow = {
  id: string;
  action: "merge" | "unmerge";
  survivor_contact_id: string;
  merged_contact_id: string;
  actor_type: string;
  actor_id: string | null;
  created_at: string;
  can_unmerge: boolean;
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

function CustomersPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialContact = searchParams.get("contact_id")?.trim() ?? "";

  const [contactInput, setContactInput] = useState(initialContact);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [contact, setContact] = useState<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null>(null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (contactId: string) => {
      const id = contactId.trim();
      if (!id) {
        setError("Paste a contact id from Schedule");
        return;
      }
      setLoading(true);
      setError(null);
      setMsg(null);
      try {
        const [profile, auditRes] = await Promise.all([
          executeAdminCommand({
            session,
            command: "booking.get_customer",
            slots: { contact_id: id },
          }),
          executeAdminCommand({
            session,
            command: "booking.admin_list_identity_audit",
            slots: { contact_id: id, limit: 40 },
          }),
        ]);

        if (!profile.ok) {
          setError(profile.error);
          setContact(null);
          setBindings([]);
          setUpcoming([]);
          setAudit([]);
          setLoadedId(null);
          return;
        }

        const c = profile.data.contact as {
          id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
        };
        setContact(c);
        setBindings((profile.data.bindings as Binding[]) ?? []);
        setUpcoming((profile.data.upcoming_bookings as Upcoming[]) ?? []);
        setLoadedId(c.id);

        if (auditRes.ok) {
          setAudit((auditRes.data.audit as AuditRow[]) ?? []);
        } else {
          setAudit([]);
          setError(`Profile loaded; audit failed: ${auditRes.error}`);
        }

        router.replace(`/admin/customers?contact_id=${encodeURIComponent(id)}`);
      } finally {
        setLoading(false);
      }
    },
    [router, session]
  );

  useEffect(() => {
    if (!ready || !initialContact) return;
    void load(initialContact);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once from URL
  }, [ready, initialContact]);

  async function onUnmerge(row: AuditRow) {
    if (!row.can_unmerge) return;
    if (
      !window.confirm(
        "Unmerge these channel accounts? Bookings that moved in the merge return to the restored contact."
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const result = await executeAdminCommand({
        session,
        command: "booking.admin_unmerge",
        slots: { audit_id: row.id, confirmed: true },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMsg(
        `Unmerged. Restored ${String(result.data.restored_contact_id)} (${String(result.data.restored_bookings)} bookings, ${String(result.data.restored_bindings)} bindings).`
      );
      await load(loadedId || contactInput);
    } finally {
      setBusy(false);
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
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ flex: "1 1 280px" }}>
          <label style={adminUi.label}>Contact id</label>
          <input
            style={adminUi.input}
            value={contactInput}
            onChange={(e) => setContactInput(e.target.value)}
            placeholder="uuid from Schedule detail"
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(contactInput);
            }}
          />
        </div>
        <button
          type="button"
          style={adminUi.button}
          disabled={!ready || loading}
          onClick={() => void load(contactInput)}
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error ? (
        <p style={{ color: "#b00020", marginTop: 0 }}>{error}</p>
      ) : null}
      {msg ? (
        <p style={{ color: "#0a7", marginTop: 0 }}>{msg}</p>
      ) : null}

      {!contact && !loading ? (
        <p style={adminUi.muted}>
          Open a booking on Schedule and use “View customer”, or paste a contact
          id here. Shows channel accounts, upcoming bookings, and identity audit
          (merge / unmerge).
        </p>
      ) : null}

      {contact ? (
        <div
          style={{
            display: "grid",
            gap: "1.25rem",
            gridTemplateColumns: "minmax(0, 1fr)",
          }}
        >
          <section
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>
              Customer
            </h2>
            <dl style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
              <dt style={adminUi.muted}>Name</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {contact.name || "Guest"}
              </dd>
              <dt style={adminUi.muted}>Email</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {contact.email || "—"}
              </dd>
              <dt style={adminUi.muted}>Phone</dt>
              <dd style={{ margin: "0 0 0.5rem" }}>
                {contact.phone || "—"}
              </dd>
              <dt style={adminUi.muted}>Contact id</dt>
              <dd
                style={{
                  margin: 0,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                {contact.id}
                {loadedId && contactInput.trim() && contactInput.trim() !== contact.id
                  ? ` (resolved from ${contactInput.trim()})`
                  : ""}
              </dd>
            </dl>
          </section>

          <section
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>
              Channel accounts
            </h2>
            {bindings.length === 0 ? (
              <p style={{ ...adminUi.muted, margin: 0 }}>No bindings</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={adminUi.th}>Provider</th>
                    <th style={adminUi.th}>External id</th>
                    <th style={adminUi.th}>Verified</th>
                    <th style={adminUi.th}>Linked</th>
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((b) => (
                    <tr key={`${b.provider}:${b.external_id}`}>
                      <td style={adminUi.td}>{b.provider}</td>
                      <td
                        style={{
                          ...adminUi.td,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.8rem",
                          wordBreak: "break-all",
                        }}
                      >
                        {b.external_id}
                      </td>
                      <td style={adminUi.td}>{b.verified ? "yes" : "no"}</td>
                      <td style={adminUi.td}>
                        {b.created_at
                          ? formatWhen(b.created_at, "Asia/Bangkok")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>
              Upcoming bookings
            </h2>
            {upcoming.length === 0 ? (
              <p style={{ ...adminUi.muted, margin: 0 }}>None</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {upcoming.map((b) => (
                  <li key={b.id} style={{ marginBottom: "0.35rem" }}>
                    {formatWhen(b.starts_at, b.timezone)} · {b.status}
                    <span
                      style={{
                        ...adminUi.muted,
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.75rem",
                        marginLeft: 8,
                      }}
                    >
                      {b.id}
                    </span>
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
            <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>
              Identity audit
            </h2>
            {audit.length === 0 ? (
              <p style={{ ...adminUi.muted, margin: 0 }}>
                No merge / unmerge events for this contact.
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={adminUi.th}>When</th>
                    <th style={adminUi.th}>Action</th>
                    <th style={adminUi.th}>Actor</th>
                    <th style={adminUi.th}>Contacts</th>
                    <th style={adminUi.th} />
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td style={adminUi.td}>
                        {formatWhen(row.created_at, "Asia/Bangkok")}
                      </td>
                      <td style={adminUi.td}>{row.action}</td>
                      <td style={adminUi.td}>
                        {row.actor_type}
                        {row.actor_id ? ` · ${row.actor_id}` : ""}
                      </td>
                      <td
                        style={{
                          ...adminUi.td,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.7rem",
                          wordBreak: "break-all",
                        }}
                      >
                        survivor {row.survivor_contact_id}
                        <br />
                        merged {row.merged_contact_id}
                      </td>
                      <td style={adminUi.td}>
                        {row.can_unmerge ? (
                          <button
                            type="button"
                            style={adminUi.buttonSecondary}
                            disabled={busy}
                            onClick={() => void onUnmerge(row)}
                          >
                            Unmerge
                          </button>
                        ) : row.action === "merge" ? (
                          <span style={adminUi.muted}>—</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ ...adminUi.muted, margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
              Unmerge is admin-only and only available for merges that recorded a
              reversible snapshot (new merges). Pre-snapshot merges show “—”;
              clear the tombstone manually if needed.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <AdminShell
      title="Customers"
      subtitle="Channel accounts, identity audit, and admin unmerge."
      path="/admin/customers"
    >
      {({ session, ready }) => (
        <Suspense fallback={<p style={adminUi.muted}>Loading…</p>}>
          <CustomersPanel session={session} ready={ready} />
        </Suspense>
      )}
    </AdminShell>
  );
}
