#!/usr/bin/env node
/**
 * Phase 1 exit test — drive the deterministic sibling via the commands API.
 * No LLM involved. Exercises: list_services, get_availability (window +
 * time-of-day + past filtering), create, get_existing, double-book guard,
 * confirmation gate, reschedule, cancel, past-slot rejection.
 *
 * Env (or .env.local in this repo):
 *   BOOKING_SMOKE_BASE_URL  default http://localhost:3003
 *   BOOKING_SERVICE_TOKEN   (or BOOKING_SIBLING_TOKEN)
 *   BOOKING_SMOKE_TEAM_ID   default pilot team
 *   BOOKING_SMOKE_BOT_ID    default pilot bot (booking-system-test-bot)
 *
 * Usage: npm run smoke:commands
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

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function exec(command, slots = {}, identity = smokeIdentity) {
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
      actor: { type: "customer" },
      ...(identity ? { identity_claims: [identity] } : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const stamp = Date.now();
const smokeIdentity = {
  provider: "chatiq_conversation",
  external_id: `smoke-commands-${stamp}`,
  verified: false,
};
const otherIdentity = {
  provider: "chatiq_conversation",
  external_id: `smoke-commands-other-${stamp}`,
  verified: false,
};

function hourInTz(iso) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso))
  );
}

let createdId = null;
try {
  console.log(`Smoke: ${BASE} team=${TEAM} bot=${BOT}`);

  const services = await exec("booking.list_services", {}, null);
  check("list_services ok", services.json.ok === true, JSON.stringify(services.json));
  check("at least one service", (services.json.data?.services?.length ?? 0) >= 1);
  const service = services.json.data?.services?.[0];

  const avail = await exec("booking.get_availability", { service_slug: service?.slug, limit: 3 });
  check("get_availability ok", avail.json.ok === true, JSON.stringify(avail.json));
  const slots = avail.json.data?.slots ?? [];
  check("slots returned (1-5)", slots.length >= 1 && slots.length <= 5, `got ${slots.length}`);
  check(
    "all slots in future",
    slots.every((s) => new Date(s.starts_at).getTime() > Date.now())
  );

  const morning = await exec("booking.get_availability", {
    service_slug: service?.slug,
    time_of_day: "morning",
    limit: 5,
  });
  check(
    "morning filter -> local hours in [5,12)",
    morning.json.ok &&
      (morning.json.data?.slots?.length ?? 0) > 0 &&
      (morning.json.data?.slots ?? []).every((s) => {
        const h = hourInTz(s.starts_at);
        return h >= 5 && h < 12;
      }),
    JSON.stringify(morning.json.data?.slots)
  );

  const evening = await exec("booking.get_availability", {
    service_slug: service?.slug,
    time_of_day: "evening",
    limit: 5,
  });
  // Default hours end 17:00 — evening bucket [17,22) usually empty (success).
  check(
    "evening filter -> ok (often empty under 09–17 hours)",
    evening.json.ok === true,
    JSON.stringify(evening.json.data?.slots)
  );

  const pastWindow = await exec("booking.get_availability", {
    service_slug: service?.slug,
    date_from: "2020-01-06",
    date_to: "2020-01-10",
  });
  check(
    "past window -> empty, not an error",
    pastWindow.json.ok && (pastWindow.json.data?.slots?.length ?? -1) === 0
  );

  const first = slots[0];
  const created = await exec("booking.create", {
    service_slug: service?.slug,
    starts_at: first.starts_at,
  });
  check("create ok", created.json.ok === true, JSON.stringify(created.json));
  createdId = created.json.data?.booking?.id ?? null;
  check("create returns booking id", Boolean(createdId));

  const existing = await exec("booking.get_existing");
  check(
    "get_existing returns the booking",
    existing.json.ok && existing.json.data?.booking?.id === createdId,
    JSON.stringify(existing.json)
  );

  const doubleBook = await exec(
    "booking.create",
    { service_slug: service?.slug, starts_at: first.starts_at },
    otherIdentity
  );
  check(
    "double-book same slot rejected (SLOT_TAKEN)",
    !doubleBook.json.ok && doubleBook.json.code === "SLOT_TAKEN",
    JSON.stringify(doubleBook.json)
  );

  const unconfirmed = await exec("booking.cancel", { booking_id: createdId });
  check(
    "cancel without confirmed=true rejected",
    !unconfirmed.json.ok && unconfirmed.json.code === "CONFIRMATION_REQUIRED",
    JSON.stringify(unconfirmed.json)
  );

  const avail2 = await exec("booking.get_availability", { service_slug: service?.slug, limit: 5 });
  const alternative = (avail2.json.data?.slots ?? []).find((s) => s.starts_at !== first.starts_at);
  check("alternative slot available for reschedule", Boolean(alternative));

  const rescheduled = await exec("booking.reschedule", {
    booking_id: createdId,
    new_starts_at: alternative?.starts_at,
    confirmed: true,
  });
  check("reschedule ok", rescheduled.json.ok === true, JSON.stringify(rescheduled.json));
  check(
    "reschedule moved the time",
    new Date(rescheduled.json.data?.booking?.starts_at).getTime() ===
      new Date(alternative?.starts_at).getTime()
  );
  const newId = rescheduled.json.data?.booking?.id;
  if (newId) createdId = newId;

  const afterReschedule = await exec("booking.get_existing");
  check(
    "get_existing shows rescheduled booking",
    afterReschedule.json.data?.booking?.id === createdId
  );

  const cancelled = await exec("booking.cancel", { booking_id: createdId, confirmed: true });
  check("cancel (confirmed) ok", cancelled.json.ok === true, JSON.stringify(cancelled.json));
  createdId = null;

  const afterCancel = await exec("booking.get_existing");
  check(
    "get_existing empty after cancel",
    afterCancel.json.ok && afterCancel.json.data?.booking === null
  );

  const pastCreate = await exec("booking.create", {
    service_slug: service?.slug,
    starts_at: "2020-01-06T03:00:00.000Z",
  });
  check(
    "create in past rejected (SLOT_IN_PAST)",
    !pastCreate.json.ok && pastCreate.json.code === "SLOT_IN_PAST",
    JSON.stringify(pastCreate.json)
  );
} catch (err) {
  failures += 1;
  console.error("Smoke crashed:", err);
} finally {
  if (createdId) {
    await exec("booking.cancel", { booking_id: createdId, confirmed: true }).catch(() => {});
    console.log("  (cleanup: cancelled leftover smoke booking)");
  }
}

console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures} checks)`);
process.exit(failures === 0 ? 0 : 1);
