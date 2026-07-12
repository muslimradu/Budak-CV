# Bot Telegram Lamaran Kerja via Gmail

Bot pribadi (single-user) untuk membuat dan mengirim email lamaran kerja lewat Gmail Anda. Alur: upload CV → kirim lowongan → `/draft` → konfirmasi eksplisit → kirim.

**Safety:** bot tidak pernah auto-send. Maksimal 10 email/hari. Setiap percobaan kirim dicatat di audit log.

## Stack

- TypeScript (Node.js) + `tsx`
- Telegram: [grammY](https://grammy.dev) (polling)
- **PostgreSQL** via Prisma (CV + Gmail token disimpan di DB)
- Gmail API OAuth2 (`gmail.send`)
- LLM: Claude (Anthropic) — fallback Groq via `LLM_PROVIDER`

## Setup lokal cepat

1. Postgres berjalan (Docker contoh di bawah, atau Railway Postgres)
2. Salin env dan isi:

```bash
cp .env.example .env
# set DATABASE_URL=postgresql://...
npm install
npm run db:deploy   # prisma migrate deploy
npm run gmail:auth  # sekali, simpan token ke Postgres
npm run dev
```

Postgres lokal cepat:

```bash
docker run --name budakcv-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=budakcv -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/budakcv
```

LLM:
- Claude: [console.anthropic.com](https://console.anthropic.com/) → `ANTHROPIC_API_KEY` (utama)
- Groq: [console.groq.com/keys](https://console.groq.com/keys) → `GROQ_API_KEY` (fallback)

Pilih provider di `.env`: `LLM_PROVIDER=claude` atau `LLM_PROVIDER=groq`.

## 1. BotFather

1. Buka [@BotFather](https://t.me/BotFather) → `/newbot`
2. Salin token ke `TELEGRAM_BOT_TOKEN`
3. Dapatkan Telegram user id Anda (mis. [@userinfobot](https://t.me/userinfobot)) → `TELEGRAM_USER_ID`
4. Hanya user id itu yang boleh memakai bot

## 2. Environment

Salin `.env.example` → `.env` dan isi:

| Variable | Keterangan |
|----------|------------|
| `TELEGRAM_BOT_TOKEN` | Token BotFather |
| `TELEGRAM_USER_ID` | Numeric user id Anda |
| `LLM_PROVIDER` | `claude` (utama) atau `groq` (fallback) |
| `ANTHROPIC_API_KEY` | Wajib jika provider=claude |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-20250514` |
| `GROQ_API_KEY` | Wajib jika provider=groq |
| `GROQ_MODEL` / `GROQ_VISION_MODEL` | Model teks / foto Groq |
| `GOOGLE_CLIENT_ID` | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://127.0.0.1:53682/oauth2callback` |
| `DATABASE_URL` | Postgres URL (`postgresql://…`) |
| `GMAIL_TOKEN_JSON` | Opsional — bootstrap token sekali di Railway |
| `MAX_EMAILS_PER_DAY` | Default `10` |

Jangan commit `.env` atau secrets.

## 3. Google Cloud OAuth (Gmail send)

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru (atau pilih yang ada)
3. **APIs & Services → Library** → enable **Gmail API**
4. **OAuth consent screen**
   - User type: **External** (atau Internal jika Workspace)
   - Isi app name, support email, developer contact
   - Scopes: tambahkan `https://www.googleapis.com/auth/gmail.send`
   - Test users: tambahkan alamat Gmail Anda (wajib jika app masih Testing)
5. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app** (atau Web dengan redirect lokal)
   - Jika Web: Authorized redirect URI = `http://127.0.0.1:53682/oauth2callback`
6. Salin Client ID & Client Secret ke `.env`
7. Pastikan `GOOGLE_REDIRECT_URI=http://127.0.0.1:53682/oauth2callback`

### Login sekali (lokal)

```bash
# DATABASE_URL harus mengarah ke Postgres yang sama dengan bot (lokal atau Railway)
npm run gmail:auth
```

- Browser / URL dicetak di terminal
- Login Gmail, izinkan scope send
- Callback lokal menyimpan refresh token ke **Postgres** (`UserSettings.gmailTokenJson`)
- CLI juga mencetak JSON — bisa di-paste ke `GMAIL_TOKEN_JSON` di Railway sebagai bootstrap

Scope minimal: `https://www.googleapis.com/auth/gmail.send`

## 4. Database

```bash
npm run db:deploy    # production / Railway start
# atau
npm run db:migrate   # development (buat migrasi baru)
```

Schema: CV (`defaultCvBytes`) dan token Gmail disimpan di Postgres — tidak ada dependensi folder `data/` untuk runtime.

## 5. Jalankan

```bash
npm run dev    # polling + hot reload
npm start      # migrate deploy + bot (production / Railway)
```

## Deploy ke Railway

1. Buat project di [Railway](https://railway.app) → **New Project**
2. Tambah **PostgreSQL** addon
3. Deploy repo ini (GitHub) sebagai service
4. Di service bot, set Variables (dari `.env.example`):
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`
   - `LLM_PROVIDER` + API key terkait
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
   - `DATABASE_URL` — reference dari Postgres addon (`${{Postgres.DATABASE_URL}}`)
   - Opsional: `GMAIL_TOKEN_JSON` (satu kali) jika belum auth ke DB yang sama
5. Start command sudah di [`railway.toml`](railway.toml): `npm start` (= `prisma migrate deploy && tsx src/index.ts`)
6. Pastikan service **tidak sleep** (bot polling harus selalu hidup)
7. Auth Gmail: dari laptop, set `.env` `DATABASE_URL` ke **public** Postgres Railway → `npm run gmail:auth`  
   Atau tempel JSON token ke `GMAIL_TOKEN_JSON` di Railway Variables

Setelah deploy: upload CV lagi via `/cv` (data SQLite lama tidak ikut).

## Perintah bot

| Command | Fungsi |
|---------|--------|
| `/start` | Penjelasan alur |
| `/cv` | Upload PDF CV default |
| (teks / PDF / foto) | Parse lowongan + ekstrak field via LLM |
| `/jobs` | List lowongan aktif |
| `/draft` | Generate subject/body + preview |
| `YA` / `KIRIM` | Konfirmasi kirim (jika email sudah ada) |
| `/send email@x.com` | Set tujuan + kirim (konfirmasi eksplisit) |
| `BATAL` | Batalkan draft |
| `/status` | Lamaran terakhir |

Foto/screenshot lowongan dibaca dengan vision model (Claude / Groq).

## Contoh percakapan

```
Anda: /start
Bot:  Bot lamaran kerja pribadi via Gmail.
      Alur singkat: 1. /cv … 4. YA/KIRIM …

Anda: /cv
Bot:  Kirim file PDF CV sekarang…

Anda: [mengirim CV.pdf]
Bot:  CV tersimpan
      Nama: …
      Lampiran: Nama_CV.pdf

Anda: Kami mencari Backend Engineer di Acme Corp.
      Requirement: Node.js, PostgreSQL, 3+ tahun.
      Kirim CV ke careers@acme.example

Bot:  Lowongan #1 disimpan.
      Posisi: Backend Engineer
      Perusahaan: Acme Corp
      Email recruiter: careers@acme.example
      …

Anda: /draft
Bot:  Draft #1 siap dikonfirmasi.
      Kepada: careers@acme.example
      Subject: Lamaran Backend Engineer — Acme Corp
      —— Body ——
      …
      Balas YA atau KIRIM untuk mengirim.

Anda: YA
Bot:  Terkirim ke careers@acme.example.
      Gmail message id: …
```

Jika email tidak terdeteksi:

```
Anda: /send hr@other.example
Bot:  Terkirim ke hr@other.example.
```

## Struktur

```
src/
  bot/          # grammY commands + handlers + allowlist
  gmail/        # OAuth + send MIME
  llm/          # extract job + draft email
  db/           # Prisma client
  services/     # CV, ingest, draft flow, daily limit
  config.ts
  index.ts
prisma/
  schema.prisma
  migrations/   # Postgres migrations
railway.toml
```

## Catatan keamanan

- Hanya `TELEGRAM_USER_ID` yang dilayani
- Tidak ada auto-send tanpa `YA` / `KIRIM` / `/send`
- Hard limit `MAX_EMAILS_PER_DAY` (default 10)
- `AuditLog` mencatat attempt / success / failure / limit block
- Secrets dan token tidak ikut di git
- Data SQLite / file `data/` lama **tidak** di-migrate otomatis — setup ulang CV + Gmail auth ke Postgres
