import { Keyboard } from "grammy";

/** Label tombol menu utama (harus unik). */
export const MenuBtn = {
  cv: "📄 CV",
  draft: "✉️ Draft",
  revisi: "✏️ Revisi",
  schedule: "📅 Jadwal",
  jobs: "📋 Lowongan",
  send: "📤 Kirim",
  followup: "🔁 Follow-up",
  lang: "🌐 Bahasa",
  status: "📊 Status",
  delete: "🗑️ Hapus",
  help: "❓ Bantuan",
  cancel: "❌ Batal",
  confirmYes: "✅ Ya, kirim",
  confirmNo: "❎ Batal draft",
} as const;

export type MenuButtonLabel = (typeof MenuBtn)[keyof typeof MenuBtn];

const MAIN_LABELS = new Set<string>([
  MenuBtn.cv,
  MenuBtn.draft,
  MenuBtn.revisi,
  MenuBtn.schedule,
  MenuBtn.jobs,
  MenuBtn.send,
  MenuBtn.followup,
  MenuBtn.lang,
  MenuBtn.status,
  MenuBtn.delete,
  MenuBtn.help,
  MenuBtn.cancel,
]);

export function isMainMenuButton(text: string): boolean {
  return MAIN_LABELS.has(text.trim());
}

export function isConfirmButton(text: string): boolean {
  const t = text.trim();
  return t === MenuBtn.confirmYes || t === MenuBtn.confirmNo;
}

/** Keyboard grid ala menu visual (2 kolom). */
export function mainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MenuBtn.cv)
    .text(MenuBtn.draft)
    .row()
    .text(MenuBtn.revisi)
    .text(MenuBtn.schedule)
    .row()
    .text(MenuBtn.jobs)
    .text(MenuBtn.send)
    .row()
    .text(MenuBtn.followup)
    .text(MenuBtn.lang)
    .row()
    .text(MenuBtn.status)
    .text(MenuBtn.delete)
    .row()
    .text(MenuBtn.help)
    .text(MenuBtn.cancel)
    .resized()
    .persistent();
}

/** Tombol cepat setelah preview draft. */
export function draftConfirmKeyboard(): Keyboard {
  return new Keyboard()
    .text(MenuBtn.confirmYes)
    .text(MenuBtn.confirmNo)
    .row()
    .text(MenuBtn.revisi)
    .text(MenuBtn.schedule)
    .row()
    .text(MenuBtn.help)
    .resized()
    .persistent();
}

export function withMainMenu<T extends Record<string, unknown>>(
  extra: T,
): T & { reply_markup: Keyboard } {
  return { ...extra, reply_markup: mainMenuKeyboard() };
}

export function withDraftConfirmMenu<T extends Record<string, unknown>>(
  extra: T,
): T & { reply_markup: Keyboard } {
  return { ...extra, reply_markup: draftConfirmKeyboard() };
}
