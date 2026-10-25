"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

type ServiceRow = {
  id: string;
  slug: string;
  title: string;
  capacity: number;
  active: boolean;
};

function StaysPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [shapes, setShapes] = useState<string[]>(["appointments"]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const staysEnabled = shapes.includes("stays");

  const load = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const caps = await executeAdminCommand({
      session,
      command: "booking.get_bot_capabilities",
      slots: {},
    });
    if (caps.ok && Array.isArray(caps.data.shapes)) {
      setShapes(caps.data.shapes as string[]);
    }
    const listed = await executeAdminCommand({
      session,
      command: "booking.list_services",
      slots: { include_inactive: true },
    });
    setBusy(false);
    if (!listed.ok) {
      setError(listed.error);
      return;
    }
    setServices(
      Array.isArray(listed.data.services)
        ? (listed.data.services as ServiceRow[])
        : []
    );
  }, [ready, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleStays(enabled: boolean) {
    setBusy(true);
    setError(null);
    // Keep appointments/resources if already on (hotel + spa).
    const next = new Set(shapes.filter((s) => s !== "stays"));
    if (enabled) next.add("stays");
    if (next.size === 0) next.add("appointments");
    const result = await executeAdminCommand({
      session,
      command: "availability.set_settings",
      slots: { shapes: [...next] },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (!ready) {
    return <p style={adminUi.muted}>Connect to manage stays for this bot.</p>;
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
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Stays shape</h2>
        <p style={{ ...adminUi.muted, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Enable overnight booking. Each <strong>Service</strong> is a room type;
          its <strong>capacity</strong> is how many of that type can overlap on the
          same nights. Guests book with check-in / check-out (not clock slots).
        </p>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={staysEnabled}
            disabled={busy}
            onChange={(e) => void toggleStays(e.target.checked)}
          />
          Stays shape enabled
          <span style={adminUi.muted}>({shapes.join(", ") || "—"})</span>
        </label>
      </section>

      <section>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          Room types (from Services)
        </h2>
        <p style={{ ...adminUi.muted, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Edit titles and capacity on the{" "}
          <a href="/admin/services">Services</a> page. Capacity = inventory count
          for overlapping stays of that type.
        </p>
        {services.length === 0 ? (
          <p style={adminUi.muted}>No services yet — add room types under Services.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {services.map((s) => (
              <li
                key={s.id}
                style={{
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <strong>{s.title}</strong>
                <code style={{ fontSize: "0.8rem" }}>{s.slug}</code>
                <span style={adminUi.muted}>capacity {s.capacity}</span>
                <span style={adminUi.muted}>
                  {s.active ? "active" : "inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function AdminStaysPage() {
  return (
    <AdminShell
      title="Stays"
      subtitle="Hotel nights — enable the stays shape; room types live in Services."
      path="/admin/stays"
    >
      {({ session, ready }) => (
        <StaysPanel session={session} ready={ready} />
      )}
    </AdminShell>
  );
}
