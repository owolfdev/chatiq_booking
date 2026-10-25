#!/usr/bin/env node
/**
 * Multi-resource linking — person + room both free (no LLM).
 *
 * Usage: npm run smoke:resource-linking
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

async function exec(command, slots = {}, actor = { type: "admin", id: "smoke" }, claim = "") {
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
          external_id: `link-smoke-${stamp}${claim}`,
          verified: true,
        },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

try {
  console.log(`Resource linking smoke: ${BASE} bot=${BOT}`);

  await exec("availability.set_settings", {
    shapes: ["appointments", "resources"],
  });
  await exec("availability.set_hours", {
    timezone: TZ,
    hours: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      start_local: "09:00",
      end_local: "17:00",
    })),
  });

  const slug = `link-massage-${stamp}`;
  const svc = await exec("catalog.upsert_service", {
    slug,
    title: "Link Smoke Massage",
    duration_minutes: 60,
    capacity: 1,
  });
  check("upsert service", svc.json.ok, JSON.stringify(svc.json));
  const serviceId = svc.json.data?.service?.id;

  const a = await exec("resources.upsert", {
    slug: `link-a-${stamp}`,
    title: "Link Clinician A",
    kind: "person",
  });
  const b = await exec("resources.upsert", {
    slug: `link-b-${stamp}`,
    title: "Link Clinician B",
    kind: "person",
  });
  const room = await exec("resources.upsert", {
    slug: `link-room1-${stamp}`,
    title: "Link Room 1",
    kind: "room",
  });
  check("upsert clinicians + room", a.json.ok && b.json.ok && room.json.ok);
  const idA = a.json.data?.resource?.id;
  const idB = b.json.data?.resource?.id;
  const idRoom = room.json.data?.resource?.id;

  await exec("resources.set_service_eligibility", {
    service_id: serviceId,
    resource_ids: [idA, idB, idRoom],
  });
  const req = await exec("resources.set_service_requirements", {
    service_id: serviceId,
    require_resource_kinds: ["person", "room"],
  });
  check(
    "require person+room",
    req.json.ok &&
      (req.json.data?.service?.require_resource_kinds ?? []).includes("room"),
    JSON.stringify(req.json)
  );

  const now = new Date();
  const ymd = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const from = ymd(new Date(now.getTime() + 2 * 86_400_000));
  const to = ymd(new Date(now.getTime() + 14 * 86_400_000));

  const avail = await exec(
    "booking.get_availability",
    {
      service_slug: slug,
      date_from: from,
      date_to: to,
      limit: 3,
      resource_preference: "any",
    },
    { type: "customer" }
  );
  const slot0 = avail.json.data?.slots?.[0];
  check(
    "availability returns linked resources on slot",
    avail.json.ok &&
      Array.isArray(slot0?.resources) &&
      slot0.resources.length === 2 &&
      slot0.resources.some((r) => r.kind === "person") &&
      slot0.resources.some((r) => r.kind === "room"),
    JSON.stringify(avail.json)
  );

  const bookA = await exec(
    "booking.create",
    {
      service_slug: slug,
      starts_at: slot0.starts_at,
      resource_id: idA,
      room_id: idRoom,
    },
    { type: "customer" },
    "-a"
  );
  check(
    "create A + Room 1",
    bookA.json.ok &&
      (bookA.json.data?.booking?.resources ?? []).length === 2,
    JSON.stringify(bookA.json)
  );

  // B wants same time + same room → should fail
  const bookBRoom = await exec(
    "booking.create",
    {
      service_slug: slug,
      starts_at: slot0.starts_at,
      resource_id: idB,
      room_id: idRoom,
    },
    { type: "customer" },
    "-b"
  );
  check(
    "B + Room 1 same time rejected",
    !bookBRoom.json.ok && bookBRoom.json.code === "SLOT_TAKEN",
    JSON.stringify(bookBRoom.json)
  );

  // Without pinning room, linker should also find no free room → SLOT_TAKEN
  const bookBAny = await exec(
    "booking.create",
    {
      service_slug: slug,
      starts_at: slot0.starts_at,
      resource_id: idB,
    },
    { type: "customer" },
    "-c"
  );
  check(
    "B any-room same time rejected (only room busy)",
    !bookBAny.json.ok && bookBAny.json.code === "SLOT_TAKEN",
    JSON.stringify(bookBAny.json)
  );

  await exec("availability.set_settings", {
    shapes: ["appointments"],
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll resource-linking smoke checks passed");
} catch (err) {
  console.error(err);
  process.exit(1);
}
