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
import { createHash } from "node:crypto";

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
/** Second allowlisted bot on the same team — simulates consent-page redeem scope ≠ issuing bot. */
const ALT_BOT =
  process.env.BOOKING_SMOKE_ALT_BOT_ID || "c967a5c0-b0dc-489e-b778-835b5c294588";
const TZ = "Asia/Bangkok";

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function exec(command, slots, identity, opts = {}) {
  const res = await fetch(`${BASE}/api/v1/commands/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      contract_version: "0",
      team_id: TEAM,
      bot_id: opts.bot_id ?? BOT,
      command,
      slots: slots ?? {},
      timezone: TZ,
      actor: opts.actor ?? { type: "customer" },
      ...(identity ? { identity_claims: [identity] } : {}),
      ...(opts.contact_profile
        ? { contact_profile: opts.contact_profile }
        : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function execAdmin(command, slots, opts = {}) {
  return exec(command, slots, null, {
    ...opts,
    actor: { type: "admin", id: "smoke-admin" },
  });
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

  const bookA = await exec(
    "booking.create",
    { starts_at: slotA.starts_at },
    lineIdentity,
    { contact_profile: { name: "Smoke LINE Oliver" } }
  );
  const bookB = await exec(
    "booking.create",
    { starts_at: slotB.starts_at },
    webIdentity,
    { contact_profile: { name: "Smoke Web Pat", email: `smoke-web-${stamp}@example.com` } }
  );
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
    "LINE contact enriched with display name",
    lineCustomer.json.data?.contact?.name === "Smoke LINE Oliver",
    JSON.stringify(lineCustomer.json.data?.contact)
  );
  check(
    "web contact enriched with name+email",
    webCustomer.json.data?.contact?.name === "Smoke Web Pat" &&
      webCustomer.json.data?.contact?.email === `smoke-web-${stamp}@example.com`,
    JSON.stringify(webCustomer.json.data?.contact)
  );
  check(
    "LINE customer sees only own booking",
    (lineCustomer.json.data?.upcoming_bookings ?? []).some((b) => b.id === idA) &&
      !(lineCustomer.json.data?.upcoming_bookings ?? []).some((b) => b.id === idB)
  );

  // Wrong code rejected.
  const wrong = await exec("booking.redeem_connect_token", { code: "000000" }, webIdentity);
  check("wrong code rejected (TOKEN_INVALID)", !wrong.json.ok && wrong.json.code === "TOKEN_INVALID", JSON.stringify(wrong.json));

  // Expired code rejected: issue a token, backdate its expiry directly in
  // the DB (service key), then redeem must fail with TOKEN_EXPIRED. Done
  // BEFORE the real issue below because issuing supersedes outstanding
  // tokens. Skipped when Supabase env is unavailable.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SECRET_KEY;
  if (supaUrl && supaKey) {
    const stale = await exec("booking.create_connect_token", {}, lineIdentity);
    const staleCode = stale.json.data?.short_code;
    check("stale token issued for expiry test", stale.json.ok === true && Boolean(staleCode), JSON.stringify(stale.json));
    const codeHash = createHash("sha256").update(String(staleCode)).digest("hex");
    const patch = await fetch(
      `${supaUrl.replace(/\/$/, "")}/rest/v1/connect_tokens?short_code_hash=eq.${codeHash}`,
      {
        method: "PATCH",
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
      }
    );
    const patched = await patch.json().catch(() => []);
    check("stale token backdated in DB", patch.ok && Array.isArray(patched) && patched.length === 1, `status=${patch.status}`);
    const expired = await exec("booking.redeem_connect_token", { code: staleCode }, webIdentity);
    check(
      "expired code rejected (TOKEN_EXPIRED)",
      !expired.json.ok && expired.json.code === "TOKEN_EXPIRED",
      JSON.stringify(expired.json)
    );
  } else {
    console.log("  - expired-token checks skipped (SUPABASE env not set)");
  }

  // Cross-bot full-token redeem (consent page): issue on ALT_BOT, redeem on
  // BOT with the URL token. Short codes stay bot-scoped and are tested below.
  if (ALT_BOT && ALT_BOT !== BOT) {
    const crossStamp = Date.now();
    const crossLine = { provider: "line", external_id: `smoke-xline-${crossStamp}`, verified: false };
    const crossWeb = { provider: "web_user", external_id: `smoke-xweb-${crossStamp}`, verified: true };
    const crossAvail = await exec("booking.get_availability", { limit: 3 }, crossLine, { bot_id: ALT_BOT });
    const crossSlot = crossAvail.json.data?.slots?.[0];
    const crossBook = crossSlot
      ? await exec("booking.create", { starts_at: crossSlot.starts_at }, crossLine, { bot_id: ALT_BOT })
      : { json: { ok: false } };
    const crossBookingId = crossBook.json.data?.booking?.id;
    if (crossBookingId) createdBookingIds.push(crossBookingId);
    const crossIssued = await exec("booking.create_connect_token", {}, crossLine, { bot_id: ALT_BOT });
    const crossToken = crossIssued.json.data?.token;
    check(
      "cross-bot connect token issued",
      crossIssued.json.ok === true && Boolean(crossToken),
      JSON.stringify(crossIssued.json)
    );
    const crossRedeem = await exec(
      "booking.redeem_connect_token",
      { code: crossToken },
      crossWeb,
      { bot_id: BOT }
    );
    check(
      "full token redeems when request bot_id ≠ issuing bot (same team)",
      crossRedeem.json.ok === true,
      JSON.stringify(crossRedeem.json)
    );
  } else {
    console.log("  - cross-bot full-token check skipped (ALT_BOT unset or same as BOT)");
  }

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
  // Survivor prefers verified web; display fields should keep a real name + email.
  const survivorContact = afterWeb.json.data?.contact;
  check(
    "survivor keeps enriched email after merge",
    survivorContact?.email === `smoke-web-${stamp}@example.com`,
    JSON.stringify(survivorContact)
  );
  check(
    "survivor has a real display name (not Guest)",
    Boolean(survivorContact?.name) && survivorContact.name !== "Guest",
    JSON.stringify(survivorContact)
  );

  const existing = await exec("booking.get_existing", {}, lineIdentity);
  check("get_existing works from LINE door after merge", existing.json.ok && Boolean(existing.json.data?.booking));

  // Phase 3b — admin audit + unmerge (requires merge.details snapshot).
  const auditList = await execAdmin("booking.admin_list_identity_audit", {
    contact_id: survivor,
    limit: 10,
  });
  check("admin list identity audit", auditList.json.ok === true, JSON.stringify(auditList.json));
  const mergeRow = (auditList.json.data?.audit ?? []).find(
    (r) => r.action === "merge" && r.can_unmerge === true
  );
  check("merge audit row is unmergeable", Boolean(mergeRow), JSON.stringify(auditList.json.data?.audit?.[0]));

  if (mergeRow) {
    const forbidCustomer = await exec(
      "booking.admin_unmerge",
      { audit_id: mergeRow.id, confirmed: true },
      webIdentity
    );
    check(
      "customer cannot admin_unmerge",
      !forbidCustomer.json.ok && forbidCustomer.json.code === "FORBIDDEN",
      JSON.stringify(forbidCustomer.json)
    );

    const needConfirm = await execAdmin("booking.admin_unmerge", {
      audit_id: mergeRow.id,
    });
    check(
      "unmerge requires confirmed=true",
      !needConfirm.json.ok && needConfirm.json.code === "CONFIRMATION_REQUIRED",
      JSON.stringify(needConfirm.json)
    );

    const unmerged = await execAdmin("booking.admin_unmerge", {
      audit_id: mergeRow.id,
      confirmed: true,
    });
    check("admin unmerge succeeds", unmerged.json.ok === true, JSON.stringify(unmerged.json));
    const restoredId = unmerged.json.data?.restored_contact_id;
    check("restored contact id present", Boolean(restoredId));

    const afterUnmergeLine = await exec("booking.get_customer", {}, lineIdentity);
    const afterUnmergeWeb = await exec("booking.get_customer", {}, webIdentity);
    const lineProviders = (afterUnmergeLine.json.data?.bindings ?? []).map((b) => b.provider);
    const webProviders = (afterUnmergeWeb.json.data?.bindings ?? []).map((b) => b.provider);
    check(
      "after unmerge LINE door no longer sees web binding",
      lineProviders.includes("line") && !lineProviders.includes("web_user"),
      lineProviders.join(",")
    );
    check(
      "after unmerge web door no longer sees LINE binding",
      webProviders.includes("web_user") && !webProviders.includes("line"),
      webProviders.join(",")
    );
    check(
      "doors resolve to different contacts after unmerge",
      afterUnmergeLine.json.data?.contact?.id !== afterUnmergeWeb.json.data?.contact?.id,
      `${afterUnmergeLine.json.data?.contact?.id} vs ${afterUnmergeWeb.json.data?.contact?.id}`
    );

    const auditAfter = await execAdmin("booking.admin_list_identity_audit", {
      contact_id: survivor,
      limit: 10,
    });
    const sameMerge = (auditAfter.json.data?.audit ?? []).find((r) => r.id === mergeRow.id);
    check(
      "merge row no longer unmergeable after unmerge",
      sameMerge && sameMerge.can_unmerge === false,
      JSON.stringify(sameMerge)
    );
  }
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
