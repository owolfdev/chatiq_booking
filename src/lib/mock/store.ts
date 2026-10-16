/**
 * In-memory mock persistence for skeleton. Replaced by Supabase later.
 */

export type MockContact = {
  id: string;
  team_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  bindings: Array<{ provider: string; external_id: string; verified: boolean }>;
};

export type MockSession = {
  id: string;
  team_id: string;
  bot_id: string;
  contact_id: string;
  conversation_id: string | null;
  step: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

const contacts = new Map<string, MockContact>();
const sessions = new Map<string, MockSession>();
const bindingIndex = new Map<string, string>(); // `${team}|${provider}|${external_id}` -> contact_id
const sessionByConversation = new Map<string, string>(); // `${team}|${conversation_id}` -> session_id

function bindingKey(teamId: string, provider: string, externalId: string) {
  return `${teamId}|${provider}|${externalId}`;
}

export function resolveOrCreateMockContact(input: {
  team_id: string;
  claims?: Array<{ provider: string; external_id: string; verified?: boolean }>;
  name?: string | null;
}): MockContact {
  const claims = input.claims?.filter((c) => c.provider && c.external_id) ?? [];

  for (const claim of claims) {
    const key = bindingKey(input.team_id, claim.provider, claim.external_id);
    const existingId = bindingIndex.get(key);
    if (existingId) {
      const existing = contacts.get(existingId);
      if (existing) return existing;
    }
  }

  const id = `ctc_mock_${contacts.size + 1}`;
  const contact: MockContact = {
    id,
    team_id: input.team_id,
    name: input.name ?? "Guest",
    email: null,
    phone: null,
    bindings: claims.map((c) => ({
      provider: c.provider,
      external_id: c.external_id,
      verified: Boolean(c.verified),
    })),
  };
  contacts.set(id, contact);
  for (const b of contact.bindings) {
    bindingIndex.set(bindingKey(input.team_id, b.provider, b.external_id), id);
  }
  return contact;
}

export function getOrCreateMockSession(input: {
  team_id: string;
  bot_id: string;
  contact_id: string;
  conversation_id?: string | null;
  session_id?: string | null;
  timezone: string;
}): MockSession {
  if (input.session_id) {
    const existing = sessions.get(input.session_id);
    if (existing) {
      existing.updated_at = new Date().toISOString();
      return existing;
    }
  }

  const conversationKey =
    input.conversation_id?.trim()
      ? `${input.team_id}|${input.conversation_id.trim()}`
      : null;
  if (conversationKey) {
    const existingId = sessionByConversation.get(conversationKey);
    if (existingId) {
      const existing = sessions.get(existingId);
      if (existing) {
        existing.updated_at = new Date().toISOString();
        return existing;
      }
    }
  }

  const id = input.session_id?.trim() || `ses_mock_${sessions.size + 1}`;
  const now = new Date().toISOString();
  const session: MockSession = {
    id,
    team_id: input.team_id,
    bot_id: input.bot_id,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id ?? null,
    step: "stub_welcome",
    timezone: input.timezone,
    created_at: now,
    updated_at: now,
  };
  sessions.set(id, session);
  if (conversationKey) {
    sessionByConversation.set(conversationKey, id);
  }
  return session;
}

export function mockStoreStats() {
  return { contacts: contacts.size, sessions: sessions.size };
}
