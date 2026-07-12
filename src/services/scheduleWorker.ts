import type { Bot } from "grammy";
import { env } from "../config.js";
import { processDueScheduledSends } from "./applicationFlow.js";
import { bold, code, joinBlocks, replyHtml } from "../bot/format.js";

const INTERVAL_MS = 30_000;

export function startScheduleWorker(bot: Bot): NodeJS.Timeout {
  console.log(`Schedule worker aktif (cek tiap ${INTERVAL_MS / 1000}s)`);

  return setInterval(() => {
    void (async () => {
      try {
        const results = await processDueScheduledSends();
        for (const { applicationId, result } of results) {
          if (result.ok) {
            await bot.api.sendMessage(
              env.TELEGRAM_USER_ID,
              joinBlocks(
                bold("Jadwal terkirim"),
                `Email ${code(`#${applicationId}`)} sudah aku kirim.`,
                `Ke: ${code(result.to)}`,
                `ID: ${code(result.messageId)}`,
              ),
              replyHtml,
            );
          } else {
            await bot.api.sendMessage(
              env.TELEGRAM_USER_ID,
              joinBlocks(
                bold("Jadwal gagal kirim"),
                `Email ${code(`#${applicationId}`)} gagal aku kirim.`,
                result.reason,
              ),
              replyHtml,
            );
          }
        }
      } catch (error) {
        console.error("Schedule worker error:", error);
      }
    })();
  }, INTERVAL_MS);
}
