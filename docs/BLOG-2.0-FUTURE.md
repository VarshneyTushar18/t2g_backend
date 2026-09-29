# Blog-2.0 — Future work (not built yet)

Keep this list when improving the MailerLite bot. **Fix the bot first**; add these after push is reliable.

## Phase 2 — OTP in admin (human-in-the-loop)

When MailerLite shows email verification:

1. Bot sets `mailerlite_session_status = awaiting_otp` (done — alert banner exists).
2. **Pause** push job for up to ~5 minutes instead of failing immediately.
3. **Admin UI:** 6-digit OTP field on Blog-2.0 → MailerLite + Submit.
4. **API:** `POST /api/blog-2.0/mailerlite/bot/otp` `{ "code": "123456" }`.
5. Bot fills OTP in Playwright (`input[autocomplete="one-time-code"]`, Verify button).
6. Save refreshed `mailerlite-session.json` and **resume** the push.

Optional: same OTP API from Teams chatbot / email link.

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
