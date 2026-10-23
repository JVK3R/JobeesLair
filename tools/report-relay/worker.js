// Jobee'sLair's bug report relay (0.5.1): a Cloudflare Worker between the app's "Report a bug" and the Discord
// channel. The app posts the report here (app/state/bug-report.js); the Discord webhook stays a secret of this
// worker (DISCORD_WEBHOOK, `wrangler secret put`), so no build carries it. The worker writes the Discord message
// itself from the fields it accepts, so a stranger posting here can at most send a report of their own: no
// @mentions, no embeds, no links of their choosing, and only a few per console per hour.
//
// Fields (multipart/form-data): version, firmware (short text); files jobeeslair.log and shadowmount.log.
// Answers: 204 sent; 400 not a report; 413 too big; 429 slow down; 503 no webhook set; 502 Discord refused.

var WEBHOOK = /^https:\/\/(?:discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,100}$/;
var MAX_BODY = 1024 * 1024, MAX_LOG = 640 * 1024;
var FILES = ["jobeeslair.log", "shadowmount.log"];
// Per address and for everyone, over a sliding window. Memory of this isolate only, which is all a spammer from
// one place hits; the app itself sends at most one report per ten minutes.
var WINDOW_MS = 60 * 6e4, PER_ADDRESS = 4, FOR_ALL = 40;
var seen = new Map();
function allowed(address, now) {
  for (const [key, times] of seen) {
    const kept = times.filter((t) => now - t < WINDOW_MS);
    if (kept.length) seen.set(key, kept); else seen.delete(key);
  }
  const mine = seen.get(address) || [];
  const all = [...seen.values()].reduce((n, times) => n + times.length, 0);
  if (mine.length >= PER_ADDRESS || all >= FOR_ALL) return false;
  seen.set(address, [...mine, now]);
  return true;
}
// Short text for the message: one line, no markdown or mention characters, cut short.
var plain = (value, max) => String(value ?? "").replace(/[\x00-\x1f\x7f@*_`~|<>\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "?";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Jobee'sLair bug report relay. The app posts here; there is nothing to see.", { status: request.method === "GET" ? 200 : 405 });
    }
    const webhook = String(env.DISCORD_WEBHOOK || "").trim();
    if (!WEBHOOK.test(webhook)) return new Response("No webhook set", { status: 503 });
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return new Response("Too big", { status: 413 });
    if (!/^multipart\/form-data/i.test(request.headers.get("content-type") || "")) return new Response("Not a report", { status: 400 });
    const address = request.headers.get("cf-connecting-ip") || "unknown";
    if (!allowed(address, Date.now())) return new Response("Slow down", { status: 429 });
    let form;
    try {
      form = await request.formData();
    } catch {
      return new Response("Not a report", { status: 400 });
    }
    const files = [];
    for (const name of FILES) {
      const file = form.get(name);
      if (!file || typeof file === "string") continue;
      const text = await file.text();
      files.push({ name, text: text.length > MAX_LOG ? text.slice(-MAX_LOG) : text });
    }
    if (!files.length) return new Response("Not a report", { status: 400 });
    const version = plain(form.get("version"), 40), firmware = plain(form.get("firmware"), 12);
    const payload = {
      content: `**Bug report** · Jobee'sLair ${version} · firmware ${firmware}${files.length < 2 ? " · ShadowMount's log unavailable" : ""}`,
      allowed_mentions: { parse: [] }
    };
    const out = new FormData();
    out.set("payload_json", JSON.stringify(payload));
    files.forEach((file, index) => out.set(`files[${index}]`, new Blob([file.text], { type: "text/plain; charset=utf-8" }), file.name));
    const answer = await fetch(`${webhook}?wait=true`, { method: "POST", body: out });
    if (answer.status === 429) return new Response("Discord is busy", { status: 429 });
    if (!answer.ok) return new Response(`Discord answered ${answer.status}`, { status: 502 });
    return new Response(null, { status: 204 });
  }
};
