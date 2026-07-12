import type { Bot } from "grammy";
import {
  cancelScheduled,
  listScheduledApplications,
  schedulePending,
} from "../../services/applicationFlow.js";
import { parseScheduleInput } from "../../utils/scheduleParse.js";
import {
  bold,
  code,
  escapeHtml,
  formatWib,
  joinBlocks,
  replyHtml,
} from "../format.js";

export function registerScheduleCommand(bot: Bot): void {
  bot.command("schedule", async (ctx) => {
    const arg = (ctx.match ?? "").toString().trim();
    const lower = arg.toLowerCase();

    if (!arg || lower === "list" || lower === "lihat") {
      const items = await listScheduledApplications();
      if (items.length === 0) {
        await ctx.reply(
          joinBlocks(
            bold("Jadwal pengiriman"),
            "Belum ada email terjadwal.",
            [
              `Contoh: ${code("/schedule 18:00")}`,
              `${code("/schedule 12/07/2026 18:00")}`,
              `${code("/schedule +30m")} · ${code("/schedule +2h")}`,
              `${code("/schedule batal")} — batalkan semua jadwal`,
            ].join("\n"),
          ),
          replyHtml,
        );
        return;
      }

      const lines = items.map((a) => {
        const when = a.scheduledAt ? formatWib(a.scheduledAt) : "—";
        return [
          `${code(`#${a.id}`)} → ${code(a.toEmail ?? "—")}`,
          `${escapeHtml(a.job.position ?? "—")} · ${when}`,
        ].join("\n");
      });

      await ctx.reply(
        joinBlocks(
          bold("Email terjadwal"),
          lines.join("\n\n"),
          `Batalkan: ${code("/schedule batal")} atau ${code("/schedule batal 12")}`,
        ),
        replyHtml,
      );
      return;
    }

    if (lower === "batal" || lower === "cancel") {
      const count = await cancelScheduled();
      await ctx.reply(
        joinBlocks(
          bold(count > 0 ? "Jadwal dibatalkan" : "Info"),
          count > 0
            ? `${count} email terjadwal dibatalkan.`
            : "Tidak ada jadwal aktif.",
        ),
        replyHtml,
      );
      return;
    }

    const batalId = lower.match(/^batal\s+(\d+)$/) ?? lower.match(/^cancel\s+(\d+)$/);
    if (batalId) {
      const id = Number(batalId[1]);
      const count = await cancelScheduled(id);
      await ctx.reply(
        joinBlocks(
          bold(count > 0 ? "Jadwal dibatalkan" : "Tidak ditemukan"),
          count > 0
            ? `Draft ${code(`#${id}`)} dibatalkan.`
            : `Tidak ada jadwal #${id}.`,
        ),
        replyHtml,
      );
      return;
    }

    const parsed = parseScheduleInput(arg);
    if (!parsed.ok) {
      await ctx.reply(
        joinBlocks(bold("Format jadwal salah"), parsed.reason),
        replyHtml,
      );
      return;
    }

    const result = await schedulePending(parsed.at);
    if (!result.ok) {
      await ctx.reply(
        joinBlocks(bold("Gagal menjadwalkan"), result.reason),
        replyHtml,
      );
      return;
    }

    await ctx.reply(
      joinBlocks(
        bold("Terjadwal"),
        `Draft ${code(`#${result.applicationId}`)}`,
        `Kepada: ${code(result.to)}`,
        `Waktu: ${formatWib(result.at)}`,
        `Batalkan: ${code(`/schedule batal ${result.applicationId}`)}`,
      ),
      replyHtml,
    );
  });
}
