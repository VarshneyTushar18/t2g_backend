# Blog-2.0 — Setup guide (Bright CRM / MailerLite)

Isolated admin module for Sahil sir's project. Does **not** replace the main Tech2Globe Blog module.

**Client site (Bright CRM):** https://preview.mailerlite.io/preview/2583138/sites/196949098888169226/  
**Client blog:** https://preview.mailerlite.io/preview/2583138/sites/196949098888169226/blog

## Confirmed requirements (Sep 2026)

| Item | Decision |
|------|----------|
| Website drafts | **MailerLite website** — AI publish pack + manual paste in MailerLite blog editor |
| Schedule | **Weekly**, **Monday 12:00 IST** — AI starts each post |
| Newsletter send | **Monday 12:00 IST** (scheduled, same window) |
| Newsletter format | **TBD** — full article vs excerpt + link (default: full_html in settings) |
| Approvers | Your email + Harpreet sir + Teams channel (webhook TBD) |
| MailerLite API | Paste only in **Admin → Blog-2.0 → MailerLite** (never in chat/git) |

## Admin access

1. Super admin → **Users** → create or edit Sahil's account
2. Enable module **Blog-2.0** only (or add alongside other modules)
3. Sahil logs in → sees **Blog-2.0** tile only (if that's the only module assigned)

## What we need from you (client + internal)

| # | Item | Who provides | Where to configure |
|---|------|--------------|-------------------|
| 1 | MailerLite API token | Client | Blog-2.0 → MailerLite |
| 2 | Verified sender email + name | Client | Blog-2.0 → MailerLite |
| 3 | Subscriber group ID | Client | Blog-2.0 → MailerLite (use Test connection to list IDs) |
| 4 | Approval team emails | Client | Blog-2.0 → MailerLite |
| 5 | Client site URL | Client | Blog-2.0 → MailerLite |
| 6 | AI API keys (Claude/Gemini/Perplexity + image) | Tech2Globe super admin | Connect → AI Integrations |
| 7 | `BACKEND_PUBLIC_URL` on production server | DevOps | Server `.env` |
| 8 | Teams webhook (optional) | Client | Blog-2.0 → MailerLite |
| 9 | Newsletter: full HTML vs excerpt+link | Client decision | Blog-2.0 → MailerLite |
| 10 | Schedule: weekly/monthly, day, time | Client decision | Automations (Phase 3) |

## MailerLite browser bot (website blog)

MailerLite has no blog API. The bot uses **Playwright** to log in and create drafts.

### Server safety (production)

| Concern | Reality |
|---------|---------|
| Other PM2 apps (`t2g_ai_backend`, `tech2globeca`, etc.) | **Not affected** — bot runs only inside `t2g_backend` when you click Test / Push |
| `dnf install` libraries | **Safe** — passive `.so` files (GTK/accessibility). No new services, no port changes, no nginx/mysql changes |
| Chromium always running? | **No** — starts on demand, closes in `finally` after each job (max ~3 min timeout) |
| Multiple bots at once? | **Blocked** — second request gets “bot already running” |
| Auto-push | **Off by default** — enable only when you trust login + push flow |

**Recommended:** keep **auto-push disabled** until manual Test + Push works. Use **manual Push** from Drafts during testing.

**RHEL/CentOS/AlmaLinux** (no `apt-get`):
```bash
cd t2g_backend
npx playwright install chromium
dnf install -y at-spi2-atk atk cups-libs libdrm libxkbcommon \
  libXcomposite libXdamage libXfixes libXrandr mesa-libgbm \
  pango cairo alsa-lib nss nspr libxshmfence
pm2 restart t2g_backend
```

**Server setup (once):**
```bash
cd t2g_backend
npm install
npm run playwright:install
```

**Admin:** Blog-2.0 → MailerLite → Browser bot:
- Dedicated MailerLite login (2FA off)
- Site ID: `196949098888169226`
- Enable bot + optional auto-push
- **Test bot login** → then **Blog-2.0 → Drafts → Push to MailerLite**

Debug screenshots on failure: `uploads/blog20-bot-debug/`

## Deploy

1. Pull backend + admin panel
2. Run `npm install` and `npm run playwright:install` on server
3. Restart backend → log should show `[blog-2.0] settings + drafts tables ready`
3. Assign Blog-2.0 module to Sahil's user
4. Open Blog-2.0 → MailerLite → paste token → **Test connection** → **Save**

## API routes

- `GET /api/blog-2.0/overview`
- `GET /api/blog-2.0/checklist`
- `GET|PUT /api/blog-2.0/settings`
- `POST /api/blog-2.0/mailerlite/test`
- `GET|POST /api/blog-2.0/agent/*` (Blog Agent, `blog_2_0` permission)

## Phases

1. **Now** — Module shell, MailerLite settings, test connection, Blog Agent access
2. **Next** — Auto-create MailerLite draft campaign when a blog is written
3. **Then** — Scheduler, topic queue, email approval, Teams notify

## MailerLite limitation

Public API supports **email campaigns**, not **website blog drafts** in the MailerLite site builder. Website drafts use our CMS (`cms_draft`) or manual paste (`mailerlite_manual`).
