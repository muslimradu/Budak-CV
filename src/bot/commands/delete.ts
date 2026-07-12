import type { Bot } from "grammy";
import {
  deleteAllActiveJobs,
  deleteJobById,
} from "../../services/jobComplete.js";
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

export function registerDeleteCommand(bot: Bot): void {
  bot.command("delete", async (ctx) => {
    const arg = (ctx.match as string | undefined)?.trim().toLowerCase();

    if (!arg) {
      const jobs = await listActiveJobs(10);
      if (jobs.length === 0) {
        await ctx.reply(
          joinBlocks(bold("Hapus lowongan"), "Nggak ada lowongan aktif."),
          replyHtml,
        );
        return;
      }

      const blocks = jobs.map((j) =>
        [
          bold(`#${j.id} · ${escapeHtml(j.position ?? "—")}`),
          `${escapeHtml(j.company ?? "—")} · ${formatWib(j.createdAt)}`,
        ].join("\n"),
      );

      await ctx.reply(
        joinBlocks(
          bold("Mau hapus yang mana?"),
          divider(),
          ...blocks,
          [code("/delete 3"), code("/delete all")].join("\n"),
        ),
        replyHtml,
      );
      return;
    }

    if (arg === "all") {
      const count = await deleteAllActiveJobs();
      await ctx.reply(
        joinBlocks(
          bold(count > 0 ? "Berhasil" : "Hmm"),
          count > 0
            ? `${count} lowongan sudah aku arsipkan.`
            : "Nggak ada lowongan aktif.",
        ),
        replyHtml,
      );
      return;
    }

    const id = Number(arg);
    if (!Number.isInteger(id) || id <= 0) {
      await ctx.reply(
        joinBlocks(
          bold("Cara pakainya"),
          code("/delete"),
          code("/delete 3"),
          code("/delete all"),
        ),
        replyHtml,
      );
      return;
    }

    const ok = await deleteJobById(id);
    await ctx.reply(
      ok
        ? joinBlocks(
            bold("Berhasil"),
            `Lowongan ${code(`#${id}`)} sudah aku hapus.`,
          )
        : joinBlocks(
            bold("Nggak ketemu"),
            `Lowongan ${code(`#${id}`)} nggak ada.`,
          ),
      replyHtml,
    );
  });
}
