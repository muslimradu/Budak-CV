import { InlineKeyboard } from "grammy";

/** Label tombol menu utama (inline di bawah pesan). */
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

/** Callback data untuk menu utama & aksi draft. */
export const Cb = {
  menu: {
    cv: "m:cv",
    draft: "m:draft",
    revisi: "m:revisi",
    schedule: "m:sched",
    jobs: "m:jobs",
    send: "m:send",
    followup: "m:follow",
    lang: "m:lang",
    status: "m:status",
    delete: "m:del",
    help: "m:help",
    cancel: "m:cancel",
  },
  send: "d:send",
  cancel: "d:cancel",
  revisi: "d:revisi",
  schedule: "d:sched",
  revisiBack: "r:back",
  field: (f: string) => `r:f:${f}`,
  sapaan: (v: string) => `r:s:${v}`,
} as const;

const MENU_CALLBACK_TO_LABEL: Record<string, MenuButtonLabel> = {
  [Cb.menu.cv]: MenuBtn.cv,
  [Cb.menu.draft]: MenuBtn.draft,
  [Cb.menu.revisi]: MenuBtn.revisi,
  [Cb.menu.schedule]: MenuBtn.schedule,
  [Cb.menu.jobs]: MenuBtn.jobs,
  [Cb.menu.send]: MenuBtn.send,
  [Cb.menu.followup]: MenuBtn.followup,
  [Cb.menu.lang]: MenuBtn.lang,
  [Cb.menu.status]: MenuBtn.status,
  [Cb.menu.delete]: MenuBtn.delete,
  [Cb.menu.help]: MenuBtn.help,
  [Cb.menu.cancel]: MenuBtn.cancel,
};

export function labelForMenuCallback(data: string): MenuButtonLabel | null {
  return MENU_CALLBACK_TO_LABEL[data] ?? null;
}

/** Keyboard inline menu utama (di bawah pesan bot). */
export function mainMenuInline(): InlineKeyboard {
  return new InlineKeyboard()
    .text(MenuBtn.cv, Cb.menu.cv)
    .text(MenuBtn.draft, Cb.menu.draft)
    .row()
    .text(MenuBtn.revisi, Cb.menu.revisi)
    .text(MenuBtn.schedule, Cb.menu.schedule)
    .row()
    .text(MenuBtn.jobs, Cb.menu.jobs)
    .text(MenuBtn.send, Cb.menu.send)
    .row()
    .text(MenuBtn.followup, Cb.menu.followup)
    .text(MenuBtn.lang, Cb.menu.lang)
    .row()
    .text(MenuBtn.status, Cb.menu.status)
    .text(MenuBtn.delete, Cb.menu.delete)
    .row()
    .text(MenuBtn.help, Cb.menu.help)
    .text(MenuBtn.cancel, Cb.menu.cancel);
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

/** Hapus reply keyboard lama (grid bawah layar). */
export const removeReplyKeyboard = {
  remove_keyboard: true as const,
};

/** Attach menu utama inline di bawah pesan. */
export function withMainMenu<T extends Record<string, unknown>>(
  extra: T,
): T & { reply_markup: InlineKeyboard } {
  return { ...extra, reply_markup: mainMenuInline() };
}

/** Attach inline actions under a draft preview reply. */
export function withDraftInline<T extends Record<string, unknown>>(
  extra: T,
): T & { reply_markup: InlineKeyboard } {
  return { ...extra, reply_markup: draftActionsInline() };
}

/** @deprecated use withDraftInline */
export const withDraftConfirmMenu = withDraftInline;
