#!/usr/bin/env node
/**
 * Resources shape exit test — shapes, eligibility, any vs specific (no LLM).
 *
 * Usage: npm run smoke:resources
 */
import { readFileSync, existsSync } from "node:fs";

function loadDotEnvLocal() {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

const BASE = (process.env.BOOKING_SMOKE_BASE_URL || "http://localhost:3003").replace(
  /\/$/,
  ""
);
const TOKEN =
  process.env.BOOKING_SERVICE_TOKEN || process.env.BOOKING_SIBLING_TOKEN || "";
const TEAM =
  process.env.BOOKING_SMOKE_TEAM_ID || "6eb8602b-b5d7-4544-94b1-429443242378";
const BOT =
  process.env.BOOKING_SMOKE_BOT_ID || "ed98722d-bbad-485d-a187-c54b4429d544";
const TZ = "Asia/Bangkok";
const stamp = Date.now();

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function exec(command, slots = {}, actor = { type: "admin", id: "smoke" }) {
  const res = await fetch(`${BASE}/api/v1/commands/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      contract_version: "0",
      team_id: TEAM,
      bot_id: BOT,
      command,
      slots,
      timezone: TZ,
      actor,
      identity_claims: [
        {
          provider: "smoke",
          external_id: `resources-smoke-${stamp}`,
          verified: true,
        },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

try {
  console.log(`Resources smoke: ${BASE} bot=${BOT}`);

  // Enable resources shape
  const shapesOn = await exec("availability.set_settings", {
    shapes: ["appointments", "resources"],
  });
  check(
    "enable resources shape",
    shapesOn.json.ok === true &&
      (shapesOn.json.data?.settings?.shapes ?? []).includes("resources"),
    JSON.stringify(shapesOn.json)
  );

  const caps = await exec(
    "booking.get_bot_capabilities",
    {},
    { type: "customer" }
  );
  check(
    "get_bot_capabilities shows resources",
    caps.json.ok && caps.json.data?.resources_enabled === true,
    JSON.stringify(caps.json)
  );

  const svcSlug = `smoke-massage-${stamp}`;
  const upsertSvc = await exec("catalog.upsert_service", {
    slug: svcSlug,
    title: "Smoke Massage",
    duration_minutes: 30,
    capacity: 1,
  });
  check("upsert smoke service", upsertSvc.json.ok === true, JSON.stringify(upsertSvc.json));
  const serviceId = upsertSvc.json.data?.service?.id;

  const a = await exec("resources.upsert", {
    slug: `clinician-a-${stamp}`,
    title: "Clinician A",
    kind: "person",
  });
  const b = await exec("resources.upsert", {
    slug: `clinician-b-${stamp}`,
    title: "Clinician B",
    kind: "person",
  });
  check("upsert clinician A", a.json.ok === true, JSON.stringify(a.json));
  check("upsert clinician B", b.json.ok === true, JSON.stringify(b.json));
  const resourceA = a.json.data?.resource?.id;
  const resourceB = b.json.data?.resource?.id;

  const elig = await exec("resources.set_service_eligibility", {
    service_id: serviceId,
    resource_ids: [resourceA, resourceB],
  });
  check(
    "set eligibility both clinicians",
    elig.json.ok === true &&
      (elig.json.data?.resource_ids ?? []).length === 2,
    JSON.stringify(elig.json)
  );

  // Hours Mon–Fri so we have slots
  await exec("availability.set_hours", {
    timezone: TZ,
    hours: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      start_local: "09:00",
      end_local: "17:00",
    })),
  });

  const now = new Date();
  const from = new Date(now.getTime() + 2 * 86_400_000);
  const to = new Date(now.getTime() + 14 * 86_400_000);
  const ymd = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const anyAvail = await exec(
    "booking.get_availability",
    {
      service_slug: svcSlug,
      date_from: ymd(from),
      date_to: ymd(to),
      limit: 3,
      resource_preference: "any",
    },
    { type: "customer" }
  );
  check(
    "availability any returns resource on slots",
    anyAvail.json.ok &&
      (anyAvail.json.data?.slots ?? []).length > 0 &&
      Boolean(anyAvail.json.data.slots[0].resource_id),
    JSON.stringify(anyAvail.json)
  );

  const slotA = anyAvail.json.data.slots[0];
  const bookA = await exec(
    "booking.create",
    {
      service_slug: svcSlug,
      starts_at: slotA.starts_at,
      resource_id: resourceA,
    },
    { type: "customer" }
  );
  check(
    "create with specific clinician A",
    bookA.json.ok === true &&
      bookA.json.data?.booking?.resource_id === resourceA,
    JSON.stringify(bookA.json)
  );

  // Same start with A should conflict; B should still be free
  const conflictA = await exec(
    "booking.create",
    {
      service_slug: svcSlug,
      starts_at: slotA.starts_at,
      resource_id: resourceA,
    },
    {
      type: "customer",
      // force new contact via different claim — reuse actor but new claim in exec
    }
  );
  // Same contact create may hit existing booking path differently; use fresh claim
  const conflictFresh = await fetch(`${BASE}/api/v1/commands/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      contract_version: "0",
      team_id: TEAM,
      bot_id: BOT,
      command: "booking.create",
      slots: {
        service_slug: svcSlug,
        starts_at: slotA.starts_at,
        resource_id: resourceA,
      },
      timezone: TZ,
      actor: { type: "customer" },
      identity_claims: [
        {
          provider: "smoke",
          external_id: `resources-smoke-conflict-${stamp}`,
          verified: true,
        },
      ],
    }),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

  check(
    "same slot+resource A rejected",
    !conflictFresh.json.ok && conflictFresh.json.code === "SLOT_TAKEN",
    JSON.stringify(conflictFresh.json)
  );
  void conflictA;

  const bookB = await fetch(`${BASE}/api/v1/commands/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      contract_version: "0",
      team_id: TEAM,
      bot_id: BOT,
      command: "booking.create",
      slots: {
        service_slug: svcSlug,
        starts_at: slotA.starts_at,
        resource_id: resourceB,
      },
      timezone: TZ,
      actor: { type: "customer" },
      identity_claims: [
        {
          provider: "smoke",
          external_id: `resources-smoke-b-${stamp}`,
          verified: true,
        },
      ],
    }),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

  check(
    "same slot with clinician B succeeds (independent calendars)",
    bookB.json.ok === true &&
      bookB.json.data?.booking?.resource_id === resourceB,
    JSON.stringify(bookB.json)
  );

  const shapeOff = await exec("availability.set_settings", {
    shapes: ["appointments"],
  });
  check("disable resources shape", shapeOff.json.ok === true);

  const disabled = await exec(
    "booking.get_availability",
    {
      service_slug: svcSlug,
      date_from: ymd(from),
      date_to: ymd(to),
      resource_id: resourceA,
    },
    { type: "customer" }
  );
  check(
    "resource_id without shape → SHAPE_DISABLED",
    !disabled.json.ok && disabled.json.code === "SHAPE_DISABLED",
    JSON.stringify(disabled.json)
  );

  // Restore resources for pilot convenience
  await exec("availability.set_settings", {
    shapes: ["appointments", "resources"],
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll resources smoke checks passed");
} catch (err) {
  console.error(err);
  process.exit(1);
}
