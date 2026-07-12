import { google } from "googleapis";
import { env } from "../config.js";
import { prisma } from "../db/prisma.js";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type GmailTokenStore = {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
  email?: string;
};

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

function parseTokenJson(raw: string): GmailTokenStore | null {
  try {
    return JSON.parse(raw) as GmailTokenStore;
  } catch {
    return null;
  }
}

async function ensureUserRow(): Promise<void> {
  await prisma.userSettings.upsert({
    where: { telegramId: env.TELEGRAM_USER_ID },
    create: { telegramId: env.TELEGRAM_USER_ID },
    update: {},
  });
}

/** Seed DB from GMAIL_TOKEN_JSON env when settings have no token yet. */
async function bootstrapTokenFromEnv(): Promise<GmailTokenStore | null> {
  const raw = env.GMAIL_TOKEN_JSON?.trim();
  if (!raw) return null;

  const token = parseTokenJson(raw);
  if (!token?.refresh_token) {
    console.warn(
      "GMAIL_TOKEN_JSON ada tapi tidak valid / tanpa refresh_token — diabaikan.",
    );
    return null;
  }

  await saveToken(token);
  console.log("Gmail token di-bootstrap dari GMAIL_TOKEN_JSON ke database.");
  return token;
}

export async function loadToken(): Promise<GmailTokenStore | null> {
  await ensureUserRow();

  const settings = await prisma.userSettings.findUnique({
    where: { telegramId: env.TELEGRAM_USER_ID },
    select: { gmailTokenJson: true },
  });

  if (settings?.gmailTokenJson) {
    const token = parseTokenJson(settings.gmailTokenJson);
    if (token?.refresh_token) return token;
  }

  return bootstrapTokenFromEnv();
}

export async function saveToken(token: GmailTokenStore): Promise<void> {
  await ensureUserRow();
  await prisma.userSettings.update({
    where: { telegramId: env.TELEGRAM_USER_ID },
    data: {
      gmailTokenJson: JSON.stringify(token),
      ...(token.email ? { gmailEmail: token.email } : {}),
    },
  });
}

export async function getAuthorizedClient() {
  const token = await loadToken();
  if (!token?.refresh_token) {
    throw new Error(
      "Gmail belum terhubung. Jalankan: npm run gmail:auth",
    );
  }

  const client = createOAuth2Client();
  client.setCredentials({
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    expiry_date: token.expiry_date,
    token_type: token.token_type,
    scope: token.scope,
  });

  client.on("tokens", (tokens) => {
    void (async () => {
      const current = (await loadToken()) ?? {};
      const next: GmailTokenStore = {
        ...current,
        access_token: tokens.access_token ?? current.access_token,
        refresh_token: tokens.refresh_token ?? current.refresh_token,
        expiry_date: tokens.expiry_date ?? current.expiry_date,
        token_type: tokens.token_type ?? current.token_type,
        scope: tokens.scope ?? current.scope,
      };
      await saveToken(next);
    })().catch((err) => {
      console.error("Gagal menyimpan refresh token Gmail:", err);
    });
  });

  return { client, token };
}

export function getAuthUrl(client = createOAuth2Client()): string {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SEND_SCOPE],
  });
}
