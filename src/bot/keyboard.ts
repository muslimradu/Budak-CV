import { InlineKeyboard, Keyboard } from "grammy";

/** Label tombol menu utama (reply keyboard). */
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
} as const;

export type MenuButtonLabel = (typeof MenuBtn)[keyof typeof MenuBtn];

const MAIN_LABELS = new Set<string>(Object.values(MenuBtn));

export function isMainMenuButton(text: string): boolean {
  return MAIN_LABELS.has(text.trim());
}

/** Callback data untuk aksi di bawah draft. */
export const Cb = {
  send: "d:send",
  cancel: "d:cancel",
  revisi: "d:revisi",
  schedule: "d:sched",
  revisiBack: "r:back",
  field: (f: string) => `r:f:${f}`,
  sapaan: (v: string) => `r:s:${v}`,
} as const;

/** Keyboard grid menu utama (2 kolom). */
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

/** Tombol di bawah pesan preview draft (inline — chat tetap full). */
export function draftActionsInline(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Ya, kirim", Cb.send)
    .text("❎ Batal draft", Cb.cancel)
    .row()
    .text("✏️ Revisi", Cb.revisi)
    .text("📅 Jadwal", Cb.schedule);
}

/** Pilih field revisi (inline di bawah pesan). */
export function revisiFieldsInline(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🏷️ Sapaan", Cb.field("sapaan"))
    .text("👤 Nama", Cb.field("nama"))
    .row()
    .text("🏢 Perusahaan", Cb.field("company"))
    .text("💼 Posisi", Cb.field("position"))
    .row()
    .text("📧 Email", Cb.field("email"))
    .text("📝 Subject", Cb.field("subject"))
    .row()
    .text("📄 Body", Cb.field("body"))
    .row()
    .text("« Kembali", Cb.revisiBack);
}

/** Pilihan sapaan cepat. */
export function sapaanInline(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Mas", Cb.sapaan("Mas"))
    .text("Mbak", Cb.sapaan("Mbak"))
    .row()
    .text("Bapak", Cb.sapaan("Bapak"))
    .text("Ibu", Cb.sapaan("Ibu"))
    .row()
    .text("Mr", Cb.sapaan("Mr"))
    .text("Ms", Cb.sapaan("Ms"))
    .row()
    .text("« Kembali", Cb.revisi);
}

export function withMainMenu<T extends Record<string, unknown>>(
  extra: T,
): T & { reply_markup: Keyboard } {
  return { ...extra, reply_markup: mainMenuKeyboard() };
}

/** Attach inline actions under a draft preview reply. */
export function withDraftInline<T extends Record<string, unknown>>(
  extra: T,
): T & { reply_markup: InlineKeyboard } {
  return { ...extra, reply_markup: draftActionsInline() };
}

/** @deprecated use withDraftInline */
export const withDraftConfirmMenu = withDraftInline;
