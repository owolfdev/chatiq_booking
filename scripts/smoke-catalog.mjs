#!/usr/bin/env node
/**
 * Phase 3b.0 exit test — catalog + hours via commands API (no LLM).
 *
 * Usage: npm run smoke:catalog
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

const BASE = (process.env.BOOKING_SMOKE_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const TOKEN = process.env.BOOKING_SERVICE_TOKEN || process.env.BOOKING_SIBLING_TOKEN || "";
const TEAM = process.env.BOOKING_SMOKE_TEAM_ID || "6eb8602b-b5d7-4544-94b1-429443242378";
const BOT = process.env.BOOKING_SMOKE_BOT_ID || "ed98722d-bbad-485d-a187-c54b4429d544";
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
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

try {
  console.log(`Catalog/hours smoke: ${BASE} bot=${BOT}`);

  const denied = await exec(
    "catalog.upsert_service",
    { title: "Nope", duration_minutes: 30 },
    { type: "customer" }
  );
  check(
    "customer cannot upsert catalog (FORBIDDEN)",
    !denied.json.ok && denied.json.code === "FORBIDDEN",
    JSON.stringify(denied.json)
  );

  const slug = `smoke-cut-${stamp}`;
  const upsert = await exec("catalog.upsert_service", {
    slug,
    title: "Smoke Haircut",
    duration_minutes: 45,
    category: "Hair",
    buffer_after_minutes: 15,
    capacity: 1,
  });
  check("catalog.upsert_service creates service", upsert.json.ok === true, JSON.stringify(upsert.json));
  const serviceId = upsert.json.data?.service?.id;

  const listed = await exec("booking.list_services", {}, { type: "customer" });
  check(
    "list_services includes new service",
    (listed.json.data?.services ?? []).some((s) => s.slug === slug),
    JSON.stringify(listed.json.data?.services?.map((s) => s.slug))
  );

  const searched = await exec(
    "booking.search_services",
    { query: "haircut", category: "Hair" },
    { type: "customer" }
  );
  check(
    "search_services finds by keyword+category",
    (searched.json.data?.services ?? []).some((s) => s.slug === slug),
    JSON.stringify(searched.json)
  );

  const hours = await exec("availability.set_hours", {
    timezone: TZ,
    hours: [
      { weekday: 1, start_local: "10:00", end_local: "12:00" },
      { weekday: 2, start_local: "10:00", end_local: "12:00" },
      { weekday: 3, start_local: "10:00", end_local: "12:00" },
      { weekday: 4, start_local: "10:00", end_local: "12:00" },
      { weekday: 5, start_local: "10:00", end_local: "12:00" },
    ],
  });
  check("availability.set_hours Mon–Fri 10–12", hours.json.ok === true && (hours.json.data?.hours?.length ?? 0) === 5);

  const schedule = await exec("availability.get_schedule", {});
  check("availability.get_schedule returns hours", (schedule.json.data?.hours?.length ?? 0) >= 5);

  // Pick next weekday Mon–Fri for availability window
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

  const avail = await exec(
    "booking.get_availability",
    {
      service_slug: slug,
      date_from: ymd(from),
      date_to: ymd(to),
      time_of_day: "morning",
      limit: 5,
    },
    { type: "customer" }
  );
  check(
    "get_availability returns morning slots inside hours",
    avail.json.ok === true && (avail.json.data?.slots?.length ?? 0) > 0,
    JSON.stringify(avail.json)
  );

  const closedDate = ymd(from);
  const exception = await exec("availability.set_exception", {
    on_date: closedDate,
    closed: true,
    note: "smoke closed",
  });
  check("set_exception closed day", exception.json.ok === true);

  const availClosed = await exec(
    "booking.get_availability",
    {
      service_slug: slug,
      date_from: closedDate,
      date_to: closedDate,
      limit: 5,
    },
    { type: "customer" }
  );
  check(
    "closed exception yields zero slots that day",
    availClosed.json.ok === true && (availClosed.json.data?.slots?.length ?? 0) === 0,
    JSON.stringify(availClosed.json)
  );

  const deactivate = await exec("catalog.set_active", {
    slug,
    active: false,
  });
  check("catalog.set_active deactivates", deactivate.json.ok === true && deactivate.json.data?.service?.active === false);

  const listedAfter = await exec("booking.list_services", {}, { type: "customer" });
  check(
    "inactive service hidden from customers",
    !(listedAfter.json.data?.services ?? []).some((s) => s.slug === slug)
  );

  // Restore default-ish hours for pilot bot so other smokes keep working.
  await exec("availability.set_hours", {
    hours: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      start_local: "09:00",
      end_local: "17:00",
    })),
  });
} catch (err) {
  failures += 1;
  console.error("Smoke crashed:", err);
}

console.log(failures === 0 ? "\nCATALOG SMOKE PASS" : `\nCATALOG SMOKE FAIL (${failures} checks)`);
process.exit(failures === 0 ? 0 : 1);
