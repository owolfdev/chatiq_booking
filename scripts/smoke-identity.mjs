#!/usr/bin/env node
/**
 * Phase 3a exit test — identity & account linking via the commands API.
 * No LLM involved. Exercises: two channel accounts book separately ->
 * connect token issued at one door -> redeemed at the other -> merge ->
 * both doors see both bookings; token reuse rejected; wrong code rejected.
 *
 * Prerequisites: migration 20261023000000_identity_linking.sql applied.
 * Env: same as scripts/smoke-commands.mjs (BOOKING_SMOKE_BASE_URL,
 * BOOKING_SERVICE_TOKEN, BOOKING_SMOKE_TEAM_ID, BOOKING_SMOKE_BOT_ID).
 *
 * Usage: npm run smoke:identity
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

async function exec(command, slots, identity) {
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
      slots: slots ?? {},
      timezone: TZ,
      actor: { type: "customer" },
      identity_claims: [identity],
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const stamp = Date.now();
const lineIdentity = { provider: "line", external_id: `smoke-line-${stamp}`, verified: false };
const webIdentity = { provider: "web_user", external_id: `smoke-web-${stamp}`, verified: false };

const createdBookingIds = [];
try {
  console.log(`Identity smoke: ${BASE} team=${TEAM} bot=${BOT}`);

  // Two doors, two customers, one booking each.
  const availLine = await exec("booking.get_availability", { limit: 5 }, lineIdentity);
  const availWeb = await exec("booking.get_availability", { limit: 5 }, webIdentity);
  const slotA = availLine.json.data?.slots?.[0];
  const slotB = (availWeb.json.data?.slots ?? []).find((s) => s.starts_at !== slotA?.starts_at) ?? availWeb.json.data?.slots?.[1];
  check("availability for both doors", Boolean(slotA && slotB), JSON.stringify({ slotA, slotB }));

  const bookA = await exec("booking.create", { starts_at: slotA.starts_at }, lineIdentity);
  const bookB = await exec("booking.create", { starts_at: slotB.starts_at }, webIdentity);
  check("LINE-side booking created", bookA.json.ok === true, JSON.stringify(bookA.json));
  check("web-side booking created", bookB.json.ok === true, JSON.stringify(bookB.json));
  const idA = bookA.json.data?.booking?.id;
  const idB = bookB.json.data?.booking?.id;
  if (idA) createdBookingIds.push(idA);
  if (idB) createdBookingIds.push(idB);

  const lineCustomer = await exec("booking.get_customer", {}, lineIdentity);
  const webCustomer = await exec("booking.get_customer", {}, webIdentity);
  const lineContactId = lineCustomer.json.data?.contact?.id;
  const webContactId = webCustomer.json.data?.contact?.id;
  check("two distinct customers before link", Boolean(lineContactId && webContactId && lineContactId !== webContactId));
  check(
    "LINE customer sees only own booking",
    (lineCustomer.json.data?.upcoming_bookings ?? []).some((b) => b.id === idA) &&
      !(lineCustomer.json.data?.upcoming_bookings ?? []).some((b) => b.id === idB)
  );

  // Wrong code rejected.
  const wrong = await exec("booking.redeem_connect_token", { code: "000000" }, webIdentity);
  check("wrong code rejected (TOKEN_INVALID)", !wrong.json.ok && wrong.json.code === "TOKEN_INVALID", JSON.stringify(wrong.json));

  // Issue at LINE door, redeem at web door.
  const issued = await exec("booking.create_connect_token", {}, lineIdentity);
  check("connect token issued", issued.json.ok === true && Boolean(issued.json.data?.short_code), JSON.stringify(issued.json));
  check("token expiry ~10 min", Math.abs(new Date(issued.json.data?.expires_at).getTime() - (Date.now() + 10 * 60 * 1000)) < 60_000);

  const redeemed = await exec(
    "booking.redeem_connect_token",
    { code: issued.json.data?.short_code },
    webIdentity
  );
  check("redeem succeeds", redeemed.json.ok === true, JSON.stringify(redeemed.json));
  check("merge not flagged already_linked", redeemed.json.data?.already_linked === false);
  const survivor = redeemed.json.data?.survivor_contact_id;

  // Token reuse rejected.
  const reuse = await exec("booking.redeem_connect_token", { code: issued.json.data?.short_code }, webIdentity);
  check("token reuse rejected (TOKEN_USED)", !reuse.json.ok && reuse.json.code === "TOKEN_USED", JSON.stringify(reuse.json));

  // Both doors now resolve to the survivor and see both bookings.
  const afterLine = await exec("booking.get_customer", {}, lineIdentity);
  const afterWeb = await exec("booking.get_customer", {}, webIdentity);
  check("LINE door resolves to survivor", afterLine.json.data?.contact?.id === survivor, JSON.stringify(afterLine.json.data?.contact));
  check("web door resolves to survivor", afterWeb.json.data?.contact?.id === survivor);
  const providers = (afterWeb.json.data?.bindings ?? []).map((b) => b.provider);
  check("survivor holds both channel bindings", providers.includes("line") && providers.includes("web_user"), providers.join(","));
  const upcomingIds = (afterWeb.json.data?.upcoming_bookings ?? []).map((b) => b.id);
  check("merged customer sees both bookings", upcomingIds.includes(idA) && upcomingIds.includes(idB), upcomingIds.join(","));

  const existing = await exec("booking.get_existing", {}, lineIdentity);
  check("get_existing works from LINE door after merge", existing.json.ok && Boolean(existing.json.data?.booking));
} catch (err) {
  failures += 1;
  console.error("Smoke crashed:", err);
} finally {
  for (const id of createdBookingIds) {
    await exec("booking.cancel", { booking_id: id, confirmed: true }, webIdentity).catch(() => {});
  }
  if (createdBookingIds.length) console.log("  (cleanup: cancelled smoke bookings)");
}

console.log(failures === 0 ? "\nIDENTITY SMOKE PASS" : `\nIDENTITY SMOKE FAIL (${failures} checks)`);
process.exit(failures === 0 ? 0 : 1);
