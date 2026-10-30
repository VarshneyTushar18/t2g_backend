# Blog-2.0 — Future work (not built yet)

Keep this list when improving the MailerLite bot. **Fix the bot first**; add these after push is reliable.

## Phase 2 — OTP in admin (human-in-the-loop) — **DONE (v2026-09-30-c)**

When MailerLite shows email verification:

1. Bot sets `mailerlite_session_status = awaiting_otp` and waits up to 5 minutes.
2. User enters OTP on **Blog-2.0 → MailerLite** (or Drafts banner).
3. `POST /api/blog-2.0/mailerlite/bot/otp` `{ "code": "123456" }`.
4. Bot fills OTP, continues push, refreshes session file.

Optional later: Teams chatbot using the same OTP API.

## Phase 3 — Automation

- Monday scheduler (weekly blog + newsletter)
- MailerLite **newsletter** via API (blog has no API — bot only for website blog)
- Teams notifications on draft ready / push success / session needed

## Phase 4 — Content quality

- HTML body block (Custom HTML) instead of plain text paragraphs
- Featured image upload in MailerLite editor
- Meta / excerpt fields on content setup page

## Session refresh (until Phase 2 ships)

On **Windows PC** only:

```bash
npm run blog20:save-session
# complete OTP in Chrome if asked → wait for Create a post
scp storage/blog-2.0/mailerlite-session.json root@SERVER:/root/t2g_backend/storage/blog-2.0/
```

Server push:

```bash
xvfb-run -a npm run test:blog20-push -- <draftId>
```
