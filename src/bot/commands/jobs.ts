import type { Bot } from "grammy";
import { listActiveJobs } from "../../services/applicationFlow.js";
import {
  bold,
  code,
  divider,
  escapeHtml,
  formatWib,
  joinBlocks,
  replyHtml,
} from "../format.js";

export function registerJobsCommand(bot: Bot): void {
  bot.command("jobs", async (ctx) => {
    const jobs = await listActiveJobs(10);
    if (jobs.length === 0) {
      await ctx.reply(
        joinBlocks(
          bold("Belum ada lowongan"),
          "Kirim aja teks, PDF, atau foto lowongannya ke aku.",
        ),
        replyHtml,
      );
      return;
    }

    const blocks = jobs.map((j) => {
      return [
        bold(`#${j.id} · ${escapeHtml(j.position ?? "—")}`),
        `Perusahaan: ${escapeHtml(j.company ?? "—")}`,
        `Email: ${code(j.recruiterEmail ?? "—")}`,
        `Bahasa: ${escapeHtml(j.language)} · ${formatWib(j.createdAt)}`,
      ].join("\n");
    });

    await ctx.reply(
      joinBlocks(
        bold("Lowongan kamu"),
        divider(),
        ...blocks,
        `Mau buat email? ${code("/draft")} atau ${code("/draft <id>")}.`,
      ),
      replyHtml,
    );
  });
}
