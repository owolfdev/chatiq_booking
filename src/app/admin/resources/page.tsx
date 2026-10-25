"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell, adminUi } from "@/components/admin/AdminShell";
import { executeAdminCommand } from "@/lib/admin/execute";
import type { AdminSession } from "@/lib/admin/session";

type ResourceRow = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  active: boolean;
  sort_order: number;
};

type ServiceRow = {
  id: string;
  slug: string;
  title: string;
  resources?: Array<{ id: string; slug: string; title: string }>;
};

type FormState = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  id: "",
  slug: "",
  title: "",
  kind: "person",
  active: true,
});

function ResourcesPanel({
  session,
  ready,
}: {
  session: AdminSession;
  ready: boolean;
}) {
  const [shapes, setShapes] = useState<string[]>(["appointments"]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [eligibilityServiceId, setEligibilityServiceId] = useState("");
  const [eligibilityIds, setEligibilityIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resourcesEnabled = shapes.includes("resources");

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
      command: "resources.list",
      slots: { include_inactive: true },
    });
    if (!listed.ok) {
      setBusy(false);
      setError(listed.error);
      setResources([]);
      return;
    }
    setResources(
      Array.isArray(listed.data.resources)
        ? (listed.data.resources as ResourceRow[])
        : []
    );

    const svc = await executeAdminCommand({
      session,
      command: "booking.list_services",
      slots: { include_inactive: true },
    });
    setBusy(false);
    if (svc.ok && Array.isArray(svc.data.services)) {
      setServices(svc.data.services as ServiceRow[]);
    }
  }, [ready, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleShape(enabled: boolean) {
    setBusy(true);
    setError(null);
    const next = enabled
      ? ["appointments", "resources"]
      : ["appointments"];
    const result = await executeAdminCommand({
      session,
      command: "availability.set_settings",
      slots: { shapes: next },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function save() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "resources.upsert",
      slots: {
        ...(form.id ? { id: form.id } : {}),
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        title: form.title.trim(),
        kind: form.kind,
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

  async function toggleActive(row: ResourceRow) {
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "resources.set_active",
      slots: { id: row.id, active: !row.active },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  function pickServiceForEligibility(serviceId: string) {
    setEligibilityServiceId(serviceId);
    const svc = services.find((s) => s.id === serviceId);
    setEligibilityIds((svc?.resources ?? []).map((r) => r.id));
  }

  async function saveEligibility() {
    if (!eligibilityServiceId) {
      setError("Pick a service first");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await executeAdminCommand({
      session,
      command: "resources.set_service_eligibility",
      slots: {
        service_id: eligibilityServiceId,
        resource_ids: eligibilityIds,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (!ready) {
    return (
      <p style={adminUi.muted}>Connect to manage resources for this bot.</p>
    );
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
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          Shapes
        </h2>
        <p style={{ ...adminUi.muted, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Enable <code>resources</code> so customers can book a specific
          clinician/room (or anyone eligible). Multi-resource linking (staff +
          room together) is later.
        </p>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={resourcesEnabled}
            disabled={busy}
            onChange={(e) => void toggleShape(e.target.checked)}
          />
          Resources shape enabled
          <span style={adminUi.muted}>
            ({shapes.join(", ") || "appointments"})
          </span>
        </label>
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
          {form.id ? "Edit resource" : "Add resource"}
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
            <label style={adminUi.label}>Kind</label>
            <select
              style={{ ...adminUi.input, width: "100%", fontFamily: "inherit" }}
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="person">person</option>
              <option value="room">room</option>
              <option value="other">other</option>
            </select>
          </div>
          <div style={adminUi.field}>
            <label style={adminUi.label}>Active</label>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.checked }))
                }
              />
              Bookable
            </label>
          </div>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            style={adminUi.button}
            disabled={busy}
            onClick={() => void save()}
          >
            {form.id ? "Save" : "Add"}
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
        </div>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
          Resources ({resources.length})
        </h2>
        {resources.length === 0 ? (
          <p style={adminUi.muted}>No resources yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {resources.map((r) => (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #eee",
                  flexWrap: "wrap",
                }}
              >
                <strong>{r.title}</strong>
                <code style={{ fontSize: "0.8rem" }}>{r.slug}</code>
                <span style={adminUi.muted}>{r.kind}</span>
                <span style={adminUi.muted}>
                  {r.active ? "active" : "inactive"}
                </span>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  disabled={busy}
                  onClick={() =>
                    setForm({
                      id: r.id,
                      slug: r.slug,
                      title: r.title,
                      kind: r.kind,
                      active: r.active,
                    })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  style={adminUi.buttonSecondary}
                  disabled={busy}
                  onClick={() => void toggleActive(r)}
                >
                  {r.active ? "Deactivate" : "Activate"}
                </button>
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
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          Service eligibility
        </h2>
        <p style={{ ...adminUi.muted, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Which resources may deliver each service. Required before customers
          can book when the resources shape is on.
        </p>
        <div style={adminUi.field}>
          <label style={adminUi.label}>Service</label>
          <select
            style={{ ...adminUi.input, width: "100%", maxWidth: 360, fontFamily: "inherit" }}
            value={eligibilityServiceId}
            onChange={(e) => pickServiceForEligibility(e.target.value)}
          >
            <option value="">Select…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        {eligibilityServiceId ? (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                margin: "0.75rem 0",
              }}
            >
              {resources
                .filter((r) => r.active)
                .map((r) => (
                  <label
                    key={r.id}
                    style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={eligibilityIds.includes(r.id)}
                      onChange={(e) => {
                        setEligibilityIds((prev) =>
                          e.target.checked
                            ? [...prev, r.id]
                            : prev.filter((id) => id !== r.id)
                        );
                      }}
                    />
                    {r.title}
                    <span style={adminUi.muted}>({r.kind})</span>
                  </label>
                ))}
            </div>
            <button
              type="button"
              style={adminUi.button}
              disabled={busy}
              onClick={() => void saveEligibility()}
            >
              Save eligibility
            </button>
          </>
        ) : null}
      </section>
    </>
  );
}

export default function AdminResourcesPage() {
  return (
    <AdminShell
      title="Resources"
      subtitle="Clinicians / rooms — enable the resources shape, then link to services."
      path="/admin/resources"
    >
      {({ session, ready }) => (
        <ResourcesPanel session={session} ready={ready} />
      )}
    </AdminShell>
  );
}
