import type { Bot } from "grammy";
import { listRecentApplications } from "../../services/applicationFlow.js";
import {
  bold,
  code,
  divider,
  escapeHtml,
  formatWib,
  joinBlocks,
  replyHtml,
} from "../format.js";

export function registerStatusCommand(bot: Bot): void {
  bot.command("status", async (ctx) => {
    const apps = await listRecentApplications(10);
    if (apps.length === 0) {
      await ctx.reply(
        joinBlocks(bold("Belum ada riwayat"), "Lamaran kamu masih kosong."),
        replyHtml,
      );
      return;
    }

    const blocks = apps.map((a) => {
      const when = a.sentAt ?? a.createdAt;
      return [
        bold(
          `#${a.id} · ${a.status}${a.kind === "followup" ? " · follow-up" : ""}`,
        ),
        `Ke: ${code(a.toEmail ?? "—")}`,
        `Subject: ${escapeHtml(a.subject)}`,
        `Waktu: ${formatWib(when)}`,
      ].join("\n");
    });

    await ctx.reply(
      joinBlocks(bold("Lamaran terakhir kamu"), divider(), ...blocks),
      replyHtml,
    );
  });
}
