/** Browser session keys for pilot admin console. */

export const ADMIN_TOKEN_KEY = "chatiq_booking_admin_token";
export const ADMIN_TEAM_KEY = "chatiq_booking_admin_team";
export const ADMIN_BOT_KEY = "chatiq_booking_admin_bot";

/** Pilot defaults (booking-system-test-bot). */
export const DEFAULT_ADMIN_TEAM_ID = "6eb8602b-b5d7-4544-94b1-429443242378";
export const DEFAULT_ADMIN_BOT_ID = "ed98722d-bbad-485d-a187-c54b4429d544";

export type AdminSession = {
  token: string;
  teamId: string;
  botId: string;
};

export function readAdminSession(): AdminSession {
  if (typeof window === "undefined") {
    return {
      token: "",
      teamId: DEFAULT_ADMIN_TEAM_ID,
      botId: DEFAULT_ADMIN_BOT_ID,
    };
  }
  return {
    token: sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
    teamId:
      sessionStorage.getItem(ADMIN_TEAM_KEY) ?? DEFAULT_ADMIN_TEAM_ID,
    botId: sessionStorage.getItem(ADMIN_BOT_KEY) ?? DEFAULT_ADMIN_BOT_ID,
  };
}

export function writeAdminSession(session: AdminSession) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, session.token);
  sessionStorage.setItem(ADMIN_TEAM_KEY, session.teamId);
  sessionStorage.setItem(ADMIN_BOT_KEY, session.botId);
}
