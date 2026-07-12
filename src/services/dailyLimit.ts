import { prisma } from "../db/prisma.js";
import { env } from "../config.js";

/** Awal hari WIB (UTC+7) sebagai Date UTC. */
function startOfTodayWib(): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = formatter.format(new Date()); // YYYY-MM-DD in WIB
  // WIB midnight = UTC 17:00 previous calendar day
  return new Date(`${day}T00:00:00+07:00`);
}

export async function countEmailsSentToday(): Promise<number> {
  return prisma.application.count({
    where: {
      status: "sent",
      sentAt: { gte: startOfTodayWib() },
    },
  });
}

export async function canSendEmail(): Promise<{
  allowed: boolean;
  sentToday: number;
  limit: number;
}> {
  const sentToday = await countEmailsSentToday();
  const limit = env.MAX_EMAILS_PER_DAY;
  return { allowed: sentToday < limit, sentToday, limit };
}
