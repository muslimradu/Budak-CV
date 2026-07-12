import type { Bot } from "grammy";
import { confirmAndSend } from "../../services/applicationFlow.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";

export function registerSendCommand(bot: Bot): void {
  bot.command("send", async (ctx) => {
    const text = ctx.message?.text ?? "";
    const parts = text.trim().split(/\s+/);
    const email = parts[1];

    if (!email) {
      await ctx.reply(
        joinBlocks(
          bold("Cara pakai"),
          code("/send email@domain.com"),
          "Perintah ini sekaligus mengonfirmasi pengiriman.",
        ),
        replyHtml,
      );
      return;
    }

    await ctx.reply(
      joinBlocks(bold("Mengirim"), `Ke: ${code(email)}`),
      replyHtml,
    );
    const result = await confirmAndSend({ toEmail: email });
    if (result.ok) {
      await ctx.reply(
        joinBlocks(
          bold("Terkirim"),
          `Kepada: ${code(result.to)}`,
          `Message ID: ${code(result.messageId)}`,
        ),
        replyHtml,
      );
    } else {
      await ctx.reply(joinBlocks(bold("Gagal kirim"), result.reason), replyHtml);
    }
  });
}
