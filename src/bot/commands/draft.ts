import type { Bot } from "grammy";
import { createDraftApplication } from "../../services/applicationFlow.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";
import { sendDraftPreview } from "../draftPreview.js";

export function registerDraftCommand(bot: Bot): void {
  bot.command("draft", async (ctx) => {
    const arg = (ctx.match as string | undefined)?.trim();
    let jobId: number | undefined;

    if (arg) {
      const n = Number(arg);
      if (!Number.isInteger(n) || n <= 0) {
        await ctx.reply(
          joinBlocks(
            bold("Cara pakainya"),
            code("/draft"),
            code("/draft 3"),
            "Angka = ID lowongan dari daftar kamu.",
          ),
          replyHtml,
        );
        return;
      }
      jobId = n;
    }

    await ctx.reply(
      joinBlocks(
        bold("Sebentar…"),
        jobId
          ? `Aku susun email buat lowongan ${code(`#${jobId}`)}.`
          : "Aku susun email buat lowongan terbaru kamu.",
      ),
      replyHtml,
    );

    try {
      const app = await createDraftApplication(String(ctx.from!.id), jobId);
      await sendDraftPreview(ctx, String(ctx.from!.id), app);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(joinBlocks(bold("Gagal buat email"), msg), replyHtml);
    }
  });
}
