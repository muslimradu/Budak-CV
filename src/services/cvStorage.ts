import { prisma } from "../db/prisma.js";
import { extractCvProfile, type CvProfile } from "../llm/extractCv.js";
import { extractTextFromPdf } from "./jobIngest.js";
import { resolveAttachmentFilename } from "../utils/fileNames.js";

export { resolveAttachmentFilename } from "../utils/fileNames.js";

export async function saveDefaultCv(
  telegramId: string,
  buffer: Buffer,
  originalFileName?: string,
): Promise<{ profile: CvProfile; attachmentFilename: string }> {
  const cvText = await extractTextFromPdf(buffer);
  const profile = await extractCvProfile(cvText);
  const originalName = originalFileName?.trim() || null;
  const attachmentFilename = resolveAttachmentFilename(
    originalName,
    profile.fullName,
  );

  const cvBytes = new Uint8Array(buffer);

  await prisma.userSettings.upsert({
    where: { telegramId },
    create: {
      telegramId,
      defaultCvBytes: cvBytes,
      defaultCvOriginalName: originalName,
      applicantFullName: profile.fullName,
      cvProfileJson: JSON.stringify(profile),
      awaitingCv: false,
    },
    update: {
      defaultCvBytes: cvBytes,
      defaultCvOriginalName: originalName,
      applicantFullName: profile.fullName,
      cvProfileJson: JSON.stringify(profile),
      awaitingCv: false,
    },
  });

  return { profile, attachmentFilename };
}

export async function hasDefaultCv(telegramId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({
    where: { telegramId },
    select: { defaultCvBytes: true },
  });
  return Boolean(settings?.defaultCvBytes);
}

export async function getDefaultCvBuffer(
  telegramId: string,
): Promise<Buffer | null> {
  const settings = await prisma.userSettings.findUnique({
    where: { telegramId },
    select: { defaultCvBytes: true },
  });
  if (!settings?.defaultCvBytes) return null;
  return Buffer.from(settings.defaultCvBytes);
}

export async function getCvContext(telegramId: string): Promise<{
  cvBuffer: Buffer;
  profile: CvProfile;
  originalName: string | null;
  attachmentFilename: string;
}> {
  const settings = await prisma.userSettings.findUnique({
    where: { telegramId },
  });
  if (!settings?.defaultCvBytes) {
    throw new Error("Belum ada CV default. Upload dulu dengan /cv");
  }

  const cvBuffer = Buffer.from(settings.defaultCvBytes);

  let profile: CvProfile | null = null;
  if (settings.cvProfileJson) {
    try {
      profile = JSON.parse(settings.cvProfileJson) as CvProfile;
    } catch {
      profile = null;
    }
  }

  if (!profile?.fullName) {
    const cvText = await extractTextFromPdf(cvBuffer);
    profile = await extractCvProfile(cvText);
    await prisma.userSettings.update({
      where: { telegramId },
      data: {
        applicantFullName: profile.fullName,
        cvProfileJson: JSON.stringify(profile),
      },
    });
  }

  const originalName = settings.defaultCvOriginalName;
  return {
    cvBuffer,
    profile,
    originalName,
    attachmentFilename: resolveAttachmentFilename(
      originalName,
      profile.fullName ?? settings.applicantFullName,
    ),
  };
}
