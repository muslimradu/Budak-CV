import type { Context } from "grammy";
import { formatDraftPreview } from "../services/applicationFlow.js";
import { replyHtml } from "./format.js";
import { withDraftInline } from "./keyboard.js";
import { getSessionState, setSession } from "./session.js";

type ReplyCtx = {
  reply: (
    text: string,
    extra?: object,
  ) => Promise<{ message_id: number; chat: { id: number } }>;
  api?: {
    deleteMessage: (chatId: number, messageId: number) => Promise<unknown>;
  };
  chat?: { id: number } | undefined;
  deleteMessage?: () => Promise<unknown>;
};

/** Kirim preview email + simpan message_id agar bisa dihapus saat batal. */
export async function sendDraftPreview(
  ctx: ReplyCtx,
  telegramId: string,
  app: Parameters<typeof formatDraftPreview>[0],
): Promise<void> {
  const preview = formatDraftPreview(app);
  const text =
    preview.length > 4000 ? preview.slice(0, 4000) + "\n…" : preview;
  const sent = await ctx.reply(text, withDraftInline(replyHtml));
  const state = await getSessionState(telegramId);
  await setSession(telegramId, state.mode, {
    ...state.payload,
    draftMessageId: sent.message_id,
  });
}

/** Hapus pesan preview email (dari callback atau yang tersimpan di session). */
export async function deleteDraftPreviewMessage(
  ctx: Context,
  telegramId: string,
): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromCallback = ctx.callbackQuery?.message?.message_id;
  const state = await getSessionState(telegramId);
  const remembered = state.payload.draftMessageId;

  const ids = new Set<number>();
  if (fromCallback) ids.add(fromCallback);
  if (remembered) ids.add(remembered);

  if (!chatId || ids.size === 0) return;

  for (const messageId of ids) {
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch {
      // Pesan mungkin sudah dihapus / terlalu lama.
    }
  }

  if (remembered) {
    const { draftMessageId: _, ...rest } = state.payload;
    await setSession(telegramId, state.mode, rest);
  }
}
