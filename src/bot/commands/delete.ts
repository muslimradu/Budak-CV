import type { Bot } from "grammy";
import {
  deleteAllActiveJobs,
  deleteJobById,
} from "../../services/jobComplete.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";
import {
  deleteJobsListMessages,
  refreshJobsListAfterDelete,
  sendJobsList,
} from "../jobsList.js";

export function registerDeleteCommand(bot: Bot): void {
  bot.command("delete", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    const arg = (ctx.match as string | undefined)?.trim().toLowerCase();

    if (!arg) {
      await deleteJobsListMessages(ctx, telegramId);
      await sendJobsList(ctx, telegramId, {
        notice: `Mau hapus? Ketik ${code("/delete 3")} · ${code("/delete all")} — atau pakai tombol di bawah.`,
        detailed: true,
      });
      return;
    }

    if (arg === "all") {
      const count = await deleteAllActiveJobs();
      await refreshJobsListAfterDelete(ctx, telegramId, {
        ok: true,
        deletedCount: count,
      });
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
    await refreshJobsListAfterDelete(
      ctx,
      telegramId,
      ok ? { ok: true, deletedJobId: id } : { ok: false },
    );
  });
}
