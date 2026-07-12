import type { Context } from "grammy";
import {
  cancelPending,
  createDraftApplication,
  formatDraftPreview,
  getLastSentApplication,
  getPendingApplication,
  listActiveJobs,
  listRecentApplications,
  listScheduledApplications,
} from "../../services/applicationFlow.js";
import { prisma } from "../../db/prisma.js";
import { formatLanguageLabel } from "../../utils/language.js";
import {
  bold,
  code,
  divider,
  escapeHtml,
  formatWib,
  joinBlocks,
  replyHtml,
} from "../format.js";
import {
  MenuBtn,
  revisiFieldsInline,
  withDraftInline,
  withMainMenu,
} from "../keyboard.js";
import { setSession } from "../session.js";

async function replyDraftPreview(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown> },
  app: Parameters<typeof formatDraftPreview>[0],
): Promise<void> {
  const preview = formatDraftPreview(app);
  const text =
    preview.length > 4000 ? preview.slice(0, 4000) + "\n…" : preview;
  await ctx.reply(text, withDraftInline(replyHtml));
}

export async function showRevisiPicker(ctx: Context): Promise<void> {
  const pending = await getPendingApplication();
  if (!pending) {
    await ctx.reply(
      joinBlocks(
        bold("Belum ada draft"),
        "Buat draft dulu ya, biar ada yang bisa direvisi.",
      ),
      withMainMenu(replyHtml),
    );
    return;
  }
  await ctx.reply(
    joinBlocks(
      bold("Mau ubah bagian mana?"),
      "Pilih di bawah, atau ketik langsung misalnya:",
      code("/revisi sapaan: Mbak"),
    ),
    { ...replyHtml, reply_markup: revisiFieldsInline() },
  );
}

