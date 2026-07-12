import type { Bot } from "grammy";
import { prisma } from "../../db/prisma.js";
import {
  formatLanguageLabel,
  type EmailLanguagePref,
} from "../../utils/language.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";

const VALID: EmailLanguagePref[] = ["auto", "id", "en"];

export function registerLangCommand(bot: Bot): void {
  bot.command("lang", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    const arg = (ctx.match ?? "").toString().trim().toLowerCase();

    const settings = await prisma.userSettings.findUnique({
      where: { telegramId },
      select: { emailLanguage: true },
    });
    const current = (settings?.emailLanguage ?? "auto") as string;

    if (!arg) {
      await ctx.reply(
        joinBlocks(
          bold("Bahasa email"),
          `Sekarang: ${code(formatLanguageLabel(current))}`,
          [
            `${code("/lang auto")} — ikut bahasa lowongan`,
            `${code("/lang en")} — selalu English`,
            `${code("/lang id")} — selalu Indonesia`,
          ].join("\n"),
        ),
        replyHtml,
      );
      return;
    }

    if (!VALID.includes(arg as EmailLanguagePref)) {
      await ctx.reply(
        joinBlocks(
          bold("Pilihannya belum pas"),
          `Pakai: ${code("/lang auto")} · ${code("/lang en")} · ${code("/lang id")}`,
        ),
        replyHtml,
      );
      return;
    }

    await prisma.userSettings.upsert({
      where: { telegramId },
      create: { telegramId, emailLanguage: arg },
      update: { emailLanguage: arg },
    });

    await ctx.reply(
      joinBlocks(
        bold("Oke, sudah diubah"),
        formatLanguageLabel(arg),
        arg === "auto"
          ? "Email berikutnya ikut bahasa lowongan."
          : `Email berikutnya aku paksa ${arg === "en" ? "English" : "Indonesia"}.`,
      ),
      replyHtml,
    );
  });
}
