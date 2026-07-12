import { google } from "googleapis";
import { getAuthorizedClient } from "./auth.js";
import { normalizePlainBody, plainBodyToHtml } from "../utils/emailBody.js";

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function encodeRfc2047(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeBase64Mime(content: string | Buffer): string {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  return buf.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

export async function sendApplicationEmail(input: {
  to: string;
  subject: string;
  body: string;
  cvBuffer: Buffer;
  attachmentFilename?: string;
  fromEmail?: string;
}): Promise<{ messageId: string }> {
  const { client, token } = await getAuthorizedClient();
  const gmail = google.gmail({ version: "v1", auth: client });

  const from = input.fromEmail ?? token.email ?? "me";
  const filename = input.attachmentFilename?.trim() || "CV.pdf";
  const encodedFileName = encodeRfc2047(filename);

  const plainBody = normalizePlainBody(input.body);
  const htmlBody = plainBodyToHtml(plainBody);

  const mixedBoundary = `mixed_${Date.now()}`;
  const altBoundary = `alt_${Date.now()}`;

  // multipart/mixed
  //   multipart/alternative (plain + html)  ← penerima Gmail pakai HTML
  //   application/pdf attachment
  const mime = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Mime(plainBody),
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Mime(htmlBody),
    "",
    `--${altBoundary}--`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${encodedFileName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${encodedFileName}"`,
    "",
    encodeBase64Mime(input.cvBuffer),
    "",
    `--${mixedBoundary}--`,
  ].join("\r\n");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: toBase64Url(mime),
    },
  });

  const messageId = res.data.id;
  if (!messageId) {
    throw new Error("Gmail API tidak mengembalikan message id.");
  }

  return { messageId };
}