export async function handleMenuButton(
  ctx: Context,
  label: string,
): Promise<boolean> {
  const text = label.trim();
  const telegramId = String(ctx.from!.id);

  if (text === MenuBtn.cancel) {
    await setSession(telegramId, "idle");
    const cancelled = await cancelPending();
    await ctx.reply(
      cancelled
        ? joinBlocks(bold("Oke, dibatalin"), "Draft kamu sudah aku buang.")
        : joinBlocks(bold("Hmm"), "Nggak ada draft yang perlu dibatalin."),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.help) {
    await setSession(telegramId, "idle");
    await ctx.reply(
      joinBlocks(
        bold("Bantuan singkat"),
        "Pakai tombol di bawah, atau ketik perintah ini:",
        [
          `${code("/cv")} — upload CV`,
          `${code("/draft")} — buat email`,
          `${code("/revisi sapaan: Mbak")} — ubah draft`,
          `${code("/schedule 18:00")} — jadwalkan`,
          `${code("YA")} — kirim sekarang`,
        ].join("\n"),
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.cv) {
    await setSession(telegramId, "awaiting_cv");
    await ctx.reply(
      joinBlocks(
        bold("Upload CV"),
        "Kirim PDF CV kamu sekarang ya.",
        `Batal? Ketik ${code("BATAL")}.`,
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.draft) {
    await setSession(telegramId, "idle");
    await ctx.reply(
      joinBlocks(bold("Sebentar…"), "Aku lagi susun email buat lowongan terbaru kamu."),
      replyHtml,
    );
    try {
      const app = await createDraftApplication(telegramId);
      await replyDraftPreview(ctx, app);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(
        joinBlocks(bold("Draft gagal"), msg),
        withMainMenu(replyHtml),
      );
    }
    return true;
  }

  if (text === MenuBtn.revisi) {
    await showRevisiPicker(ctx);
    return true;
  }

  if (text === MenuBtn.schedule) {
    const items = await listScheduledApplications();
    const list =
      items.length === 0
        ? "Belum ada yang dijadwal."
        : items
            .map((a) => {
              const when = a.scheduledAt ? formatWib(a.scheduledAt) : "—";
              return `${code(`#${a.id}`)} → ${code(a.toEmail ?? "—")} · ${when}`;
            })
            .join("\n");
    await ctx.reply(
      joinBlocks(
        bold("Jadwal kamu"),
        list,
        [
          `Contoh: ${code("/schedule 18:00")}`,
          code("/schedule 12/07/2026 18:00"),
          code("/schedule +30m"),
          code("/schedule batal"),
        ].join("\n"),
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.jobs) {
    await setSession(telegramId, "idle");
    const jobs = await listActiveJobs(10);
    if (jobs.length === 0) {
      await ctx.reply(
        joinBlocks(
          bold("Belum ada lowongan"),
          "Kirim aja teks, PDF, atau foto lowongannya ke aku.",
        ),
        withMainMenu(replyHtml),
      );
      return true;
    }
    const blocks = jobs.map((j) =>
      [
        bold(`#${j.id} · ${escapeHtml(j.position ?? "—")}`),
        `Perusahaan: ${escapeHtml(j.company ?? "—")}`,
        `Email: ${code(j.recruiterEmail ?? "—")}`,
      ].join("\n"),
    );
    await ctx.reply(
      joinBlocks(
        bold("Lowongan kamu"),
        divider(),
        ...blocks,
        `Mau draft? Pilih ${MenuBtn.draft} atau ${code("/draft <id>")}.`,
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.send) {
    await ctx.reply(
      joinBlocks(
        bold("Kirim email"),
        "Kalau draft sudah oke, tekan ✅ Ya, kirim di bawah preview — atau ketik YA.",
        `Mau ganti tujuan? ${code("/send email@domain.com")}`,
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.followup) {
    const previous = await getLastSentApplication();
    if (!previous) {
      await ctx.reply(
        joinBlocks(
          bold("Belum bisa follow-up"),
          "Kirim lamaran dulu ya, baru kita follow-upin.",
        ),
        withMainMenu(replyHtml),
      );
      return true;
    }
    await setSession(telegramId, "awaiting_followup", {
      followUpFromApplicationId: previous.id,
    });
    await ctx.reply(
      joinBlocks(
        bold("Follow-up"),
        `Dari lamaran ${code(`#${previous.id}`)} · ${escapeHtml(previous.subject)}`,
        "Tulis aja konteks follow-upnya ke aku.",
        `Batal? Ketik ${code("BATAL")}.`,
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.lang) {
    const settings = await prisma.userSettings.findUnique({
      where: { telegramId },
      select: { emailLanguage: true },
    });
    const current = settings?.emailLanguage ?? "auto";
    await ctx.reply(
      joinBlocks(
        bold("Bahasa email"),
        `Sekarang: ${code(formatLanguageLabel(current))}`,
        [code("/lang auto"), code("/lang en"), code("/lang id")].join("\n"),
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.status) {
    await setSession(telegramId, "idle");
    const apps = await listRecentApplications(10);
    if (apps.length === 0) {
      await ctx.reply(
        joinBlocks(bold("Belum ada riwayat"), "Lamaran kamu masih kosong."),
        withMainMenu(replyHtml),
      );
      return true;
    }
    const blocks = apps.map((a) => {
      const when = a.sentAt ?? a.createdAt;
      return [
        bold(`#${a.id} · ${a.status}`),
        `Ke: ${code(a.toEmail ?? "—")}`,
        `Subject: ${escapeHtml(a.subject)}`,
        `Waktu: ${formatWib(when)}`,
      ].join("\n");
    });
    await ctx.reply(
      joinBlocks(bold("Lamaran terakhir kamu"), divider(), ...blocks),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.delete) {
    await ctx.reply(
      joinBlocks(
        bold("Hapus lowongan"),
        "Pilih salah satu:",
        [code("/delete"), code("/delete 3"), code("/delete all")].join("\n"),
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  return false;
}
