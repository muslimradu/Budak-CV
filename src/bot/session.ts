import { prisma } from "../db/prisma.js";

export type SessionMode =
  | "idle"
  | "awaiting_cv"
  | "awaiting_job_complete"
  | "awaiting_followup"
  | "awaiting_delete"
  | "awaiting_revisi_value";

export type JobFieldKey = "position" | "company" | "recruiterEmail";

export type RevisiField =
  | "company"
  | "position"
  | "email"
  | "nama"
  | "sapaan"
  | "subject"
  | "body";

export type SessionPayload = {
  jobId?: number;
  missing?: JobFieldKey[];
  followUpFromApplicationId?: number;
  applicationId?: number;
  revisiField?: RevisiField;
  /** message_id preview email di chat, untuk dihapus saat batal. */
  draftMessageId?: number;
};

export type SessionState = {
  mode: SessionMode;
  payload: SessionPayload;
};

export { looksLikeCvFileName } from "../utils/fileNames.js";

function parsePayload(raw: string | null | undefined): SessionPayload {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return {};
  }
}

export async function getSessionState(
  telegramId: string,
): Promise<SessionState> {
  const settings = await prisma.userSettings.findUnique({
    where: { telegramId },
  });
  if (!settings) return { mode: "idle", payload: {} };

  if (settings.awaitingCv && settings.sessionMode === "idle") {
    return { mode: "awaiting_cv", payload: {} };
  }

  const mode = (settings.sessionMode as SessionMode) || "idle";
  return { mode, payload: parsePayload(settings.sessionJson) };
}

/** @deprecated use getSessionState */
export async function getSession(telegramId: string): Promise<SessionMode> {
  return (await getSessionState(telegramId)).mode;
}

export async function setSession(
  telegramId: string,
  mode: SessionMode,
  payload: SessionPayload = {},
): Promise<void> {
  await prisma.userSettings.upsert({
    where: { telegramId },
    create: {
      telegramId,
      awaitingCv: mode === "awaiting_cv",
      sessionMode: mode,
      sessionJson: JSON.stringify(payload),
    },
    update: {
      awaitingCv: mode === "awaiting_cv",
      sessionMode: mode,
      sessionJson: JSON.stringify(payload),
    },
  });
}

export async function clearSession(telegramId: string): Promise<void> {
  await setSession(telegramId, "idle", {});
}
