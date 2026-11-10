# RUNAK Telegram bot on Render

1. Put the `render-bot` folder in a GitHub repo (as the repo root).
2. Render → New → **Web Service** → pick the repo. Build: `npm install`, Start: `npm start` (or use render.yaml → Blueprint).
3. Add the env vars from `.env.example`. `API_KEY_SECRET`, `KEY_PREFIX` and `FIREBASE_SERVICE_ACCOUNT` must be identical to Vercel, otherwise keys will not validate on the site.
4. Deploy. On start the bot registers its own webhook (`<your-render-url>/tgbot`); check the logs for `setWebhook: {"ok":true...}`.
5. Free plan sleeps after ~15 min idle, so the first /start after a quiet period may take about a minute. A free uptime pinger on `/health` keeps it awake.

Then remove `api/tgbot.js` from the Vercel project (frees one of the 12 function slots).
