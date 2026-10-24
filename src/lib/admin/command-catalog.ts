/**
 * Human-facing catalog of every executable commands-API verb.
 * Source of truth for `/admin/commands` and the ⌘K palette.
 * Keep in sync with EXECUTABLE_COMMANDS in command-execute.ts.
 */

export type CommandActor = "customer" | "staff" | "both";

export type CommandCategory =
  | "booking"
  | "identity"
  | "catalog"
  | "availability";

export type CommandEntry = {
  id: string;
  category: CommandCategory;
  /** Who may call it via the commands API */
  actor: CommandActor;
  mutating: boolean;
  /** Short plain summary */
  summary: string;
  /** Slot keys (required marked with *) */
  slots: string[];
  /** Optional admin UI deep link */
  adminHref?: string;
  keywords?: string[];
};

export const COMMAND_CATALOG: CommandEntry[] = [
  {
    id: "booking.list_services",
    category: "booking",
    actor: "both",
    mutating: false,
    summary: "List services in the bot catalog (staff may include inactive).",
    slots: ["include_inactive?"],
    adminHref: "/admin/services",
    keywords: ["catalog", "menu"],
  },
  {
    id: "booking.search_services",
    category: "booking",
    actor: "both",
    mutating: false,
    summary: "Search services by keyword or category (large catalogs).",
    slots: ["query?", "category?", "limit?"],
    adminHref: "/admin/services",
    keywords: ["find", "search"],
  },
  {
    id: "booking.get_availability",
    category: "booking",
    actor: "both",
    mutating: false,
    summary: "Offer open slots for a service in a date window.",
    slots: [
      "service_id|service_slug*",
      "date_from?",
      "date_to?",
      "time_of_day?",
      "limit?",
    ],
    adminHref: "/admin",
    keywords: ["slots", "times", "calendar"],
  },
  {
    id: "booking.get_existing",
    category: "booking",
    actor: "both",
    mutating: false,
    summary: "Next upcoming open booking for the contact (or none).",
    slots: ["contact_id?"],
    adminHref: "/admin",
    keywords: ["lookup", "upcoming"],
  },
  {
    id: "booking.create",
    category: "booking",
    actor: "both",
    mutating: true,
    summary: "Create a booking at a previously offered starts_at.",
    slots: ["service_id|service_slug*", "starts_at*", "contact_id?"],
    adminHref: "/admin",
    keywords: ["book", "new", "on behalf"],
  },
  {
    id: "booking.cancel",
    category: "booking",
    actor: "both",
    mutating: true,
    summary: "Cancel an open booking (requires confirmed=true).",
    slots: ["booking_id?", "confirmed*"],
    adminHref: "/admin",
    keywords: ["void"],
  },
  {
    id: "booking.reschedule",
    category: "booking",
    actor: "both",
    mutating: true,
    summary: "Cancel then create at a new starts_at (confirmed=true).",
    slots: ["booking_id?", "starts_at*", "confirmed*"],
    adminHref: "/admin",
    keywords: ["move", "change time"],
  },
  {
    id: "booking.mark_no_show",
    category: "booking",
    actor: "staff",
    mutating: true,
    summary: "Mark a booking no-show (frees capacity; past OK).",
    slots: ["booking_id?", "confirmed*"],
    adminHref: "/admin",
    keywords: ["noshow", "missed"],
  },
  {
    id: "booking.get_customer",
    category: "identity",
    actor: "both",
    mutating: false,
    summary: "Contact + channel bindings + upcoming bookings (follows merges).",
    slots: ["contact_id?"],
    adminHref: "/admin/customers",
    keywords: ["profile", "accounts", "bindings"],
  },
  {
    id: "booking.create_connect_token",
    category: "identity",
    actor: "customer",
    mutating: true,
    summary: "Issue a one-time connect token / short code (10 min).",
    slots: [],
    keywords: ["link", "merge", "connect"],
  },
  {
    id: "booking.redeem_connect_token",
    category: "identity",
    actor: "customer",
    mutating: true,
    summary: "Redeem connect token/code at the other door → merge.",
    slots: ["code*"],
    keywords: ["link", "merge", "connect"],
  },
  {
    id: "booking.admin_list_identity_audit",
    category: "identity",
    actor: "staff",
    mutating: false,
    summary: "List merge/unmerge audit rows (can_unmerge when reversible).",
    slots: ["contact_id?", "limit?"],
    adminHref: "/admin/customers",
    keywords: ["audit", "merge history"],
  },
  {
    id: "booking.admin_unmerge",
    category: "identity",
    actor: "staff",
    mutating: true,
    summary: "Reverse a merge from an audit snapshot (confirmed=true).",
    slots: ["audit_id*", "confirmed*"],
    adminHref: "/admin/customers",
    keywords: ["split", "unlink"],
  },
  {
    id: "catalog.upsert_service",
    category: "catalog",
    actor: "staff",
    mutating: true,
    summary: "Create or update a catalog service.",
    slots: [
      "title*",
      "duration_minutes*",
      "slug?",
      "id?",
      "category?",
      "description?",
      "capacity?",
      "buffers?",
      "price_cents?",
    ],
    adminHref: "/admin/services",
    keywords: ["service", "edit"],
  },
  {
    id: "catalog.set_active",
    category: "catalog",
    actor: "staff",
    mutating: true,
    summary: "Activate or deactivate a service.",
    slots: ["service_id|slug*", "active*"],
    adminHref: "/admin/services",
    keywords: ["enable", "disable"],
  },
  {
    id: "catalog.reorder",
    category: "catalog",
    actor: "staff",
    mutating: true,
    summary: "Set sort order for a list of service ids.",
    slots: ["service_ids*"],
    adminHref: "/admin/services",
    keywords: ["sort", "order"],
  },
  {
    id: "availability.get_schedule",
    category: "availability",
    actor: "staff",
    mutating: false,
    summary: "Read bot settings, weekly hours, exceptions, and blocks.",
    slots: [],
    adminHref: "/admin/hours",
    keywords: ["hours", "schedule"],
  },
  {
    id: "availability.set_hours",
    category: "availability",
    actor: "staff",
    mutating: true,
    summary: "Set weekly open windows for a weekday.",
    slots: ["weekday*", "windows*"],
    adminHref: "/admin/hours",
    keywords: ["open", "close"],
  },
  {
    id: "availability.set_exception",
    category: "availability",
    actor: "staff",
    mutating: true,
    summary: "Override hours for a specific date (closed or custom windows).",
    slots: ["date*", "closed?", "windows?"],
    adminHref: "/admin/hours",
    keywords: ["holiday", "override"],
  },
  {
    id: "availability.block",
    category: "availability",
    actor: "staff",
    mutating: true,
    summary: "Block a time range (vacation, maintenance).",
    slots: ["starts_at*", "ends_at*", "reason?"],
    adminHref: "/admin/hours",
    keywords: ["unavailable", "block"],
  },
  {
    id: "availability.unblock",
    category: "availability",
    actor: "staff",
    mutating: true,
    summary: "Remove a block by id.",
    slots: ["block_id*"],
    adminHref: "/admin/hours",
    keywords: ["remove block"],
  },
];

