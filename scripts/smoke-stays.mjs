#!/usr/bin/env node
/**
 * Stays shape exit test — night ranges + capacity (no LLM).
 *
 * Usage: npm run smoke:stays
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

async function exec(command, slots = {}, actor = { type: "admin", id: "smoke" }, claimSuffix = "") {
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
          external_id: `stays-smoke-${stamp}${claimSuffix}`,
          verified: true,
        },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function ymdInTz(d, daysAhead = 0) {
  const t = new Date(d.getTime() + daysAhead * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

try {
  console.log(`Stays smoke: ${BASE} bot=${BOT}`);

  const shapesOn = await exec("availability.set_settings", {
    shapes: ["stays"],
  });
  check(
    "enable stays-only shape",
    shapesOn.json.ok &&
      (shapesOn.json.data?.settings?.shapes ?? []).includes("stays"),
    JSON.stringify(shapesOn.json)
  );

  const caps = await exec(
    "booking.get_bot_capabilities",
    {},
    { type: "customer" }
  );
  check(
    "capabilities stays_enabled",
    caps.json.ok && caps.json.data?.stays_enabled === true,
    JSON.stringify(caps.json)
  );

  const slug = `deluxe-${stamp}`;
  const upsert = await exec("catalog.upsert_service", {
    slug,
    title: "Smoke Deluxe",
    duration_minutes: 1440,
    capacity: 2,
  });
  check("upsert room type capacity 2", upsert.json.ok, JSON.stringify(upsert.json));

  const checkIn = ymdInTz(new Date(), 5);
  const checkOut = ymdInTz(new Date(), 7);

  const avail = await exec(
    "booking.get_availability",
    {
      service_slug: slug,
      check_in: checkIn,
      check_out: checkOut,
    },
    { type: "customer" }
  );
  check(
    "availability for exact stay range",
    avail.json.ok &&
      avail.json.data?.shape === "stays" &&
      (avail.json.data?.slots ?? []).length === 1 &&
      avail.json.data.slots[0].remaining === 2,
    JSON.stringify(avail.json)
  );

  const slot = avail.json.data.slots[0];
  const book1 = await exec(
    "booking.create",
    {
      service_slug: slug,
      check_in: checkIn,
      check_out: checkOut,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
    },
    { type: "customer" },
    "-a"
  );
  check(
    "create stay 1",
    book1.json.ok && book1.json.data?.booking?.ends_at,
    JSON.stringify(book1.json)
  );

  const book2 = await exec(
    "booking.create",
    {
      service_slug: slug,
      check_in: checkIn,
      check_out: checkOut,
    },
    { type: "customer" },
    "-b"
  );
  check(
    "create stay 2 (capacity 2)",
    book2.json.ok === true,
    JSON.stringify(book2.json)
  );

  const book3 = await exec(
    "booking.create",
    {
      service_slug: slug,
      check_in: checkIn,
      check_out: checkOut,
    },
    { type: "customer" },
    "-c"
  );
  check(
    "create stay 3 rejected (full)",
    !book3.json.ok && book3.json.code === "SLOT_TAKEN",
    JSON.stringify(book3.json)
  );

  const search = await exec(
    "booking.get_availability",
    {
      service_slug: slug,
      nights: 2,
      date_from: ymdInTz(new Date(), 10),
      date_to: ymdInTz(new Date(), 20),
      limit: 3,
    },
    { type: "customer" }
  );
  check(
    "nights search returns stay offers",
    search.json.ok &&
      (search.json.data?.slots ?? []).length > 0 &&
      search.json.data.slots[0].nights === 2,
    JSON.stringify(search.json)
  );

  await exec("availability.set_settings", {
    shapes: ["appointments"],
  });
  const disabled = await exec(
    "booking.get_availability",
    {
      service_slug: slug,
      check_in: checkIn,
      check_out: checkOut,
    },
    { type: "customer" }
  );
  check(
    "check_in without stays shape → SHAPE_DISABLED",
    !disabled.json.ok && disabled.json.code === "SHAPE_DISABLED",
    JSON.stringify(disabled.json)
  );

  // Restore appointments for pilot
  await exec("availability.set_settings", {
    shapes: ["appointments"],
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll stays smoke checks passed");
} catch (err) {
  console.error(err);
  process.exit(1);
}
