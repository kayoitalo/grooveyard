# Arcadium

> **Um amigo obcecado por música lendo o seu histórico.**
>
> A personal listening companion. It reads your Last.fm history, finds the patterns you missed — comebacks, loops, unlikely transitions, eras — and talks about them like a friend who keeps sending you voice notes about music. It also digs up new artists that make sense for you specifically.

The interpretive texts are the heart of the product. Charts, rankings and numbers exist to back them up.

## ✦ Interface

Five screens, one narrator. The home screen is **the conversation**: the readings the friend already wrote, each one with the proof it cites, pulled from the database and always on screen at rest. A reading whose numbers do not match the data (`N vezes`, `N%`, a "comeback" across a gap in the history) never reaches the screen.

- **One narrator, one protagonist.** Every line is the friend talking, or mute data. His pen is the only moving thing: it highlights the part of the sentence the proof backs, rules the cited bar, measures the jump between two covers. With music playing, the pen becomes a string that vibrates with the real signal.
- **One colour.** A dry track-lane yellow belongs to the pen alone; everything else is ink on paper. Covers bring the rest.
- **Screens:** conversa (home) · o que mudou (genre share shift, month or year) · pra ouvir depois (discovery, one track at a time, with the map) · tudo que tocou (history by day, with the listening hours) · ajustes.

---

## ✦ Principles

1. **The backend calculates facts.** Counts, rankings, shares, comparisons (7d, 30d, 1y, all time) and recommendation scores come from deterministic SQL and TypeScript.
2. **AI interprets, it never calculates.** Gemini writes the readings from evidence the app has already measured. It does not invent counts, IDs or candidate tracks, and every screen still speaks from measured data when the model is unavailable.
3. **PostgreSQL is the source of truth.** Providers supply input or enrichment; every screen reads from the local database.
4. **Providers stay replaceable.** HTTP and payload details live behind small interfaces in each module's `infrastructure/` folder.
5. **Privacy by design.** The model only receives aggregates and signals — never tokens, e-mail or usernames. Provider tokens are encrypted at rest.
6. **No overengineering.** A modular monolith in one Next.js repo: no microservices, queues or vector stores until a real need shows up.

---

## 🔌 Providers

| Provider | Role |
|---|---|
| **Last.fm** | Listening history (`user.getRecentTracks`), similar artists for discovery, short artist/album facts for the readings |
| **MusicBrainz** + **Cover Art Archive** | Artist metadata, tags and album covers (1 req/s) |
| **iTunes Search API** | Covers, 30 s previews, exact track durations, release year and genre — no key needed |
| **Gemini** | Reading packs: several readings per period plus a comment for each record |
| **Spotify** *(optional)* | Export of approved discoveries to a private playlist, with `.m3u` fallback. Spotify data is never used for profiling or prompts |

---

## 🛠 Stack

Next.js 16 (Turbopack) · React 19 · TypeScript 7 · Tailwind CSS v4 · Prisma 7 with `@prisma/adapter-pg` on PostgreSQL (Neon) · Zod 4 · framer-motion · Vitest 4

---

## ⚡ API

| Route | Methods | What it does |
|---|---|---|
| `/api/sync` | `GET` `POST` | Sync status; resumable incremental scrobble ingestion with deduplication |
| `/api/conversation` | `GET` | The home conversation: stored readings with verified proof |
| `/api/overview` | `GET` | Period metrics and taste shift (in share points) |
| `/api/history` | `GET` | Paginated listening history |
| `/api/enrichment` | `GET` `POST` | Enrichment coverage; rate-limited metadata and catalog enrichment |
| `/api/recommendations` | `GET` `POST` | Discovery sessions |
| `/api/recommendations/[sessionId]/feedback` | `POST` | Feedback on a suggestion |
| `/api/ai/lines` | `GET` | Short lines for the secondary screens |
| `/api/ai/refresh` | `POST` | Regenerates packs within the AI budget |
| `/api/cover` | `GET` | Cover image proxy |
| `/api/spotify/connect` · `/callback` · `/export` | various | Spotify OAuth and playlist export |
| `/api/user/data` | `GET` `DELETE` | JSON export of all data; full purge |
| `/api/user/preferences` | `GET` `PUT` | How the readings address you |

---

## 🚀 Local development

Requires Node.js 20+ and pnpm 11+.

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL, LASTFM_API_KEY and GEMINI_API_KEY
pnpm db:deploy         # apply the Prisma migrations
pnpm test
node scripts/setup-auth.mjs # generate the personal login
pnpm dev               # http://127.0.0.1:3000
```

### Configure personal access

Before starting the app, apply migrations and configure the owner account:

```bash
pnpm db:deploy
node scripts/setup-auth.mjs
```

The setup command binds access to the existing account when there is exactly one
user, preserving its listening history. With multiple users, set `AUTH_USER_ID`
explicitly first. For an empty database, it creates the owner account. It generates
a random password, prints it once for your password manager, and stores only its
scrypt hash in `.env`. No public registration is available.

Open `http://127.0.0.1:3000/login`. To rotate the password and invalidate all existing
sessions, run `node scripts/setup-auth.mjs --reset`, then restart the application.

For production, configure `AUTH_USER_ID`, `AUTH_PASSWORD_HASH` and `APP_ORIGIN`
in the hosting environment before deployment. `APP_ORIGIN` must be the exact HTTPS
origin, for example `https://your-app.vercel.app`; configure each preview separately.
Use the same database account ID as the history you want to access. Apply the new
database migration before running the new server. Never publish `.env` or the password.


---

## 🔒 Security & scheduling

Private pages require a session, and each API handler checks authorization before
reading data or calling providers. Browser mutations also require a matching
`Origin`. Sessions expire after seven days, use HttpOnly / SameSite=Lax cookies
(Secure in production), and store only token digests in PostgreSQL. Logout revokes
the session server-side. Missing authentication configuration fails closed.

Only `POST /api/sync` and `POST /api/ai/refresh` accept scheduler credentials via
`CRON_SECRET`; they use the explicitly configured `AUTH_USER_ID`. The "buscar agora"
button requires a signed-in session. There is no development or missing-secret
bypass. Spotify OAuth is an optional provider connection, separate from app login.

Login is limited to ten attempts per fixed fifteen-minute window in PostgreSQL,
shared across server instances. This deliberately conservative personal-account
limit can temporarily block legitimate login during an attack; it does not block
existing sessions. Public multi-user registration and password recovery are deferred.

Background sync runs hourly via GitHub Actions (`.github/workflows/scheduled-sync.yml`), using the `APP_URL`, `CRON_SECRET` and `LASTFM_USERNAME` repository secrets.

---

## 📜 License

MIT License.
