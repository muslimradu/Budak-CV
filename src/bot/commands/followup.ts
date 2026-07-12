import type { Bot } from "grammy";
import {
  getApplicationById,
  getLastSentApplication,
} from "../../services/applicationFlow.js";
import { setSession } from "../session.js";
import { bold, code, escapeHtml, joinBlocks, replyHtml } from "../format.js";

async function startFollowUp(
  ctx: {
    from?: { id: number } | undefined;
    reply: (text: string, extra?: object) => Promise<unknown>;
    match?: unknown;
  },
  arg?: string,
): Promise<void> {
  const telegramId = String(ctx.from!.id);
  let appId: number | undefined;

  if (arg?.trim()) {
    const n = Number(arg.trim());
    if (!Number.isInteger(n) || n <= 0) {
      await ctx.reply(
        joinBlocks(
          bold("Cara pakainya"),
          code("/followup"),
          code("/followup 5"),
          "Angka = ID lamaran dari /status (yang sudah terkirim).",
        ),
        replyHtml,
      );
      return;
    }
    appId = n;
  }

  const previous = appId
    ? await getApplicationById(appId)
    : await getLastSentApplication();

  if (!previous || previous.status !== "sent") {
    await ctx.reply(
      joinBlocks(
        bold("Belum bisa follow-up"),
        appId
          ? `Lamaran ${code(`#${appId}`)} belum ada / belum terkirim.`
          : "Kirim lamaran dulu ya, atau pakai /followup <id>.",
      ),
      replyHtml,
    );
    return;
  }

  await setSession(telegramId, "awaiting_followup", {
    followUpFromApplicationId: previous.id,
  });

  await ctx.reply(
    joinBlocks(
      bold("Follow-up"),
      [
        `Dari lamaran ${code(`#${previous.id}`)}`,
        `Posisi: ${escapeHtml(previous.job.position ?? "—")}`,
        `Perusahaan: ${escapeHtml(previous.job.company ?? "—")}`,
        `Subject: ${escapeHtml(previous.subject)}`,
      ].join("\n"),
      "Tulis konteks follow-upnya ke aku, misalnya:",
      code(
        "Sudah 1 minggu sejak lamaran dikirim, ingin menanyakan status seleksi.",
      ),
      `Batal? Ketik ${code("BATAL")}.`,
    ),
    replyHtml,
  );
}

export function registerFollowUpCommand(bot: Bot): void {
  bot.command("followup", async (ctx) => {
    await startFollowUp(ctx, ctx.match as string | undefined);
  });

  bot.hears(/^\/follow[-_]up(?:@\w+)?(?:\s+(\S+))?$/i, async (ctx) => {
    await startFollowUp(ctx, ctx.match?.[1]);
  });
}
