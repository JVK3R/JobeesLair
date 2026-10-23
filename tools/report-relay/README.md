# Bug report relay

A Cloudflare Worker between Jobee'sLair's **Report a bug** (app/state/bug-report.js) and the Discord channel.
The Discord webhook is a secret of the worker, never of a build: the app only knows the worker's address.

## Deploy (once)

    cd tools/report-relay
    npx wrangler login
    npx wrangler deploy
    npx wrangler secret put DISCORD_WEBHOOK      # paste the channel's webhook URL

`wrangler deploy` prints the address, `https://jobeeslair-report.<account>.workers.dev`. That address goes in
`app/data/private/report.json` as `{"reportUrl": "https://…workers.dev"}` before a build.

## If the channel gets junk

Delete the webhook in Discord (channel settings → Integrations), make a new one, `npx wrangler secret put
DISCORD_WEBHOOK` again. No rebuild. The worker also keeps strangers to a few reports an hour, writes the
message itself (no mentions, embeds or links of theirs), and takes nothing but the two logs.