export const ADMIN_NAV_SHORTCUTS: Array<{
  id: string;
  label: string;
  href: string;
  keywords: string[];
}> = [
  {
    id: "nav.schedule",
    label: "Schedule",
    href: "/admin",
    keywords: ["calendar", "bookings", "week"],
  },
  {
    id: "nav.customers",
    label: "Customers",
    href: "/admin/customers",
    keywords: ["identity", "merge", "unmerge"],
  },
  {
    id: "nav.services",
    label: "Services",
    href: "/admin/services",
    keywords: ["catalog"],
  },
  {
    id: "nav.hours",
    label: "Hours",
    href: "/admin/hours",
    keywords: ["availability", "blocks"],
  },
  {
    id: "nav.commands",
    label: "Commands reference",
    href: "/admin/commands",
    keywords: ["palette", "api", "help"],
  },
];

export function actorLabel(actor: CommandActor): string {
  if (actor === "staff") return "Staff only";
  if (actor === "customer") return "Customer";
  return "Customer + staff";
}

export function filterCommands(
  query: string,
  opts?: { actor?: CommandActor | "all"; category?: CommandCategory | "all" }
): CommandEntry[] {
  const q = query.trim().toLowerCase();
  return COMMAND_CATALOG.filter((c) => {
    if (opts?.actor === "staff" && c.actor === "customer") return false;
    if (opts?.actor === "customer" && c.actor === "staff") return false;
    if (opts?.actor === "both" && c.actor !== "both") return false;
    if (opts?.category && opts.category !== "all" && c.category !== opts.category) {
      return false;
    }
    if (!q) return true;
    const hay = [
      c.id,
      c.summary,
      c.category,
      ...(c.keywords ?? []),
      ...c.slots,
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((part) => hay.includes(part));
  });
}

export function filterNavShortcuts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return ADMIN_NAV_SHORTCUTS;
  return ADMIN_NAV_SHORTCUTS.filter((n) => {
    const hay = [n.id, n.label, ...n.keywords].join(" ").toLowerCase();
    return hay.includes(q);
  });
}
