"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

type ServiceRow = {
  id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  active: boolean;
  category: string | null;
  sort_order: number;
  description: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  capacity: number;
  max_guests?: number;
  price_cents: number | null;
  currency: string | null;
};

type FormState = {
  id: string;
  slug: string;
  title: string;
  duration_minutes: string;
  category: string;
  description: string;
  buffer_before_minutes: string;
  buffer_after_minutes: string;
  capacity: string;
  max_guests: string;
  price_cents: string;
  currency: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  id: "",
  slug: "",
  title: "",
  duration_minutes: "30",
  category: "",
  description: "",
  buffer_before_minutes: "0",
  buffer_after_minutes: "0",
  capacity: "1",
  max_guests: "2",
  price_cents: "",
  currency: "THB",
  active: true,
});

function formFromService(s: ServiceRow): FormState {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    duration_minutes: String(s.duration_minutes),
    category: s.category ?? "",
    description: s.description ?? "",
    buffer_before_minutes: String(s.buffer_before_minutes ?? 0),
    buffer_after_minutes: String(s.buffer_after_minutes ?? 0),
    capacity: String(s.capacity ?? 1),
    max_guests: String(s.max_guests ?? 2),
    price_cents:
      typeof s.price_cents === "number" ? String(s.price_cents) : "",
    currency: s.currency ?? "THB",
    active: s.active,
  };
}

function ServicesPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "booking.list_services",
      slots: { include_inactive: true },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setServices([]);
      return;
    }
    const rows = Array.isArray(result.data.services)
      ? (result.data.services as ServiceRow[])
      : [];
    setServices(
      [...rows].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.title.localeCompare(b.title)
      )
    );
  }, [ready, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    const duration = Number(form.duration_minutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      setError("Duration must be > 0");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "catalog.upsert_service",
      slots: {
        ...(form.id ? { id: form.id } : {}),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        title: form.title.trim(),
        duration_minutes: duration,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        buffer_before_minutes: Number(form.buffer_before_minutes) || 0,
        buffer_after_minutes: Number(form.buffer_after_minutes) || 0,
        capacity: Math.max(1, Number(form.capacity) || 1),
        max_guests: Math.max(1, Number(form.max_guests) || 2),
        price_cents: form.price_cents.trim()
          ? Number(form.price_cents)
          : null,
        currency: form.currency.trim() || null,
        active: form.active,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(emptyForm());
    await load();
  }

  async function toggleActive(service: ServiceRow) {
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "catalog.set_active",
      slots: { id: service.id, active: !service.active },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function move(service: ServiceRow, direction: -1 | 1) {
    const idx = services.findIndex((s) => s.id === service.id);
    const swap = idx + direction;
    if (idx < 0 || swap < 0 || swap >= services.length) return;
    const ordered = services.map((s) => s.id);
    const tmp = ordered[idx]!;
    ordered[idx] = ordered[swap]!;
    ordered[swap] = tmp;
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "catalog.reorder",
      slots: { ordered_ids: ordered },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (!ready) {
    return <p style={adminUi.muted}>Connect to manage services for this bot.</p>;
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
          {form.id ? "Edit service" : "Add service"}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <div style={adminUi.field}>
            <label style={adminUi.label}>Title</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Slug (optional)</label>
            <input
              style={{ ...adminUi.input, width: "100%" }}
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="auto from title"
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Duration (min)</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.duration_minutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, duration_minutes: e.target.value }))
              }
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Category</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Buffer before</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.buffer_before_minutes}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  buffer_before_minutes: e.target.value,
                }))
              }
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Buffer after</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.buffer_after_minutes}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  buffer_after_minutes: e.target.value,
                }))
              }
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Inventory (rooms of type)</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.capacity}
              onChange={(e) =>
                setForm((f) => ({ ...f, capacity: e.target.value }))
              }
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Max guests / room</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.max_guests}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_guests: e.target.value }))
              }
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Price (cents)</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.price_cents}
              onChange={(e) =>
                setForm((f) => ({ ...f, price_cents: e.target.value }))
              }
              placeholder="optional"
            />
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Currency</label>
            <input
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.currency}
              onChange={(e) =>
                setForm((f) => ({ ...f, currency: e.target.value }))
              }
            />
          </div>
        </div>
        <div style={adminUi.field}>
          <label style={adminUi.label}>Description</label>
          <textarea
            style={{
              ...adminUi.input,
              width: "100%",
              fontFamily: "inherit",
              minHeight: 64,
            }}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </div>
        <label style={{ ...adminUi.label, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) =>
              setForm((f) => ({ ...f, active: e.target.checked }))
            }
          />
          Active (visible to customers)
        </label>
        <div style={{ ...adminUi.row, marginTop: "0.75rem" }}>
          <button
            type="button"
            style={adminUi.button}
            disabled={busy}
            onClick={() => void save()}
          >
            {form.id ? "Save changes" : "Add service"}
          </button>
          {form.id ? (
            <button
              type="button"
              style={adminUi.buttonSecondary}
              disabled={busy}
              onClick={() => setForm(emptyForm())}
            >
              Cancel edit
            </button>
          ) : null}
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

      <div style={{ overflowX: "auto" }}>
        <table style={adminUi.table}>
          <thead>
            <tr>
              <th style={adminUi.th}>Order</th>
              <th style={adminUi.th}>Service</th>
              <th style={adminUi.th}>Duration</th>
              <th style={adminUi.th}>Category</th>
              <th style={adminUi.th}>Status</th>
              <th style={adminUi.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s, i) => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                <td style={adminUi.td}>
                  <button
                    type="button"
                    style={adminUi.buttonSecondary}
                    disabled={busy || i === 0}
                    onClick={() => void move(s, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </button>{" "}
                  <button
                    type="button"
                    style={adminUi.buttonSecondary}
                    disabled={busy || i === services.length - 1}
                    onClick={() => void move(s, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </td>
                <td style={adminUi.td}>
                  <strong>{s.title}</strong>
                  <div style={{ fontSize: "0.8rem", color: "#666" }}>
                    {s.slug}
                  </div>
                </td>
                <td style={adminUi.td}>{s.duration_minutes} min</td>
                <td style={adminUi.td}>{s.category || "—"}</td>
                <td style={adminUi.td}>{s.active ? "Active" : "Inactive"}</td>
                <td style={adminUi.td}>
                  <button
                    type="button"
                    style={adminUi.buttonSecondary}
                    disabled={busy}
                    onClick={() => setForm(formFromService(s))}
                  >
                    Edit
                  </button>{" "}
                  <button
                    type="button"
                    style={adminUi.buttonSecondary}
                    disabled={busy}
                    onClick={() => void toggleActive(s)}
                  >
                    {s.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {services.length === 0 && !busy ? (
          <p style={{ marginTop: "1rem" }}>No services yet — add one above.</p>
        ) : null}
      </div>
    </>
  );
}

export default function AdminServicesPage() {
  return (
    <AdminShell
      path="/admin/services"
      title="Services"
      subtitle="Owner catalog for this bot. Inactive services stay in history but are hidden from customers."
    >
      {({ session, ready }) => (
        <ServicesPanel session={session} ready={ready} />
      )}
    </AdminShell>
  );
}
