import type { Bot } from "grammy";
import {
  createDraftApplication,
  formatDraftPreview,
} from "../../services/applicationFlow.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";

export function registerDraftCommand(bot: Bot): void {
  bot.command("draft", async (ctx) => {
    const arg = (ctx.match as string | undefined)?.trim();
    let jobId: number | undefined;

    if (arg) {
      const n = Number(arg);
      if (!Number.isInteger(n) || n <= 0) {
        await ctx.reply(
          joinBlocks(
            bold("Cara pakai"),
            code("/draft"),
            code("/draft 3"),
            "Nomor = ID lowongan dari /jobs",
          ),
          replyHtml,
        );
        return;
      }
      jobId = n;
    }

    await ctx.reply(
      joinBlocks(
        bold("Draft"),
        jobId
          ? `Menyusun email untuk lowongan ${code(`#${jobId}`)}…`
          : "Menyusun email untuk lowongan terbaru…",
      ),
      replyHtml,
    );

    try {
      const app = await createDraftApplication(String(ctx.from!.id), jobId);
      const preview = formatDraftPreview(app);
      if (preview.length > 4000) {
        await ctx.reply(preview.slice(0, 4000) + "\n…", replyHtml);
      } else {
        await ctx.reply(preview, replyHtml);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(
        joinBlocks(bold("Gagal membuat draft"), msg),
        replyHtml,
      );
    }
  });
}
