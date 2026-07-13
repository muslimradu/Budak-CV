import type { Context } from "grammy";
import { listActiveJobs } from "../services/applicationFlow.js";
import {
  bold,
  code,
  divider,
  escapeHtml,
  formatWib,
  joinBlocks,
  replyHtml,
} from "./format.js";
import { withJobsListActions } from "./keyboard.js";
import { getSessionState, setSession } from "./session.js";

type ReplyCtx = {
  reply: (
    text: string,
    extra?: object,
  ) => Promise<{ message_id: number; chat: { id: number } }>;
  api: {
    deleteMessage: (chatId: number, messageId: number) => Promise<unknown>;
  };
  chat?: { id: number } | undefined;
  callbackQuery?: { message?: { message_id: number } | undefined };
};

async function rememberJobsListMessageId(
  telegramId: string,
  messageId: number,
): Promise<void> {
  const state = await getSessionState(telegramId);
  await setSession(telegramId, state.mode, {
    ...state.payload,
    jobsListMessageId: messageId,
  });
}

/** Simpan message_id UI lowongan (list atau ringkasan) untuk dihapus saat refresh. */
export async function rememberJobUiMessage(
  telegramId: string,
  messageId: number,
): Promise<void> {
  await rememberJobsListMessageId(telegramId, messageId);
}

/** Hapus pesan list/ringkasan lowongan (callback + yang tersimpan). */
export async function deleteJobsListMessages(
  ctx: Context | ReplyCtx,
  telegramId: string,
  extraMessageIds: number[] = [],
): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromCallback =
    "callbackQuery" in ctx
      ? ctx.callbackQuery?.message?.message_id
      : undefined;
  const state = await getSessionState(telegramId);
  const remembered = state.payload.jobsListMessageId;

  const ids = new Set<number>(extraMessageIds);
  if (fromCallback) ids.add(fromCallback);
  if (remembered) ids.add(remembered);

  if (!chatId || ids.size === 0) {
    if (remembered) {
      const { jobsListMessageId: _, ...rest } = state.payload;
      await setSession(telegramId, state.mode, rest);
    }
    return;
  }

  for (const messageId of ids) {
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch {
      // Pesan mungkin sudah dihapus / terlalu lama.
    }
  }

  if (remembered) {
    const { jobsListMessageId: _, ...rest } = state.payload;
    await setSession(telegramId, state.mode, rest);
  }
}

/** Kirim daftar lowongan aktif + tombol aksi, lalu ingat message_id. */
export async function sendJobsList(
  ctx: ReplyCtx,
  telegramId: string,
  opts?: {
    notice?: string;
    detailed?: boolean;
  },
): Promise<void> {
  const jobs = await listActiveJobs(10);

  if (jobs.length === 0) {
    const sent = await ctx.reply(
      joinBlocks(
        opts?.notice,
        bold("Belum ada lowongan"),
        "Kirim aja teks, PDF, atau foto lowongannya ke aku.",
      ),
      replyHtml,
    );
    await rememberJobsListMessageId(telegramId, sent.message_id);
    return;
  }

  const blocks = jobs.map((j) => {
    const lines = [
      bold(`#${j.id} · ${escapeHtml(j.position ?? "—")}`),
      `Perusahaan: ${escapeHtml(j.company ?? "—")}`,
      `Email: ${code(j.recruiterEmail ?? "—")}`,
    ];
    if (opts?.detailed) {
      lines.push(
        `Bahasa: ${escapeHtml(j.language)} · ${formatWib(j.createdAt)}`,
      );
    }
    return lines.join("\n");
  });

  const sent = await ctx.reply(
    joinBlocks(
      opts?.notice,
      bold("Lowongan kamu"),
      divider(),
      ...blocks,
      "Pilih aksi di bawah pesan ini.",
    ),
    withJobsListActions(jobs, replyHtml),
  );
  await rememberJobsListMessageId(telegramId, sent.message_id);
}

/**
 * Setelah hapus: buang pesan lama, lalu kirim list terbaru.
 * `deletedJobId` dipakai untuk notice; jika null = hapus semua.
 */
export async function refreshJobsListAfterDelete(
  ctx: Context,
  telegramId: string,
  result: { ok: true; deletedJobId?: number; deletedCount?: number } | { ok: false },
): Promise<void> {
  await deleteJobsListMessages(ctx, telegramId);

  if (!result.ok) {
    await ctx.reply(
      joinBlocks(bold("Nggak ketemu"), "Lowongan itu nggak ada / sudah dihapus."),
      replyHtml,
    );
    return;
  }

  const notice =
    result.deletedCount !== undefined
      ? result.deletedCount > 0
        ? `${result.deletedCount} lowongan sudah aku hapus.`
        : "Nggak ada lowongan aktif."
      : result.deletedJobId !== undefined
        ? `Lowongan ${code(`#${result.deletedJobId}`)} sudah aku hapus.`
        : undefined;

  if (result.deletedCount === 0) {
    await ctx.reply(joinBlocks(bold("Hmm"), notice), replyHtml);
    return;
  }

  await sendJobsList(ctx, telegramId, { notice, detailed: true });
}
