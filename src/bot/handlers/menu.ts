import {
  cancelPending,
  confirmAndSend,
  createDraftApplication,
  formatDraftPreview,
  getLastSentApplication,
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
  isConfirmButton,
  isMainMenuButton,
  withDraftConfirmMenu,
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
  await ctx.reply(text, withDraftConfirmMenu(replyHtml));
}

export async function handleMenuButton(
  ctx: {
    from?: { id: number };
    reply: (text: string, extra?: object) => Promise<unknown>;
  },
  label: string,
): Promise<boolean> {
  const text = label.trim();
  if (!isMainMenuButton(text) && !isConfirmButton(text)) return false;

  const telegramId = String(ctx.from!.id);

  if (text === MenuBtn.confirmYes) {
    await ctx.reply(joinBlocks(bold("Mengirim"), "Mohon tunggu…"), replyHtml);
    const result = await confirmAndSend();
    if (result.ok) {
      await ctx.reply(
        joinBlocks(
          bold("Terkirim"),
          `Kepada: ${code(result.to)}`,
          `Message ID: ${code(result.messageId)}`,
        ),
        withMainMenu(replyHtml),
      );
    } else {
      await ctx.reply(
        joinBlocks(bold("Gagal kirim"), result.reason),
        withDraftConfirmMenu(replyHtml),
      );
    }
    return true;
  }

  if (text === MenuBtn.confirmNo || text === MenuBtn.cancel) {
    await setSession(telegramId, "idle");
    const cancelled = await cancelPending();
    await ctx.reply(
      cancelled
        ? joinBlocks(bold("Dibatalkan"), "Draft dibatalkan.")
        : joinBlocks(bold("Info"), "Tidak ada draft yang dibatalkan."),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.help) {
    await setSession(telegramId, "idle");
    await ctx.reply(
      joinBlocks(
        bold("Bantuan cepat"),
        "Pakai tombol di bawah, atau ketik perintah.",
        [
          `${code("/cv")} upload CV`,
          `${code("/draft")} buat email`,
          `${code("/revisi sapaan: Mbak")} ubah draft`,
          `${code("/schedule 18:00")} jadwalkan`,
          `${code("YA")} / ${code("KIRIM")} kirim sekarang`,
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
        "Kirim file PDF CV sekarang.",
        `Batal: ${code("BATAL")} atau tombol ${MenuBtn.cancel}`,
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.draft) {
    await setSession(telegramId, "idle");
    await ctx.reply(
      joinBlocks(bold("Draft"), "Menyusun email untuk lowongan terbaru…"),
      replyHtml,
    );
    try {
      const app = await createDraftApplication(telegramId);
      await replyDraftPreview(ctx, app);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(
        joinBlocks(bold("Gagal membuat draft"), msg),
        withMainMenu(replyHtml),
      );
    }
    return true;
  }

  if (text === MenuBtn.revisi) {
    await ctx.reply(
      joinBlocks(
        bold("Revisi draft"),
        "Ketik langsung, contoh:",
        [
          code("/revisi sapaan: Mbak"),
          code("/revisi nama: Dodit Mulyanto, sapaan: Mas"),
          code(
            "/revisi nama: Dodit, sapaan: Mas, perusahaan: PT Angin Ribut",
          ),
        ].join("\n"),
      ),
      withDraftConfirmMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.schedule) {
    const items = await listScheduledApplications();
    const list =
      items.length === 0
        ? "Belum ada email terjadwal."
        : items
            .map((a) => {
              const when = a.scheduledAt ? formatWib(a.scheduledAt) : "—";
              return `${code(`#${a.id}`)} → ${code(a.toEmail ?? "—")} · ${when}`;
            })
            .join("\n");
    await ctx.reply(
      joinBlocks(
        bold("Jadwal pengiriman"),
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
          bold("Lowongan"),
          "Belum ada lowongan aktif.",
          "Kirim teks, PDF, atau foto lowongan.",
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
        bold("Lowongan aktif"),
        divider(),
        ...blocks,
        `Draft: tombol ${MenuBtn.draft} atau ${code("/draft <id>")}`,
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.send) {
    await ctx.reply(
      joinBlocks(
        bold("Kirim email"),
        "Kalau draft sudah siap: tekan ✅ Ya, kirim atau ketik YA.",
        `Atau set tujuan: ${code("/send email@domain.com")}`,
      ),
      withDraftConfirmMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.followup) {
    const previous = await getLastSentApplication();
    if (!previous) {
      await ctx.reply(
        joinBlocks(
          bold("Follow-up"),
          "Belum ada lamaran terkirim untuk di-follow-up.",
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
        `Lamaran ${code(`#${previous.id}`)} · ${escapeHtml(previous.subject)}`,
        "Kirim konteks follow-up (teks).",
        `Batal: ${code("BATAL")}`,
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
        joinBlocks(bold("Status"), "Belum ada lamaran."),
        withMainMenu(replyHtml),
      );
      return true;
    }
    const blocks = apps.map((a) => {
      const when = a.sentAt ?? a.createdAt;
      return [
        bold(`#${a.id} · ${a.status}`),
        `Kepada: ${code(a.toEmail ?? "—")}`,
        `Subject: ${escapeHtml(a.subject)}`,
        `Waktu: ${formatWib(when)}`,
      ].join("\n");
    });
    await ctx.reply(
      joinBlocks(bold("Lamaran terakhir"), divider(), ...blocks),
      withMainMenu(replyHtml),
    );
    return true;
  }

  if (text === MenuBtn.delete) {
    await ctx.reply(
      joinBlocks(
        bold("Hapus lowongan"),
        [code("/delete"), code("/delete 3"), code("/delete all")].join("\n"),
      ),
      withMainMenu(replyHtml),
    );
    return true;
  }

  return false;
}
