// The phone companion's page, served whole by the native server at `/`. Self-contained (no outside
// requests but game covers), touch-first, and safe with what the console sends: every value goes into
// the page as text, never as markup. The address carries no secret: the page asks for the 6-digit PIN
// Settings shows, and the console answers with a session cookie (HttpOnly, so this script never sees it)
// that the browser sends from then on. Every request adds X-JBH: 1, which the server requires.
// Four tabs: Games (search, download to the console), Queue (live progress, drive space gauges, pause,
// resume, cancel), Feeds (add, edit, add mirrors, remove, sync) and Remote (the d-pad and buttons, and
// shortcuts). The console UI's look: deep ink panels, rounded shapes, the accent for focus and progress.
// The two logos are filled in by packaging/brand/phone_page_brand.py from the one JL monogram geometry.

import { EXO2_500, EXO2_700 } from './fonts.js';

  var PAGE = String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050811"><title>Jobee'sLair</title>
<style>
@font-face{font-family:"Exo 2";src:url(data:font/woff2;base64,__EXO2_500__) format("woff2");font-weight:300 550;font-display:swap}
@font-face{font-family:"Exo 2";src:url(data:font/woff2;base64,__EXO2_700__) format("woff2");font-weight:551 900;font-display:swap}
:root{--canvas:#05070d;--deep:#090d16;--panel:#0f1520;--panel2:#1d2738;--line:#243047;--fg:#f3f6fb;--muted:#a6b1c4;--subtle:#75839a;--accent:#3a86ff;--ice:#4cc9f0;--good:#4ade80;--warn:#fbbf24;--bad:#f87171;--ease:cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%;background:var(--canvas);color:var(--fg);font:16px/1.5 "Exo 2",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.01em;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{padding-bottom:calc(96px + env(safe-area-inset-bottom))}
button,input{font-family:inherit}
.emblem{flex:0 0 auto;}
.panel{background:var(--panel);border:1px solid var(--line)}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 16px 10px;background:rgba(5,8,17,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
header h1{font-size:19px;margin:0;font-weight:700;letter-spacing:.06em;}
header .version:empty{display:none}
header .version{color:var(--subtle);font-size:12px;margin-left:auto;padding:3px 9px;border:1px solid var(--line)}
main{padding:16px 16px 0;max-width:980px;margin:0 auto}
section{animation:enter .28s var(--ease)}
@keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
input.field{width:100%;padding:13px 14px;border:1px solid var(--line);background:var(--deep);color:var(--fg);font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s}
input.field:focus{border-color:var(--ice);box-shadow:0 0 0 3px rgba(76,201,240,.16)}
.label{display:flex;align-items:center;gap:10px;margin:22px 0 12px;font-weight:700;font-size:15px;letter-spacing:.08em;text-transform:uppercase;}
.label::before{content:"";width:4px;height:16px;background:var(--ice);box-shadow:0 0 10px rgba(76,201,240,.8)}
.label span{margin-left:auto;color:var(--subtle);font-weight:500;font-size:12px;letter-spacing:.04em;text-transform:none;text-shadow:none}
.rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:2px 16px 12px;scrollbar-width:none}
.rail::-webkit-scrollbar{display:none}
.rail .card{flex:0 0 68%;max-width:300px;scroll-snap-align:start}
.rail .cover{aspect-ratio:16/10}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.card{position:relative;display:block;width:100%;padding:0;text-align:left;font:inherit;color:inherit;overflow:hidden;cursor:pointer;background:var(--panel);border:1px solid var(--line);transition:border-color .2s,box-shadow .2s,transform .2s var(--ease);animation:rise .4s var(--ease) both}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.card:hover,.card:focus-visible{border-color:var(--ice);box-shadow:0 0 0 1px var(--ice);outline:none}
.card:active{transform:scale(.98)}
.cover{aspect-ratio:3/4;width:100%;display:block;object-fit:cover;background:linear-gradient(135deg,var(--panel2),var(--deep))}
.card .meta{padding:9px 11px 11px}
.card .title{font-weight:700;font-size:14.5px;line-height:1.3;letter-spacing:.02em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .sub{color:var(--subtle);font-size:12px;margin-top:3px}
.rail .card .meta{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 11px;background:linear-gradient(180deg,rgba(5,8,17,0),rgba(5,8,17,.94))}
.rail .card .title{font-size:17px;}
button.btn{border:1px solid var(--line);padding:11px 16px;font:inherit;font-weight:600;font-size:15px;color:var(--fg);cursor:pointer;background:var(--panel2);transition:border-color .15s,box-shadow .2s,transform .12s var(--ease),background .2s}
button.btn:hover,button.btn:focus-visible{outline:none;border-color:var(--ice);box-shadow:0 0 0 1px var(--ice)}
button.btn:active{transform:scale(.97)}
button.btn:disabled{opacity:.45;cursor:default;box-shadow:none;border-color:var(--line)}
button.primary{background:#0f1b30;border-color:var(--accent);color:#fff;box-shadow:inset 0 0 0 1px rgba(58,134,255,.35)}
button.danger{border-color:rgba(248,113,113,.55);color:#fecaca;background:transparent}
button.danger:hover,button.danger:focus-visible{border-color:var(--bad);box-shadow:0 0 14px rgba(248,113,113,.3)}
.more{display:block;margin:8px auto 0;padding:12px 26px}
.block{padding:14px;margin-bottom:10px;animation:rise .35s var(--ease) both}
.row{display:flex;align-items:center;gap:10px}
.wrap{flex-wrap:wrap}
.grow{flex:1;min-width:0}
.ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.muted{color:var(--muted)}.subtle{color:var(--subtle);font-size:13px}
.bar{position:relative;height:6px;background:var(--panel2);overflow:hidden;margin:12px 0 7px}
.bar>i{display:block;height:100%;background:var(--accent);transition:width .6s var(--ease)}
.state{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border:1px solid var(--line);color:var(--muted)}
.state.active{border-color:var(--ice);color:#d6f6ff;box-shadow:0 0 10px rgba(76,201,240,.3)}.state.failed{border-color:rgba(248,113,113,.6);color:#fecaca}.state.done{border-color:rgba(74,222,128,.5);color:#bbf7d0}
.actions{display:flex;gap:8px;margin-top:10px}
.actions .btn{flex:1;padding:9px 10px;font-size:14px}
.error{color:#fecaca;font-size:13px;margin-top:6px}
.drives{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.drive{padding:12px 12px 10px;text-align:center}
.drive svg{width:100%;max-width:170px;display:block;margin:0 auto}
.drive .pct{font-weight:700;font-size:22px;letter-spacing:.04em;margin-top:-30px;}
.drive .name{font-weight:600;margin-top:6px}
nav{position:fixed;left:0;right:0;bottom:0;z-index:6;display:flex;padding:6px 8px calc(6px + env(safe-area-inset-bottom));background:rgba(5,8,17,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line)}
nav button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:1px solid transparent;color:var(--subtle);font:inherit;font-size:11.5px;font-weight:700;letter-spacing:.04em;padding:8px 2px 6px;cursor:pointer;transition:color .2s,border-color .2s,box-shadow .2s}
nav button svg{width:22px;height:22px;pointer-events:none}
nav button span{pointer-events:none}
nav button[aria-selected=true]{color:#fff;border-color:var(--ice);background:rgba(58,134,255,.12);box-shadow:0 0 16px rgba(76,201,240,.22)}
.sheet{position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,8,17,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fade .2s ease}
@keyframes fade{from{opacity:0}}
.sheet>div{width:100%;max-width:520px;max-height:86vh;overflow:auto;padding:0 0 16px;background:var(--panel);border:1px solid var(--line);box-shadow:0 0 0 1px rgba(76,201,240,.15);animation:pop .3s var(--ease)}
@keyframes pop{from{opacity:0;transform:translateY(12px)}}
.sheet .hero{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:linear-gradient(135deg,var(--panel2),var(--deep));-webkit-mask-image:linear-gradient(180deg,#000 70%,transparent);mask-image:linear-gradient(180deg,#000 70%,transparent)}
.sheet .body{padding:4px 16px 0}
.sheet h2{margin:0 0 4px;font-size:23px;font-weight:700;letter-spacing:.03em;}
.source{padding:10px 0;border-top:1px solid var(--line)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:264px;margin:0 auto}
.pad .btn{aspect-ratio:1;font-size:20px;display:flex;align-items:center;justify-content:center;padding:0}
.pad .btn svg{width:30px;height:30px;pointer-events:none}
.pad .ok{border-color:var(--ice);color:#d6f6ff;}
.pad .gap{visibility:hidden}
.keys{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:264px;margin:12px auto 0}
.keys .btn{padding:12px 0;font-size:14px}
.quick{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.quick .btn{text-align:left;padding:12px 14px}
.quick .btn small{display:block;color:var(--subtle);font-weight:500;font-size:12px;margin-top:2px}
.toast{position:fixed;left:16px;right:16px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:20;margin:0 auto;max-width:520px;padding:12px 14px;background:var(--panel);border:1px solid var(--ice);box-shadow:0 0 18px rgba(76,201,240,.18);opacity:0;transform:translateY(8px);transition:.25s var(--ease);pointer-events:none}
.toast.show{opacity:1;transform:none}.toast.bad{border-color:rgba(248,113,113,.7);box-shadow:none}
.login{min-height:calc(100vh - 140px);display:flex;align-items:center;justify-content:center}
.login .emblem{}
.login .card{width:100%;max-width:380px;text-align:center;padding:30px 24px 26px;cursor:default;animation:pop .4s var(--ease)}
.login .card:hover{box-shadow:none;border-color:var(--line)}
.login h2{margin:16px 0 6px;font-size:23px;font-weight:700;letter-spacing:.05em;}
.login p{margin:0 0 20px}
.pin{width:100%;max-width:300px;margin:0 auto 18px;display:block;padding:14px 0;border:1px solid var(--line);background:var(--deep);color:#fff;font:600 34px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3em;text-indent:.3em;text-align:center;outline:none;caret-color:var(--ice);transition:border-color .2s,box-shadow .2s}
.pin:focus{border-color:var(--ice);box-shadow:0 0 0 3px rgba(76,201,240,.18)}
.login .btn{width:100%;max-width:300px;padding:14px}
.login .error{min-height:20px;margin-top:14px}
@keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.shake{animation:shake .35s}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
.panel,.card,.block,.sheet>div,.toast,.login .card,.drive{border-radius:18px}
.card{overflow:hidden}
button.btn,input.field,.pin,.pad .btn,.keys .btn,.quick .btn{border-radius:12px}
.state,.header .version,header .version,.bar,.bar>i{border-radius:99px}
nav{border-radius:22px 22px 0 0}nav button{border-radius:14px}
.sheet .hero{border-radius:18px 18px 0 0}

.mirror{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:13px;color:var(--muted)}
.btn.mini{padding:4px 12px;font-size:12px}
[hidden]{display:none!important}
</style></head>
<body>
<header>
<svg class="emblem" width="42" height="28" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg>
<h1>Jobee'sLair</h1><span class="version" id="version"></span>
</header>
<main>
<section id="login" class="login" hidden>
<form class="card panel" id="loginForm" autocomplete="off">
<svg class="emblem" width="90" height="60" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg>
<h2>Enter your PIN</h2>
<p class="muted">The 6-digit PIN is shown in Settings &rarr; Phone companion on your PS5.</p>
<input class="pin" id="pin" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" aria-label="PIN" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;">
<button class="btn primary" id="signIn" type="submit">Sign in</button>
<div class="error" id="loginError" role="alert"></div>
</form>
</section>
<section id="games" hidden>
<input class="field" id="q" type="search" placeholder="Search games" autocomplete="off">
<div id="featured"><div class="label">Popular now <span>swipe</span></div><div class="rail" id="rail"></div></div>
<div class="label">All games <span id="count"></span></div>
<div class="grid" id="grid"></div>
<button class="btn more" id="more" hidden>Show more</button>
</section>
<section id="queue" hidden>
<div class="label">Storage <span>free space on the console</span></div>
<div class="drives" id="drives"></div>
<div class="label">Downloads <span id="jobCount"></span></div>
<div id="jobs"></div>
</section>
<section id="feeds" hidden>
<div class="panel block"><div class="row"><input class="field grow" id="feedUrl" type="url" inputmode="url" placeholder="https://&hellip;/catalog.json" autocomplete="off" autocapitalize="off"><button class="btn primary" id="addFeed">Add</button></div>
<p class="subtle" style="margin:10px 0 0">JSON catalog feeds add games and sources. The console shows what they bring in the next time it opens the app.</p></div>
<div class="row" style="margin:18px 0 12px"><div class="label grow" style="margin:0">Your feeds</div><button class="btn primary" id="syncFeeds">Sync all</button></div>
<div id="feedList"></div>
</section>
<section id="remote" hidden>
<div class="label">Remote <span>presses go to the console</span></div>
<div class="pad" id="pad">
<button class="btn" data-press="l1">L1</button><button class="btn" data-press="up" aria-label="Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 15 6-6 6 6"/></svg></button><button class="btn" data-press="r1">R1</button>
<button class="btn" data-press="left" aria-label="Left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m15 6-6 6 6 6"/></svg></button><button class="btn ok" data-press="confirm" aria-label="Cross">&#10005;</button><button class="btn" data-press="right" aria-label="Right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg></button>
<button class="btn gap" tabindex="-1" aria-hidden="true"></button><button class="btn" data-press="down" aria-label="Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg></button><button class="btn gap" tabindex="-1" aria-hidden="true"></button>
</div>
<div class="keys"><button class="btn" data-press="back">&#9675; Back</button><button class="btn" data-press="options">Options</button></div>
<div class="label">Quick actions</div>
<div class="quick">
<button class="btn" data-quick="refresh">Refresh store<small>Sync every feed</small></button>
<button class="btn" data-quick="home">Home<small>Discover page</small></button>
<button class="btn" data-quick="downloads">Downloads<small>On the console</small></button>
<button class="btn" data-quick="search">Search<small>On the console</small></button>
<button class="btn" data-quick="settings">Settings<small>On the console</small></button>
</div>
</section>
</main>
<nav id="tabs" hidden>
<button data-tab="games" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/></svg><span>Games</span></button><button data-tab="queue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span>Queue</span></button><button data-tab="feeds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg><span>Feeds</span></button><button data-tab="remote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg><span>Remote</span></button>
</nav>
<div class="toast" id="toast" role="status"></div>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TABS = ["games", "queue", "feeds", "remote"];
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function gb(n) { return Math.round(n * 10) / 10 + " GB"; }
  function bytes(n) { if (!n) return "0 B"; var u = ["B", "KB", "MB", "GB", "TB"], i = Math.min(4, Math.floor(Math.log(n) / Math.log(1000))); return (n / Math.pow(1000, i)).toFixed(i > 1 ? 1 : 0) + " " + u[i]; }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
  var toastTimer;
  function toast(text, bad) { var t = $("toast"); t.textContent = text; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = "toast"; }, 3200); }
  function api(method, path, body) {
    var headers = { "X-JBH": "1" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", credentials: "same-origin" })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          // Several requests can be refused at once (Queue asks for jobs and drives): the first brings the
          // card back with its reason, the rest leave it as it is.
          if (r.status === 401) { if (signedIn) showLogin("Signed out. Enter the PIN again."); else if ($("login").hidden) showLogin(""); throw new Error("Not signed in."); }
          if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
          return data;
        });
      });
  }
  var signedIn = false;
  function showLogin(message) {
    signedIn = false;
    TABS.forEach(function (s) { $(s).hidden = true; });
    $("tabs").hidden = true; $("login").hidden = false; $("loginError").textContent = message || "";
    setTimeout(function () { $("pin").focus(); }, 50);
  }
  function refuse(message) {
    var card = $("loginForm");
    $("loginError").textContent = message; $("pin").value = ""; $("pin").focus();
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }
  var signing = false;
  function signIn() {
    var pin = $("pin").value.replace(/[^0-9]/g, "");
    if (pin.length !== 6 || signing) return;
    signing = true; $("signIn").disabled = true; $("loginError").textContent = "";
    fetch("/auth", { method: "POST", headers: { "X-JBH": "1", "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin }), cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (answer) {
        if (answer.status === 200) { $("pin").value = ""; start(); return; }
        if (answer.status === 429) return refuse("Too many tries. Try again in " + (answer.data.retryAfter || 30) + " s.");
        if (answer.status === 401 && answer.data.retryAfter) return refuse("Wrong PIN. Wait " + answer.data.retryAfter + " s before the next try.");
        refuse(answer.data.error || "Wrong PIN.");
      })
      .catch(function () { refuse("Couldn't reach the console."); })
      .then(function () { signing = false; $("signIn").disabled = false; });
  }
  $("loginForm").onsubmit = function (e) { e.preventDefault(); signIn(); };
  $("pin").oninput = function () {
    var digits = $("pin").value.replace(/[^0-9]/g, "").slice(0, 6);
    if ($("pin").value !== digits) $("pin").value = digits;
    if (digits.length === 6) signIn();
  };

  var tab = "games";
  function show(name) {
    tab = name;
    TABS.forEach(function (s) { $(s).hidden = s !== name; });
    Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === name)); });
    if (name === "queue") { loadQueue(); loadDrives(); }
    if (name === "feeds") loadFeeds();
  }
  $("tabs").onclick = function (e) { var b = e.target.closest ? e.target.closest("button[data-tab]") : null; if (b) show(b.dataset.tab); };

  // Games: search, a featured rail, the grid, and a sheet to download one to the console.
  var query = "", offset = 0, searchTimer, searchId = 0;
  var FEATURED = 8;
  function loadGames(reset) {
    if (reset) { offset = 0; $("grid").textContent = ""; $("rail").textContent = ""; }
    var id = ++searchId;
    api("GET", "/api/games?q=" + encodeURIComponent(query) + "&offset=" + offset + "&limit=30").then(function (data) {
      if (id !== searchId) return;
      $("count").textContent = data.total + (data.total === 1 ? " game" : " games");
      var featured = !query && data.offset === 0;
      $("featured").hidden = !featured;
      data.games.forEach(function (g, i) {
        if (featured && i < FEATURED) $("rail").appendChild(card(g, i));
        else $("grid").appendChild(card(g, i));
      });
      offset = data.offset + data.games.length;
      $("more").hidden = offset >= data.total;
    }).catch(function (e) { toast(e.message, true); });
  }
  function card(g, i) {
    var b = el("button", "card");
    b.style.animationDelay = Math.min(i || 0, 12) * 30 + "ms";
    var img = el("img", "cover"); img.loading = "lazy"; img.alt = ""; if (g.cover) img.src = g.cover;
    var meta = el("div", "meta");
    meta.appendChild(el("div", "title", g.title));
    meta.appendChild(el("div", "sub", [g.platform.toUpperCase(), g.year, g.sizeGb ? gb(g.sizeGb) : null].filter(Boolean).join(" · ")));
    b.appendChild(img); b.appendChild(meta);
    b.onclick = function () { openGame(g.id); };
    return b;
  }
  $("q").oninput = function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { query = $("q").value; loadGames(true); }, 250); };
  $("more").onclick = function () { loadGames(false); };
  function openGame(id) {
    api("GET", "/api/game?id=" + encodeURIComponent(id)).then(function (g) {
      var sheet = el("div", "sheet"), box = el("div"), inner = el("div", "body");
      sheet.appendChild(box);
      sheet.onclick = function (e) { if (e.target === sheet) sheet.remove(); };
      var hero = el("img", "hero"); hero.alt = ""; if (g.cover) hero.src = g.cover;
      box.appendChild(hero); box.appendChild(inner);
      box = inner;
      box.appendChild(el("h2", null, g.title));
      box.appendChild(el("div", "subtle", [g.platform.toUpperCase(), g.year, g.developer, g.sizeGb ? gb(g.sizeGb) : null].filter(Boolean).join(" · ")));
      if (g.summary) box.appendChild(el("p", "muted", g.summary));
      var go = el("button", "btn primary", "Download to console");
      go.style.width = "100%"; go.style.margin = "12px 0";
      var usable = g.sources.some(function (s) { return s.group === "direct" || s.group === "page"; });
      if (!usable) { go.disabled = true; go.textContent = g.sources.length ? "Start this one on the console" : "No source"; go.className = "btn"; }
      go.onclick = function () {
        go.disabled = true;
        api("POST", "/api/download", { id: g.id }).then(function (r) { toast("Queued on the console from " + r.source); sheet.remove(); })
          .catch(function (e) { toast(e.message, true); go.disabled = false; });
      };
      box.appendChild(go);
      g.sources.forEach(function (s) {
        var row = el("div", "source");
        row.appendChild(el("div", null, s.name + (s.size ? " · " + s.size : "")));
        row.appendChild(el("div", "subtle", [s.detail, s.group === "browser" ? "needs the console's browser" : null, s.group === "unavailable" ? "unavailable" : null].filter(Boolean).join(" · ")));
        box.appendChild(row);
      });
      var close = el("button", "btn", "Close"); close.style.width = "100%"; close.style.marginTop = "12px";
      close.onclick = function () { sheet.remove(); };
      box.appendChild(close);
      document.body.appendChild(sheet);
    }).catch(function (e) { toast(e.message, true); });
  }

  // Queue: live progress and controls, and a gauge per drive.
  var ACTIVE = ["queued", "resolving", "connecting", "downloading", "verifying", "extracting", "installing", "pausing"];
  var DONE = ["downloaded", "file-downloaded", "installed", "extracted", "installer-required", "extraction-required"];
  var LABELS = { pause: "Pause", resume: "Resume", cancel: "Cancel", clear: "Clear" };
  var queueBusy = false;
  function loadQueue() {
    if (queueBusy) return;
    queueBusy = true;
    return api("GET", "/api/queue").then(renderQueue).catch(function (e) { toast(e.message, true); }).then(function () { queueBusy = false; });
  }
  function renderQueue(data) {
    var list = $("jobs"); list.textContent = "";
    var running = data.jobs.filter(function (j) { return ACTIVE.indexOf(j.state) >= 0; }).length;
    $("jobCount").textContent = data.jobs.length ? running + " active · " + data.jobs.length + " in all" : "";
    if (!data.jobs.length) { list.appendChild(el("p", "muted", "Nothing in the queue. Pick a game under Games.")); return; }
    data.jobs.forEach(function (j) {
      var p = el("div", "panel block"), top = el("div", "row");
      p.style.animation = "none";
      top.appendChild(el("div", "grow ellipsis", j.title));
      top.appendChild(el("span", "state" + (ACTIVE.indexOf(j.state) >= 0 ? " active" : j.state === "failed" ? " failed" : DONE.indexOf(j.state) >= 0 ? " done" : ""), j.state.replace(/-/g, " ")));
      p.appendChild(top);
      if (j.percent != null) { var bar = el("div", "bar" + (ACTIVE.indexOf(j.state) >= 0 ? " live" : "")), fill = el("i"); fill.style.width = j.percent + "%"; bar.appendChild(fill); p.appendChild(bar); }
      var detail = [j.percent != null ? j.percent + "%" : null, j.total ? bytes(j.written) + " of " + bytes(j.total) : j.written ? bytes(j.written) : null,
        j.bytesPerSecond ? bytes(j.bytesPerSecond) + "/s" : null, j.connections ? j.connections + " connections" : null].filter(Boolean).join(" · ");
      if (detail) p.appendChild(el("div", "subtle", detail));
      if (j.error || j.message) p.appendChild(el("div", "error", j.error || j.message));
      var actions = (j.actions || []).filter(function (a) { return LABELS[a]; });
      if (actions.length) {
        var row = el("div", "actions");
        actions.forEach(function (a) {
          var b = el("button", "btn" + (a === "cancel" ? " danger" : a === "resume" ? " primary" : ""), LABELS[a]);
          b.onclick = function () {
            if (a === "cancel" && b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Discard it?"; return; }
            b.disabled = true; buzz();
            api("POST", "/api/queue/" + a, { id: j.id }).then(function (d) { renderQueue(d); toast(LABELS[a] + ": " + j.title); }).catch(function (e) { toast(e.message, true); b.disabled = false; });
          };
          row.appendChild(b);
        });
        p.appendChild(row);
      }
      list.appendChild(p);
    });
  }
  var SVG = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) { var n = document.createElementNS(SVG, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  // A 240-degree dial: the lit part is the space used.
  function arc(fraction) {
    var r = 40, cx = 50, cy = 50, from = 210, to = 210 - 240 * Math.max(0, Math.min(1, fraction));
    function at(d) { var a = d * Math.PI / 180; return (cx + r * Math.cos(a)).toFixed(2) + " " + (cy - r * Math.sin(a)).toFixed(2); }
    return "M" + at(from) + "A" + r + " " + r + " 0 " + (from - to > 180 ? 1 : 0) + " 1 " + at(to);
  }
  function gauge(used) {
    var svg = svgEl("svg", { viewBox: "0 0 100 82", "aria-hidden": "true" });
    svg.appendChild(svgEl("path", { d: arc(1), fill: "none", stroke: "#1f2738", "stroke-width": "9" }));
    if (used > 0.004) {
      svg.appendChild(svgEl("path", { d: arc(used), fill: "none", stroke: used > 0.9 ? "#f87171" : "#4cc9f0", "stroke-width": "9", opacity: ".35", style: "filter:blur(2px)" }));
      svg.appendChild(svgEl("path", { d: arc(used), fill: "none", stroke: used > 0.9 ? "#f87171" : "#4cc9f0", "stroke-width": "6" }));
    }
    return svg;
  }
  function loadDrives() {
    return api("GET", "/api/storage").then(function (data) {
      var list = $("drives"); list.textContent = "";
      if (!data.drives.length) { list.appendChild(el("p", "muted", "No drive to download to.")); return; }
      data.drives.forEach(function (d) {
        var box = el("div", "panel drive"), known = d.total > 0 && d.free != null, used = known ? 1 - d.free / d.total : 0;
        box.appendChild(gauge(used));
        box.appendChild(el("div", "pct", known ? Math.round(used * 100) + "%" : "–"));
        box.appendChild(el("div", "name ellipsis", d.name));
        box.appendChild(el("div", "subtle", known ? bytes(d.free) + " free of " + bytes(d.total) : "Space unknown"));
        list.appendChild(box);
      });
    }).catch(function (e) { toast(e.message, true); });
  }
  var ticks = 0;
  setInterval(function () {
    if (tab !== "queue" || document.hidden || $("tabs").hidden) return;
    loadQueue();
    if (++ticks % 4 === 0) loadDrives();
  }, 1500);

  // Feeds: add, edit in place, remove (tapped twice), sync all.
  function loadFeeds() {
    return api("GET", "/api/feeds").then(renderFeeds).catch(function (e) { toast(e.message, true); });
  }
  function renderFeeds(data) {
    var list = $("feedList"); list.textContent = "";
    if (!data.feeds.length) list.appendChild(el("p", "muted", "No feeds yet. Paste a feed's .json address above."));
    data.feeds.forEach(function (f) {
      var p = el("div", "panel block"), text = el("div");
      text.appendChild(el("div", "ellipsis", f.name || f.url));
      text.appendChild(el("div", "subtle ellipsis", f.url));
      var status = f.state === "refreshing" ? "Syncing…" : f.state === "failed" ? "Couldn't sync: " + (f.error || "") : f.games + (f.games === 1 ? " game" : " games") + (f.fetchedAt ? " · updated " + f.fetchedAt.slice(0, 10) : "");
      text.appendChild(el("div", f.state === "failed" ? "error" : "subtle", status));
      if (f.via) text.appendChild(el("div", "subtle ellipsis", "Last updated from a mirror: " + f.via));
      (f.mirrors || []).forEach(function (m) {
        var line = el("div", "mirror"), name = el("span", "ellipsis grow", "Mirror · " + m);
        line.appendChild(name);
        if ((f.own || []).indexOf(m) >= 0) {
          var drop = el("button", "btn mini", "Remove");
          drop.onclick = function () { api("DELETE", "/api/feeds/mirrors?url=" + encodeURIComponent(f.url) + "&mirror=" + encodeURIComponent(m)).then(function (d) { renderFeeds(d); toast("Mirror removed"); }).catch(function (e) { toast(e.message, true); }); };
          line.appendChild(drop);
        }
        text.appendChild(line);
      });
      if (f.restart) text.appendChild(el("div", "subtle", "Reopen the app on the console to see what it brought in."));
      p.appendChild(text);
      var row = el("div", "actions"), edit = el("button", "btn", "Edit"), mirror = el("button", "btn", "Add mirror"), remove = el("button", "btn danger", "Remove");
      edit.onclick = function () {
        var form = el("div", "row"), input = el("input", "field grow"), save = el("button", "btn primary", "Save"), cancel = el("button", "btn", "Cancel");
        form.style.marginTop = "10px";
        input.type = "url"; input.value = f.url; input.setAttribute("autocapitalize", "off");
        save.onclick = function () {
          save.disabled = true;
          api("POST", "/api/feeds/edit", { from: f.url, url: input.value.trim() }).then(function (d) { renderFeeds(d); toast("Feed updated"); }).catch(function (e) { toast(e.message, true); save.disabled = false; });
        };
        cancel.onclick = function () { form.remove(); row.hidden = false; };
        form.appendChild(input); form.appendChild(save); form.appendChild(cancel);
        row.hidden = true; p.appendChild(form); input.focus();
      };
      mirror.onclick = function () {
        var form = el("div", "row"), input = el("input", "field grow"), save = el("button", "btn primary", "Add"), cancel = el("button", "btn", "Cancel");
        form.style.marginTop = "10px";
        input.type = "url"; input.placeholder = "https://mirror.example/catalog.json"; input.setAttribute("autocapitalize", "off");
        save.onclick = function () {
          save.disabled = true;
          api("POST", "/api/feeds/mirrors", { url: f.url, mirror: input.value.trim() }).then(function (d) { renderFeeds(d); toast("Mirror added"); }).catch(function (e) { toast(e.message, true); save.disabled = false; });
        };
        cancel.onclick = function () { form.remove(); row.hidden = false; };
        form.appendChild(input); form.appendChild(save); form.appendChild(cancel);
        row.hidden = true; p.appendChild(form); input.focus();
      };
      remove.onclick = function () {
        if (remove.dataset.sure !== "1") { remove.dataset.sure = "1"; remove.textContent = "Sure?"; return; }
        api("DELETE", "/api/feeds?url=" + encodeURIComponent(f.url)).then(function (d) { renderFeeds(d); toast("Feed removed"); }).catch(function (e) { toast(e.message, true); });
      };
      row.appendChild(edit); row.appendChild(mirror); row.appendChild(remove); p.appendChild(row);
      list.appendChild(p);
    });
    if (data.feeds.some(function (f) { return f.state === "refreshing"; })) setTimeout(function () { if (tab === "feeds") loadFeeds(); }, 1500);
  }
  $("addFeed").onclick = function () {
    var url = $("feedUrl").value.trim();
    if (!url) return;
    api("POST", "/api/feeds", { url: url }).then(function (d) { $("feedUrl").value = ""; renderFeeds(d); toast("Feed added and saved"); }).catch(function (e) { toast(e.message, true); });
  };
  $("syncFeeds").onclick = function () { buzz(); api("POST", "/api/feeds/refresh").then(function (d) { renderFeeds(d); toast("Syncing every feed"); }).catch(function (e) { toast(e.message, true); }); };

  // Remote: each tap is one press on the console; shortcuts open parts of the store there.
  $("remote").onclick = function (e) {
    var b = e.target.closest ? e.target.closest("button[data-press],button[data-quick]") : null;
    if (!b) return;
    buzz();
    if (b.dataset.press) api("POST", "/api/remote", { action: b.dataset.press }).catch(function (e2) { toast(e2.message, true); });
    else api("POST", "/api/quick", { action: b.dataset.quick }).then(function () { toast(b.dataset.quick === "refresh" ? "Syncing the store's feeds" : "Opened on the console"); }).catch(function (e2) { toast(e2.message, true); });
  };

  function start() {
    api("GET", "/api/info").then(function (info) {
      signedIn = true;
      $("version").textContent = "v" + info.version;
      $("login").hidden = true; $("tabs").hidden = false;
      show(tab); loadGames(true);
    }).catch(function (e) { if (!$("login").hidden) return; toast(e.message, true); });
  }
  start();
})();
</script>
</body></html>`.replace("__EXO2_500__", EXO2_500).replace("__EXO2_700__", EXO2_700);

export { PAGE };
