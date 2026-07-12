import http from "node:http";
import { URL } from "node:url";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: path.join(rootDir, ".env") });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:53682/oauth2callback";
const telegramUserId = process.env.TELEGRAM_USER_ID;
const databaseUrl = process.env.DATABASE_URL;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}
if (!telegramUserId) {
  console.error("Set TELEGRAM_USER_ID in .env first.");
  process.exit(1);
}
if (!databaseUrl || databaseUrl.startsWith("file:")) {
  console.error(
    "Set DATABASE_URL to a PostgreSQL URL (Railway or local Docker) before gmail:auth.",
  );
  process.exit(1);
}

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const prisma = new PrismaClient();

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [SCOPE],
});

const redirect = new URL(redirectUri);
const port = Number(redirect.port || 53682);
const callbackPath = redirect.pathname || "/oauth2callback";

console.log("\n=== Gmail OAuth setup ===\n");
console.log("1. Buka URL ini di browser (akun Gmail Anda):");
console.log(`\n${authUrl}\n`);
console.log(`2. Setelah login, Google akan redirect ke ${redirectUri}`);
console.log("   Script ini menunggu callback lokal...\n");
console.log("Token akan disimpan ke Postgres (UserSettings.gmailTokenJson).\n");

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname !== callbackPath) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    if (err) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>OAuth error: ${err}</h1>`);
      console.error("OAuth error:", err);
      server.close();
      await prisma.$disconnect();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Missing code</h1>");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let email: string | undefined;
    try {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      email = profile.data.emailAddress ?? undefined;
    } catch {
      email = undefined;
    }

    const tokenStore = {
      ...tokens,
      email,
    };

    await prisma.userSettings.upsert({
      where: { telegramId: telegramUserId },
      create: {
        telegramId: telegramUserId,
        gmailTokenJson: JSON.stringify(tokenStore),
        gmailEmail: email ?? null,
      },
      update: {
        gmailTokenJson: JSON.stringify(tokenStore),
        ...(email ? { gmailEmail: email } : {}),
      },
    });

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h1>Berhasil</h1><p>Gmail terhubung. Anda boleh menutup tab ini dan kembali ke terminal.</p>",
    );

    console.log("Token disimpan ke Postgres (gmailTokenJson).");
    if (email) console.log(`Email: ${email}`);
    else
      console.log(
        "Email profil tidak terbaca (scope send-only). Tetap OK untuk kirim.",
      );
    console.log(
      "\nOpsional untuk Railway: set GMAIL_TOKEN_JSON ke JSON berikut (bootstrap sekali):",
    );
    console.log(JSON.stringify(tokenStore));
    console.log("\nSelesai. Jalankan bot dengan: npm run dev\n");

    server.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("OAuth failed. Check terminal.");
    server.close();
    await prisma.$disconnect();
    process.exit(1);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Listening on http://127.0.0.1:${port}${callbackPath}`);
});
