// The phone companion's page, served whole by the native server at `/`. Self-contained (no outside
// requests but game covers and homebrew art), touch-first, and safe with what the console sends: every
// value goes into the page as text, never as markup, and an image only ever gets an https address. The
// address carries no secret: the page asks for the 6-digit PIN Settings shows, and the console answers
// with a session cookie (HttpOnly, so this script never sees it) that the browser sends from then on.
// Every request adds X-JBH: 1, which the server requires.
// Five tabs (0.5.0):
//   Home      a live dashboard: the download in progress on a ring with its speed graph and time left, the
//             queue's counts, the drives, the homebrew with an update (Update all), shortcuts on the
//             console, and the catalog feeds (add, edit, mirrors, remove, sync);
//   Games     search the store and download to the console;
//   Homebrew  the Homebrew section: every app with its art, by category, installed or with an update, or
//             searched; an app's sheet installs, updates or runs it on the console, with its screenshots,
//             what's new and its files;
//   Queue     live progress, drive gauges, pause, resume, cancel;
//   Remote    the d-pad and buttons, and shortcuts.
// The console UI's look: deep ink panels, rounded shapes, the accent for focus and progress.
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
body{padding-bottom:calc(96px + env(safe-area-inset-bottom));background:radial-gradient(120% 60% at 50% -10%,rgba(58,134,255,.16),transparent 60%) fixed,var(--canvas)}
button,input{font-family:inherit}
.emblem{flex:0 0 auto}
.panel{background:var(--panel);border:1px solid var(--line)}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 16px 10px;background:rgba(5,8,17,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
header h1{font-size:19px;margin:0;font-weight:700;letter-spacing:.06em}
header .live{width:9px;height:9px;border-radius:99px;background:var(--subtle);margin-left:auto;transition:background .3s,box-shadow .3s}
header .live.on{background:var(--good);box-shadow:0 0 10px rgba(74,222,128,.8)}
header .version:empty{display:none}
header .version{color:var(--subtle);font-size:12px;padding:3px 9px;border:1px solid var(--line)}
main{padding:16px 16px 0;max-width:980px;margin:0 auto}
section{animation:enter .28s var(--ease)}
@keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
input.field{width:100%;padding:13px 14px;border:1px solid var(--line);background:var(--deep);color:var(--fg);font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s}
input.field:focus{border-color:var(--ice);box-shadow:0 0 0 3px rgba(76,201,240,.16)}
.label{display:flex;align-items:center;gap:10px;margin:22px 0 12px;font-weight:700;font-size:15px;letter-spacing:.08em;text-transform:uppercase}
.label::before{content:"";width:4px;height:16px;background:var(--ice);box-shadow:0 0 10px rgba(76,201,240,.8)}
.label span{margin-left:auto;color:var(--subtle);font-weight:500;font-size:12px;letter-spacing:.04em;text-transform:none}
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
.card .sub{color:var(--subtle);font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rail .card .meta{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 11px;background:linear-gradient(180deg,rgba(5,8,17,0),rgba(5,8,17,.94))}
.rail .card .title{font-size:17px}
button.btn{border:1px solid var(--line);padding:11px 16px;font:inherit;font-weight:600;font-size:15px;color:var(--fg);cursor:pointer;background:var(--panel2);transition:border-color .15s,box-shadow .2s,transform .12s var(--ease),background .2s}
button.btn:hover,button.btn:focus-visible{outline:none;border-color:var(--ice);box-shadow:0 0 0 1px var(--ice)}
button.btn:active{transform:scale(.97)}
button.btn:disabled{opacity:.45;cursor:default;box-shadow:none;border-color:var(--line)}
button.primary{background:linear-gradient(180deg,#3a86ff,#2f6fe0);border-color:#5a9bff;color:#fff;box-shadow:0 6px 18px rgba(58,134,255,.28)}
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
.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--ice));transition:width .6s var(--ease)}
.state{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.state.active{border-color:var(--ice);color:#d6f6ff;box-shadow:0 0 10px rgba(76,201,240,.3)}.state.failed{border-color:rgba(248,113,113,.6);color:#fecaca}.state.done{border-color:rgba(74,222,128,.5);color:#bbf7d0}.state.update{border-color:var(--accent);background:var(--accent);color:#fff}
.actions{display:flex;gap:8px;margin-top:10px}
.actions .btn{flex:1;padding:9px 10px;font-size:14px}
.error{color:#fecaca;font-size:13px;margin-top:6px}
.drives{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.drive{padding:12px 12px 10px;text-align:center}
.drive svg{width:100%;max-width:170px;display:block;margin:0 auto}
.drive .pct{font-weight:700;font-size:22px;letter-spacing:.04em;margin-top:-30px}
.drive .name{font-weight:600;margin-top:6px}
nav{position:fixed;left:0;right:0;bottom:0;z-index:6;display:flex;padding:6px 6px calc(6px + env(safe-area-inset-bottom));background:rgba(5,8,17,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line)}
nav button{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:1px solid transparent;color:var(--subtle);font:inherit;font-size:11px;font-weight:700;letter-spacing:.03em;padding:8px 2px 6px;cursor:pointer;transition:color .2s,border-color .2s,box-shadow .2s}
nav button svg{width:22px;height:22px;pointer-events:none}
nav button span{pointer-events:none}
nav button[aria-selected=true]{color:#fff;border-color:var(--ice);background:rgba(58,134,255,.12);box-shadow:0 0 16px rgba(76,201,240,.22)}
nav .dot{position:absolute;top:4px;right:calc(50% - 20px);min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--accent);color:#fff;font-size:11px;line-height:18px;text-align:center;box-shadow:0 0 10px rgba(58,134,255,.7)}
nav .dot:empty{display:none}
.sheet{position:fixed;inset:0;z-index:10;display:flex;align-items:flex-end;justify-content:center;padding:0;background:rgba(5,8,17,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fade .2s ease}
@media (min-width:640px){.sheet{align-items:center;padding:16px}}
@keyframes fade{from{opacity:0}}
.sheet>div{width:100%;max-width:560px;max-height:92vh;overflow:auto;padding:0 0 16px;background:var(--panel);border:1px solid var(--line);box-shadow:0 0 0 1px rgba(76,201,240,.15);animation:pop .3s var(--ease)}
@keyframes pop{from{opacity:0;transform:translateY(16px)}}
.sheet .hero{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:linear-gradient(135deg,var(--panel2),var(--deep));-webkit-mask-image:linear-gradient(180deg,#000 70%,transparent);mask-image:linear-gradient(180deg,#000 70%,transparent)}
.sheet .body{padding:4px 16px 0}
.sheet h2{margin:0 0 4px;font-size:23px;font-weight:700;letter-spacing:.03em}
.sheet h3{margin:18px 0 6px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.source{padding:10px 0;border-top:1px solid var(--line)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:264px;margin:0 auto}
.pad .btn{aspect-ratio:1;font-size:20px;display:flex;align-items:center;justify-content:center;padding:0}
.pad .btn svg{width:30px;height:30px;pointer-events:none}
.pad .ok{border-color:var(--ice);color:#d6f6ff}
.pad .gap{visibility:hidden}
.keys{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:264px;margin:12px auto 0}
.keys .btn{padding:12px 0;font-size:14px}
.quick{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.quick .btn{text-align:left;padding:12px 14px}
.quick .btn small{display:block;color:var(--subtle);font-weight:500;font-size:12px;margin-top:2px}
.toast{position:fixed;left:16px;right:16px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:20;margin:0 auto;max-width:520px;padding:12px 14px;background:var(--panel);border:1px solid var(--ice);box-shadow:0 0 18px rgba(76,201,240,.18);opacity:0;transform:translateY(8px);transition:.25s var(--ease);pointer-events:none}
.toast.show{opacity:1;transform:none}.toast.bad{border-color:rgba(248,113,113,.7);box-shadow:none}
.login{min-height:calc(100vh - 140px);display:flex;align-items:center;justify-content:center}
.login .card{width:100%;max-width:380px;text-align:center;padding:30px 24px 26px;cursor:default;animation:pop .4s var(--ease)}
.login .card:hover{box-shadow:none;border-color:var(--line)}
.login h2{margin:16px 0 6px;font-size:23px;font-weight:700;letter-spacing:.05em}
.login p{margin:0 0 20px}
.pin{width:100%;max-width:300px;margin:0 auto 18px;display:block;padding:14px 0;border:1px solid var(--line);background:var(--deep);color:#fff;font:600 34px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3em;text-indent:.3em;text-align:center;outline:none;caret-color:var(--ice);transition:border-color .2s,box-shadow .2s}
.pin:focus{border-color:var(--ice);box-shadow:0 0 0 3px rgba(76,201,240,.18)}
.login .btn{width:100%;max-width:300px;padding:14px}
.login .error{min-height:20px;margin-top:14px}
@keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.shake{animation:shake .35s}
.mirror{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:13px;color:var(--muted)}
.btn.mini{padding:4px 12px;font-size:12px}
.now{position:relative;display:flex;align-items:center;gap:16px;padding:16px;overflow:hidden}
.now::after{content:"";position:absolute;inset:-40% -20% auto auto;width:70%;aspect-ratio:1;background:radial-gradient(closest-side,rgba(76,201,240,.18),transparent);pointer-events:none}
.ring{flex:0 0 auto;width:112px;height:112px;position:relative}
.ring svg{width:112px;height:112px;transform:rotate(-90deg)}
.ring .pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:700;font-size:24px;line-height:1}
.ring .pct small{font-size:11px;color:var(--subtle);font-weight:600;letter-spacing:.08em;margin-top:4px}
.now h2{margin:0;font-size:19px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.spark{width:100%;height:56px;display:block;margin-top:8px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
.stat{padding:12px;text-align:left}
.stat b{display:block;font-size:24px;line-height:1.1}
.stat span{color:var(--subtle);font-size:12px;letter-spacing:.04em}
.chips{display:flex;gap:8px;overflow-x:auto;margin:12px -16px 4px;padding:2px 16px 8px;scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;border:1px solid var(--line);background:var(--panel);color:var(--fg);font:inherit;font-weight:600;font-size:13.5px;padding:8px 14px;cursor:pointer;white-space:nowrap}
.chip small{color:var(--subtle);font-weight:500;margin-left:6px}
.chip[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.chip[aria-pressed=true] small{color:#dbe8ff}
.hbgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:14px 10px}
.hb{display:block;width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;animation:rise .4s var(--ease) both}
.hb:active .art{transform:scale(.96)}
.art{position:relative;width:100%;aspect-ratio:1;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);transition:transform .15s var(--ease),box-shadow .2s;background:var(--panel2)}
.hb:hover .art,.hb:focus-visible .art{box-shadow:0 0 0 2px var(--ice)}
.art img.icon{width:100%;height:100%;object-fit:cover;display:block}
.art img.logo{width:80%;height:80%;object-fit:contain;display:block}
.art .mono{font-weight:700;font-size:30px;color:#ffffffee;letter-spacing:.04em}
.art img.avatar{position:absolute;right:6%;bottom:6%;width:30%;height:30%;object-fit:cover;border-radius:99px;border:2px solid #ffffffcc}
.art .tag{position:absolute;left:6px;top:6px;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;background:rgba(5,8,17,.82);color:#fff;border-radius:99px}
.art .tag.update{background:var(--accent)}.art .tag.installed{color:var(--good)}.art .tag.failed{background:#b91c1c}
.hb .name{margin-top:7px;font-weight:700;font-size:13.5px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hb .by{color:var(--subtle);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hbhead{display:flex;gap:14px;align-items:flex-end;margin-top:-46px;position:relative;padding:0 16px}
.hbhead .art{flex:0 0 96px;width:96px;border-width:2px;box-shadow:0 8px 22px rgba(0,0,0,.5)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.tags span{font-size:12px;font-weight:600;padding:3px 10px;border:1px solid var(--line);color:var(--muted)}
.tags span.pre{border-color:var(--warn);color:var(--warn)}
.shots{display:flex;gap:8px;overflow-x:auto;margin:6px -16px 0;padding:2px 16px 6px;scroll-snap-type:x mandatory;scrollbar-width:none}
.shots::-webkit-scrollbar{display:none}
.shots img{flex:0 0 82%;max-width:420px;aspect-ratio:16/9;object-fit:cover;scroll-snap-align:start;border:1px solid var(--line);background:var(--panel2)}
.notes{white-space:pre-wrap;color:var(--muted);font-size:14px}
.file{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);font-size:14px}
.file code{font:12.5px ui-monospace,Menlo,Consolas,monospace;color:var(--fg);word-break:break-all}
.back{display:inline-flex;align-items:center;gap:6px;margin:4px 0 0}
[hidden]{display:none!important}
.panel,.card,.block,.sheet>div,.toast,.login .card,.drive,.art,.stat{border-radius:18px}
.sheet>div{border-radius:22px 22px 0 0}
@media (min-width:640px){.sheet>div{border-radius:22px}}
.hbhead .art{border-radius:22px}
.card{overflow:hidden}
button.btn,input.field,.pin,.pad .btn,.keys .btn,.quick .btn{border-radius:12px}
.state,header .version,.bar,.bar>i,.chip,.tags span{border-radius:99px}
nav{border-radius:22px 22px 0 0}nav button{border-radius:14px}
.sheet .hero{border-radius:22px 22px 0 0}
.shots img{border-radius:14px}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style></head>
<body>
<header>
<svg class="emblem" width="42" height="28" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg>
<h1>Jobee'sLair</h1><i class="live" id="live" title="Connection to the console"></i><span class="version" id="version"></span>
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
<section id="home" hidden>
<div class="panel now" id="now">
<div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#1f2738" stroke-width="10"/><circle id="ringArc" cx="60" cy="60" r="52" fill="none" stroke="url(#ringGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 327"/><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a86ff"/><stop offset="1" stop-color="#4cc9f0"/></linearGradient></defs></svg><div class="pct" id="ringPct">&ndash;<small>IDLE</small></div></div>
<div class="grow"><div class="subtle" id="nowLabel">Now downloading</div><h2 id="nowTitle">Nothing downloading</h2><div class="subtle" id="nowDetail"></div><div class="actions" id="nowActions" hidden></div></div>
</div>
<svg class="spark" id="spark" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(76,201,240,.35)"/><stop offset="1" stop-color="rgba(76,201,240,0)"/></linearGradient></defs><path id="sparkArea" fill="url(#sparkFill)" d=""/><path id="sparkLine" fill="none" stroke="#4cc9f0" stroke-width="2" d=""/></svg>
<div class="stats"><div class="panel stat"><b id="statActive">0</b><span>IN THE QUEUE</span></div><div class="panel stat"><b id="statDone">0</b><span>FINISHED</span></div><div class="panel stat"><b id="statUpdates">0</b><span>HOMEBREW UPDATES</span></div></div>
<div id="updatesBox" hidden><div class="row" style="margin:22px 0 12px"><div class="label grow" style="margin:0">Homebrew updates</div><button class="btn primary" id="updateAll">Update all</button></div><div class="hbgrid" id="updateList"></div></div>
<div class="label">Storage <span>free space on the console</span></div>
<div class="drives" id="homeDrives"></div>
<div class="label">On the console</div>
<div class="quick" id="homeQuick">
<button class="btn" data-quick="homebrew">Homebrew<small>Open the section</small></button>
<button class="btn" data-quick="downloads">Downloads<small>Open the page</small></button>
<button class="btn" data-quick="home">Store<small>Discover page</small></button>
<button class="btn" data-quick="refresh">Refresh store<small>Sync every feed</small></button>
<button class="btn" id="openFeeds">Catalog feeds<small>Add and manage</small></button>
</div>
<div class="label">Report a problem</div>
<div class="panel block"><p class="subtle" style="margin:0 0 12px">Something went wrong? Send the console's log with your report on Discord. Keys, tokens and e-mail addresses are already blanked out of it.</p>
<div class="quick"><button class="btn" id="shareLog">Share log<small>Send it from your phone</small></button><button class="btn" id="saveLog">Save log<small>A .txt file</small></button><button class="btn" id="copyLog">Copy log<small>To paste it</small></button></div></div>
</section>
<section id="feeds" hidden>
<button class="btn mini back" id="feedsBack">&larr; Home</button>
<div class="panel block" style="margin-top:12px"><div class="row"><input class="field grow" id="feedUrl" type="url" inputmode="url" placeholder="https://&hellip;/catalog.json" autocomplete="off" autocapitalize="off"><button class="btn primary" id="addFeed">Add</button></div>
<p class="subtle" style="margin:10px 0 0">JSON catalog feeds add games and sources. The console shows what they bring in the next time it opens the app.</p></div>
<div class="row" style="margin:18px 0 12px"><div class="label grow" style="margin:0">Your feeds</div><button class="btn primary" id="syncFeeds">Sync all</button></div>
<div id="feedList"></div>
</section>
<section id="games" hidden>
<input class="field" id="q" type="search" placeholder="Search games" autocomplete="off">
<div id="featured"><div class="label">Popular now <span>swipe</span></div><div class="rail" id="rail"></div></div>
<div class="label">All games <span id="count"></span></div>
<div class="grid" id="grid"></div>
<button class="btn more" id="more" hidden>Show more</button>
</section>
<section id="homebrew" hidden>
<input class="field" id="hbq" type="search" placeholder="Search homebrew" autocomplete="off">
<div class="chips" id="hbChips"></div>
<div class="label" id="hbLabel">Homebrew <span id="hbCount"></span></div>
<div class="hbgrid" id="hbGrid"></div>
<button class="btn more" id="hbMore" hidden>Show more</button>
<p class="subtle" style="margin-top:22px">Every app installs from its author's own GitHub release. Jobee'sLair hosts none of them.</p>
</section>
<section id="queue" hidden>
<div class="label">Storage <span>free space on the console</span></div>
<div class="drives" id="drives"></div>
<div class="label">Downloads <span id="jobCount"></span></div>
<div id="jobs"></div>
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
<button class="btn" data-quick="homebrew">Homebrew<small>On the console</small></button>
<button class="btn" data-quick="downloads">Downloads<small>On the console</small></button>
<button class="btn" data-quick="search">Search<small>On the console</small></button>
<button class="btn" data-quick="settings">Settings<small>On the console</small></button>
</div>
</section>
</main>
<nav id="tabs" hidden>
<button data-tab="home" aria-selected="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg><span>Home</span></button><button data-tab="games"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/></svg><span>Games</span></button><button data-tab="homebrew"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/></svg><span>Homebrew</span><i class="dot" id="hbDot"></i></button><button data-tab="queue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span>Queue</span></button><button data-tab="remote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg><span>Remote</span></button>
</nav>
<div class="toast" id="toast" role="status"></div>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var SECTIONS = ["home", "feeds", "games", "homebrew", "queue", "remote"];
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function gb(n) { return Math.round(n * 10) / 10 + " GB"; }
  function bytes(n) { if (!n) return "0 B"; var u = ["B", "KB", "MB", "GB", "TB"], i = Math.min(4, Math.floor(Math.log(n) / Math.log(1000))); return (n / Math.pow(1000, i)).toFixed(i > 1 ? 1 : 0) + " " + u[i]; }
  function duration(s) { if (!isFinite(s) || s <= 0) return ""; if (s < 60) return Math.ceil(s) + " s"; if (s < 3600) return Math.ceil(s / 60) + " min"; return Math.floor(s / 3600) + " h " + Math.round(s % 3600 / 60) + " min"; }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
  // Only https art from the index or the catalog ever goes into an image.
  function img(cls, src) { var i = el("img", cls); i.alt = ""; i.loading = "lazy"; i.decoding = "async"; if (typeof src === "string" && /^https:\/\//.test(src)) i.src = src; return i; }
  var toastTimer;
  function toast(text, bad) { var t = $("toast"); t.textContent = text; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = "toast"; }, 3200); }
  function online(on) { $("live").className = "live" + (on ? " on" : ""); }
  function api(method, path, body) {
    var headers = { "X-JBH": "1" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", credentials: "same-origin" })
      .then(function (r) {
        online(true);
        return r.json().catch(function () { return {}; }).then(function (data) {
          // Jobee'sLair closed and its helper took the port (it says so in every answer): its own page is
          // loaded instead. The phone's cookie is the app's, so the helper takes it with no PIN.
          if (data && data.app === "closed") { closedApp(); throw new Error("Jobee'sLair is closed."); }
          // Several requests can be refused at once (Home asks for several things): the first brings the
          // card back with its reason, the rest leave it as it is.
          if (r.status === 401) { if (signedIn) showLogin("Signed out. Enter the PIN again."); else if ($("login").hidden) showLogin(""); throw new Error("Not signed in."); }
          if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
          return data;
        });
      }, function (e) { online(false); throw new Error("Couldn't reach the console."); });
  }
  var reloading = false;
  function closedApp() { if (reloading) return; reloading = true; toast("Jobee'sLair closed. Switching to the helper page…"); setTimeout(function () { location.reload(); }, 600); }
  var signedIn = false;
  function showLogin(message) {
    signedIn = false;
    SECTIONS.forEach(function (s) { $(s).hidden = true; });
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
        if (answer.data && answer.data.app === "closed") { $("pin").value = ""; closedApp(); return; }
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

  var tab = "home", gamesLoaded = false, hbLoaded = false;
  function show(name) {
    tab = name;
    SECTIONS.forEach(function (s) { $(s).hidden = s !== name; });
    var lit = name === "feeds" ? "home" : name;
    Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === lit)); });
    if (name === "home") loadHome();
    if (name === "queue") { loadQueue(); loadDrives($("drives")); }
    if (name === "feeds") loadFeeds();
    if (name === "games" && !gamesLoaded) { gamesLoaded = true; loadGames(true); }
    if (name === "homebrew" && !hbLoaded) { hbLoaded = true; loadHomebrew(true); }
    window.scrollTo(0, 0);
  }
  $("tabs").onclick = function (e) { var b = e.target.closest ? e.target.closest("button[data-tab]") : null; if (b) show(b.dataset.tab); };

  // ---- Home: the dashboard ----------------------------------------------------------------------------
  var speeds = [], homeBusy = false, lastUpdates = -1;
  function sparkline() {
    var w = 300, h = 56, max = Math.max.apply(null, speeds.concat([1]));
    if (speeds.length < 2) { $("sparkLine").setAttribute("d", ""); $("sparkArea").setAttribute("d", ""); return; }
    var step = w / (speeds.length - 1), d = "";
    speeds.forEach(function (v, i) { d += (i ? "L" : "M") + (i * step).toFixed(1) + " " + (h - 4 - (v / max) * (h - 10)).toFixed(1); });
    $("sparkLine").setAttribute("d", d);
    $("sparkArea").setAttribute("d", d + "L" + w + " " + h + "L0 " + h + "Z");
  }
  function renderNow(data) {
    var job = data.active, arc = $("ringArc"), C = 2 * Math.PI * 52;
    speeds.push(data.speed || 0); if (speeds.length > 60) speeds.shift(); sparkline();
    var acts = $("nowActions"); acts.textContent = "";
    if (!job) {
      arc.setAttribute("stroke-dasharray", "0 " + C);
      $("ringPct").textContent = ""; $("ringPct").appendChild(document.createTextNode("–")); $("ringPct").appendChild(el("small", null, "IDLE"));
      $("nowLabel").textContent = data.counts.total ? "Queue" : "All quiet";
      $("nowTitle").textContent = data.counts.total ? "Nothing downloading right now" : "Nothing in the queue";
      $("nowDetail").textContent = data.counts.done ? data.counts.done + " finished" : "Pick a game or some homebrew to send to the console.";
      acts.hidden = true; return;
    }
    var pct = job.percent != null ? job.percent : 0;
    arc.setAttribute("stroke-dasharray", (C * pct / 100).toFixed(1) + " " + C);
    $("ringPct").textContent = ""; $("ringPct").appendChild(document.createTextNode(job.percent != null ? Math.floor(pct) + "%" : "…")); $("ringPct").appendChild(el("small", null, job.state.replace(/-/g, " ").toUpperCase()));
    $("nowLabel").textContent = "Now downloading";
    $("nowTitle").textContent = job.title;
    var left = job.total && job.bytesPerSecond ? (job.total - job.written) / job.bytesPerSecond : 0;
    $("nowDetail").textContent = [job.part ? "Part " + job.part + " of " + job.parts : null, job.state === "awaiting-browser" ? (job.opensAt ? "Opens in the browser by itself in a moment" : "Waiting for the browser") : null, job.bytesPerSecond ? bytes(job.bytesPerSecond) + "/s" : null, job.total ? bytes(job.written) + " of " + bytes(job.total) : null, left ? duration(left) + " left" : null].filter(Boolean).join(" · ");
    (job.actions || []).filter(function (a) { return a === "pause" || a === "resume" || a === "browser"; }).forEach(function (a) {
      var b = el("button", "btn" + (a !== "pause" ? " primary" : ""), a === "pause" ? "Pause" : a === "browser" ? "Open part " + (job.part || "") + " on the console" : "Resume");
      b.onclick = function () { buzz(); b.disabled = true; api("POST", "/api/queue/" + a, { id: job.id }).then(function () { loadHome(); }).catch(function (e) { toast(e.message, true); b.disabled = false; }); };
      acts.appendChild(b);
    });
    acts.hidden = !acts.children.length;
  }
  function loadHome() {
    if (homeBusy) return;
    homeBusy = true;
    api("GET", "/api/dashboard").then(function (data) {
      renderNow(data);
      $("statActive").textContent = data.counts.active; $("statDone").textContent = data.counts.done;
      var hb = data.homebrew, updates = hb ? hb.updates : [];
      $("statUpdates").textContent = updates.length; $("hbDot").textContent = updates.length ? String(updates.length) : "";
      $("updatesBox").hidden = !updates.length;
      if (updates.length !== lastUpdates) {
        lastUpdates = updates.length;
        var list = $("updateList"); list.textContent = "";
        updates.forEach(function (a, i) { list.appendChild(hbTile(a, i)); });
      }
      renderDrives($("homeDrives"), data.drives);
    }).catch(function (e) { if (signedIn) toast(e.message, true); }).then(function () { homeBusy = false; if (signedIn && typeof warmLog === "function") warmLog(); });
  }
  $("updateAll").onclick = function () { buzz(); $("updateAll").disabled = true; api("POST", "/api/homebrew/update-all").then(function (r) { toast(r.started.length ? "Updating " + r.started.length + " on the console" : "Nothing to update"); lastUpdates = -1; loadHome(); }).catch(function (e) { toast(e.message, true); }).then(function () { $("updateAll").disabled = false; }); };
  $("openFeeds").onclick = function () { show("feeds"); };
  // Report a problem (0.5.0 Pre Release 4): the console's debug log, shared, saved or copied from the phone.
  // A phone only shares or copies from the tap itself, not after a wait, so the log is fetched ahead and kept
  // (warmLog); and over plain http the browser has no share sheet at all, so Share and Copy fall back to a
  // sheet showing the log, ready to select (and Save always works).
  var LOG_NAME = "jobeeslair-log.txt", logText = null, logAt = 0, logLoading = null;
  function getLog() {
    return fetch("/api/logs", { headers: { "X-JBH": "1" }, cache: "no-store", credentials: "same-origin" }).then(function (r) {
      if (r.status === 401) throw new Error("Sign in again to get the log.");
      if (!r.ok) throw new Error("The console didn't send its log (HTTP " + r.status + ").");
      return r.text();
    }, function () { throw new Error("Couldn't reach the console."); });
  }
  function warmLog(force) {
    if (logLoading || (!force && logText !== null && Date.now() - logAt < 30000)) return logLoading || Promise.resolve();
    logLoading = getLog().then(function (text) { logText = text; logAt = Date.now(); }, function () {}).then(function () { logLoading = null; });
    return logLoading;
  }
  function saveText(text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = LOG_NAME;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function showLogSheet(text, note) {
    var sheet = document.createElement("div"); sheet.className = "sheet";
    var card = document.createElement("div"), body = document.createElement("div"); body.className = "body"; body.style.paddingTop = "16px";
    var h = document.createElement("h2"); h.textContent = "Console log";
    var p = document.createElement("p"); p.className = "subtle"; p.textContent = note;
    var box = document.createElement("textarea"); box.className = "field"; box.readOnly = true; box.value = text;
    box.style.cssText = "width:100%;height:46vh;font-size:12px;font-family:ui-monospace,Menlo,monospace";
    var row = document.createElement("div"); row.className = "row"; row.style.cssText = "margin-top:12px;gap:10px";
    var all = document.createElement("button"); all.className = "btn primary grow"; all.textContent = "Select all";
    var save = document.createElement("button"); save.className = "btn grow"; save.textContent = "Save file";
    var close = document.createElement("button"); close.className = "btn grow"; close.textContent = "Close";
    row.appendChild(all); row.appendChild(save); row.appendChild(close);
    body.appendChild(h); body.appendChild(p); body.appendChild(box); body.appendChild(row); card.appendChild(body); sheet.appendChild(card);
    document.body.appendChild(sheet);
    function pick() { box.focus(); box.select(); try { box.setSelectionRange(0, text.length); } catch (e) {} }
    all.onclick = function () { pick(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} if (ok) toast("Log copied"); };
    save.onclick = function () { saveText(text); toast("Log saved as " + LOG_NAME); };
    close.onclick = function () { sheet.remove(); };
    sheet.onclick = function (e) { if (e.target === sheet) sheet.remove(); };
    setTimeout(pick, 80);
  }
  // Runs act with the log: at once from the tap when it is already here, else after fetching it.
  function withLog(button, act) {
    button.onclick = function () {
      buzz();
      if (logText !== null) { act(logText, true); return; }
      button.disabled = true;
      warmLog(true).then(function () {
        button.disabled = false;
        if (logText === null) toast("Couldn't get the log from the console.", true);
        else act(logText, false);
      });
    };
  }
  withLog($("shareLog"), function (text, fresh) {
    var file = typeof File === "function" ? new File([text], LOG_NAME, { type: "text/plain" }) : null;
    if (fresh && navigator.share) {
      var data = file && navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], title: "Jobee'sLair log" } : { title: "Jobee'sLair log", text: text.slice(-100000) };
      navigator.share(data).catch(function (e) { if (e && e.name !== "AbortError") showLogSheet(text, "Your browser wouldn't open its share sheet. Select all, copy, and paste it into your report."); });
      return;
    }
    showLogSheet(text, navigator.share ? "Tap Share log again to send it." : "Your browser can't open a share sheet from this address. Select all, copy, and paste it into your report, or save the file.");
  });
  withLog($("saveLog"), function (text) { saveText(text); toast("Log saved as " + LOG_NAME); });
  withLog($("copyLog"), function (text, fresh) {
    if (fresh && navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast("Log copied"); }, function () { showLogSheet(text, "Your browser wouldn't copy it by itself. Select all, then copy."); });
      return;
    }
    var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(t); t.focus(); t.select(); try { t.setSelectionRange(0, text.length); } catch (e) {}
    var ok = false; try { ok = fresh && document.execCommand("copy"); } catch (e) {}
    t.remove();
    if (ok) toast("Log copied"); else showLogSheet(text, "Your browser wouldn't copy it by itself. Select all, then copy.");
  });
  setTimeout(warmLog, 1500);
  $("feedsBack").onclick = function () { show("home"); };

  // ---- Games: search, a featured rail, the grid, and a sheet to download one to the console ---------
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
    var meta = el("div", "meta");
    meta.appendChild(el("div", "title", g.title));
    meta.appendChild(el("div", "sub", [g.platform.toUpperCase(), g.year, g.sizeGb ? gb(g.sizeGb) : null].filter(Boolean).join(" · ")));
    b.appendChild(img("cover", g.cover)); b.appendChild(meta);
    b.onclick = function () { openGame(g.id); };
    return b;
  }
  $("q").oninput = function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { query = $("q").value; loadGames(true); }, 250); };
  $("more").onclick = function () { loadGames(false); };
  function sheetOf() {
    var sheet = el("div", "sheet"), box = el("div");
    sheet.appendChild(box);
    sheet.onclick = function (e) { if (e.target === sheet) close(); };
    function close() { sheet.remove(); if (sheet.onclose) sheet.onclose(); }
    sheet.close = close;
    return { sheet: sheet, box: box };
  }
  function openGame(id) {
    api("GET", "/api/game?id=" + encodeURIComponent(id)).then(function (g) {
      var s = sheetOf(), box = s.box, inner = el("div", "body");
      box.appendChild(img("hero", g.cover)); box.appendChild(inner);
      inner.appendChild(el("h2", null, g.title));
      inner.appendChild(el("div", "subtle", [g.platform.toUpperCase(), g.year, g.developer, g.sizeGb ? gb(g.sizeGb) : null].filter(Boolean).join(" · ")));
      if (g.summary) inner.appendChild(el("p", "muted", g.summary));
      var go = el("button", "btn primary", "Download to console");
      go.style.width = "100%"; go.style.margin = "12px 0";
      var usable = g.sources.some(function (x) { return x.group === "direct" || x.group === "page"; });
      if (!usable) { go.disabled = true; go.textContent = g.sources.length ? "Start this one on the console" : "No source"; go.className = "btn"; }
      go.onclick = function () {
        go.disabled = true;
        api("POST", "/api/download", { id: g.id }).then(function (r) { toast("Queued on the console from " + r.source); s.sheet.close(); })
          .catch(function (e) { toast(e.message, true); go.disabled = false; });
      };
      inner.appendChild(go);
      g.sources.forEach(function (x) {
        var row = el("div", "source");
        row.appendChild(el("div", null, x.name + (x.size ? " · " + x.size : "")));
        row.appendChild(el("div", "subtle", [x.detail, x.group === "browser" ? "needs the console's browser" : null, x.group === "unavailable" ? "unavailable" : null].filter(Boolean).join(" · ")));
        inner.appendChild(row);
      });
      var close = el("button", "btn", "Close"); close.style.width = "100%"; close.style.marginTop = "12px";
      close.onclick = function () { s.sheet.close(); };
      inner.appendChild(close);
      document.body.appendChild(s.sheet);
    }).catch(function (e) { toast(e.message, true); });
  }

  // ---- Homebrew: the section, its categories, an app's sheet --------------------------------------------
  var TINTS = { emulators: ["#2b1055", "#7597de"], games: ["#5f0a2c", "#ff5f6d"], media: ["#1e3c72", "#2a9df4"], streaming: ["#0f2027", "#2c9a8f"], jailbreak: ["#3a0b0b", "#e0482a"], files: ["#11324d", "#3fa9d6"], dumps: ["#232526", "#7a8a99"], system: ["#16222a", "#3a8f8a"], controllers: ["#2d1b3d", "#b05ee6"], mods: ["#3d2a05", "#f2a516"], stores: ["#0b2e1f", "#2ec27e"], dev: ["#1c1c2e", "#6366f1"], linux: ["#2b2b0c", "#d4c21a"] };
  var KIND = { image: "App", app: "App", "archive-image": "App", payload: "Payload", "archive-payload": "Payload", pkg: "Package", "archive-pkg": "Package" };
  var STATE = { update: "Update", installed: "Installed", failed: "Failed", waiting: "Waiting", downloading: "", extracting: "Unpacking", installing: "Installing" };
  function tint(category) { var t = TINTS[category] || ["#1d2738", "#4cc9f0"]; return "linear-gradient(135deg," + t[1] + "," + t[0] + ")"; }
  function monogram(name) { var w = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "?").slice(0, 2)).toUpperCase(); }
  function art(a) {
    var box = el("div", "art");
    if (a.icon) box.appendChild(img("icon", a.icon));
    else {
      box.style.background = tint(a.category);
      if (a.logo) box.appendChild(img("logo", a.logo));
      else { box.appendChild(el("span", "mono", monogram(a.name))); if (a.avatar) box.appendChild(img("avatar", a.avatar)); }
    }
    return box;
  }
  function stateTag(a) {
    if (!a.state) return null;
    var text = a.state === "downloading" ? (a.percent != null ? a.percent + "%" : "…") : STATE[a.state];
    return text ? el("span", "tag " + a.state, text) : null;
  }
  function hbTile(a, i) {
    var b = el("button", "hb"), box = art(a), tag = stateTag(a);
    b.style.animationDelay = Math.min(i || 0, 16) * 22 + "ms";
    if (tag) box.appendChild(tag);
    b.appendChild(box);
    b.appendChild(el("div", "name", a.name));
    b.appendChild(el("div", "by", (KIND[a.kind] || "") + " · " + a.author));
    b.onclick = function () { openApp(a.id); };
    return b;
  }
  var hb = { q: "", category: "", filter: "", offset: 0, id: 0, timer: null };
  function chip(label, count, pressed, onclick) {
    var c = el("button", "chip", label);
    if (count != null) c.appendChild(el("small", null, String(count)));
    c.setAttribute("aria-pressed", String(pressed));
    c.onclick = function () { buzz(); onclick(); };
    return c;
  }
  function renderChips(data) {
    var box = $("hbChips"); box.textContent = "";
    var pick = function (category, filter) { return function () { hb.category = category; hb.filter = filter; loadHomebrew(true); }; };
    box.appendChild(chip("All", data.counts.all, !hb.category && !hb.filter, pick("", "")));
    if (data.counts.installed) box.appendChild(chip("Installed", data.counts.installed, hb.filter === "installed", pick("", "installed")));
    if (data.counts.updates) box.appendChild(chip("Updates", data.counts.updates, hb.filter === "updates", pick("", "updates")));
    data.categories.forEach(function (c) { box.appendChild(chip(c.name, c.count, hb.category === c.id, pick(c.id, ""))); });
  }
  function loadHomebrew(reset) {
    if (reset) { hb.offset = 0; $("hbGrid").textContent = ""; }
    var id = ++hb.id;
    var path = "/api/homebrew?q=" + encodeURIComponent(hb.q) + "&category=" + encodeURIComponent(hb.category) + "&filter=" + hb.filter + "&offset=" + hb.offset + "&limit=48";
    api("GET", path).then(function (data) {
      if (id !== hb.id) return;
      if (reset) renderChips(data);
      $("hbDot").textContent = data.counts.updates ? String(data.counts.updates) : "";
      var name = hb.filter === "installed" ? "Installed" : hb.filter === "updates" ? "Updates" : hb.category ? (data.categories.filter(function (c) { return c.id === hb.category; })[0] || {}).name : hb.q ? "Results" : "Homebrew";
      $("hbLabel").firstChild.textContent = (name || "Homebrew") + " ";
      $("hbCount").textContent = data.total + (data.total === 1 ? " app" : " apps");
      data.apps.forEach(function (a, i) { $("hbGrid").appendChild(hbTile(a, i)); });
      if (!data.total) $("hbGrid").appendChild(el("p", "muted", "Nothing here."));
      hb.offset = data.offset + data.apps.length;
      $("hbMore").hidden = hb.offset >= data.total;
    }).catch(function (e) { toast(e.message, true); });
  }
  $("hbq").oninput = function () { clearTimeout(hb.timer); hb.timer = setTimeout(function () { hb.q = $("hbq").value; loadHomebrew(true); }, 250); };
  $("hbMore").onclick = function () { loadHomebrew(false); };
  function openApp(id) {
    api("GET", "/api/homebrew/app?id=" + encodeURIComponent(id)).then(function (a) {
      var s = sheetOf(), box = s.box, poll = null;
      s.sheet.onclose = function () { clearInterval(poll); if (tab === "homebrew") loadHomebrew(true); };
      var hero = img("hero", a.hero || a.icon);
      if (!a.hero && !a.icon) hero.style.background = tint(a.category);
      box.appendChild(hero);
      var head = el("div", "hbhead"), title = el("div", "grow");
      head.appendChild(art(a));
      title.appendChild(el("h2", null, a.name));
      title.appendChild(el("div", "subtle ellipsis", "by " + a.author + " · " + a.repo));
      head.appendChild(title);
      box.appendChild(head);
      var inner = el("div", "body");
      box.appendChild(inner);
      var tags = el("div", "tags");
      [KIND[a.kind], "★ " + a.stars, a.version, a.license].filter(Boolean).forEach(function (t) { tags.appendChild(el("span", null, t)); });
      if (a.release.prerelease) tags.appendChild(el("span", "pre", "Pre-release"));
      if (a.installed) tags.appendChild(el("span", null, a.installed.version ? "Installed " + a.installed.version : "On the console"));
      inner.appendChild(tags);
      var actions = el("div", "actions"), status = el("div", "subtle");
      inner.appendChild(actions); inner.appendChild(status);
      function render(d) {
        actions.textContent = "";
        var busy = ["waiting", "downloading", "extracting", "installing"].indexOf(d.state) >= 0;
        if (busy) {
          var p = el("button", "btn primary", d.state === "downloading" ? "Downloading " + (d.percent != null ? d.percent + "%" : "…") : (STATE[d.state] || "Working") + "…"); p.disabled = true; actions.appendChild(p);
          var c = el("button", "btn danger", "Cancel"); c.onclick = function () { api("POST", "/api/homebrew/cancel", { id: d.id }).then(render).catch(function (e) { toast(e.message, true); }); }; actions.appendChild(c);
        } else {
          if (d.state !== "installed" || d.installed === null) {
            var label = d.state === "update" ? "Update to " + d.version : d.state === "failed" ? "Try again" : "Install on console";
            var go = el("button", "btn primary", label);
            go.onclick = function () { buzz(); go.disabled = true; api("POST", "/api/homebrew/install", { id: d.id }).then(function (n) { toast("Installing " + d.name + " on the console"); render(n); start2(); }).catch(function (e) { toast(e.message, true); go.disabled = false; }); };
            actions.appendChild(go);
          }
          if (d.installed && d.installed.runnable) {
            var run = el("button", "btn" + (d.state === "update" ? "" : " primary"), "▶ Run payload");
            run.onclick = function () { buzz(); run.disabled = true; api("POST", "/api/homebrew/run", { id: d.id }).then(function () { toast(d.name + " sent to the payload loader"); }).catch(function (e) { toast(e.message, true); }).then(function () { run.disabled = false; }); };
            actions.appendChild(run);
          }
        }
        status.textContent = d.error ? "Last try failed: " + d.error : (d.kind.indexOf("payload") >= 0 ? "A payload: kept on the console and run through your ELF loader (port 9021)." : d.kind.indexOf("pkg") >= 0 ? "A package for the console's installer." : "An app: it goes into homebrew/ and ShadowMount+ puts it on the home screen once you close Jobee'sLair.");
        status.className = d.error ? "error" : "subtle";
        if (!busy) clearInterval(poll);
      }
      function start2() { clearInterval(poll); poll = setInterval(function () { api("GET", "/api/homebrew/app?id=" + encodeURIComponent(a.id)).then(render).catch(function () {}); }, 1200); }
      render(a);
      if (["waiting", "downloading", "extracting", "installing"].indexOf(a.state) >= 0) start2();
      if (a.description) inner.appendChild(el("p", null, a.description));
      if (a.shots.length) { var shots = el("div", "shots"); a.shots.forEach(function (u) { shots.appendChild(img(null, u)); }); inner.appendChild(shots); }
      if (a.about) { inner.appendChild(el("h3", null, "About")); inner.appendChild(el("div", "notes", a.about)); }
      if (a.release.notes) { inner.appendChild(el("h3", null, "What's new in " + a.version)); inner.appendChild(el("div", "notes", a.release.notes)); }
      inner.appendChild(el("h3", null, "Files"));
      a.files.forEach(function (f, i) {
        var row = el("div", "file"), name = el("div", "grow");
        name.appendChild(el("code", null, f.name));
        name.appendChild(el("div", "subtle", [KIND[f.kind], f.size ? bytes(f.size) : null, i === 0 ? "recommended" : null].filter(Boolean).join(" · ")));
        row.appendChild(name);
        var b = el("button", "btn mini", "Install");
        b.onclick = function () { buzz(); api("POST", "/api/homebrew/install", { id: a.id, file: f.name }).then(function (n) { toast("Installing " + f.name); render(n); start2(); }).catch(function (e) { toast(e.message, true); }); };
        row.appendChild(b);
        inner.appendChild(row);
      });
      var close = el("button", "btn", "Close"); close.style.width = "100%"; close.style.marginTop = "14px";
      close.onclick = function () { s.sheet.close(); };
      inner.appendChild(close);
      document.body.appendChild(s.sheet);
    }).catch(function (e) { toast(e.message, true); });
  }

  // ---- Queue: live progress and controls, and a gauge per drive ---------------------------------------
  var ACTIVE = ["queued", "resolving", "connecting", "downloading", "verifying", "extracting", "installing", "pausing"];
  var DONE = ["downloaded", "file-downloaded", "installed", "extracted", "installer-required", "extraction-required", "attention"];
  var LABELS = { pause: "Pause", resume: "Resume", cancel: "Cancel", clear: "Clear", browser: "Open on console" };
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
      if (j.percent != null) { var bar = el("div", "bar"), fill = el("i"); fill.style.width = j.percent + "%"; bar.appendChild(fill); p.appendChild(bar); }
      var left = j.total && j.bytesPerSecond ? (j.total - j.written) / j.bytesPerSecond : 0;
      var detail = [j.percent != null ? j.percent + "%" : null, j.total ? bytes(j.written) + " of " + bytes(j.total) : j.written ? bytes(j.written) : null,
        j.bytesPerSecond ? bytes(j.bytesPerSecond) + "/s" : null, left ? duration(left) + " left" : null, j.connections ? j.connections + " connections" : null].filter(Boolean).join(" · ");
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
  function arcPath(fraction) {
    var r = 40, cx = 50, cy = 50, from = 210, to = 210 - 240 * Math.max(0, Math.min(1, fraction));
    function at(d) { var a = d * Math.PI / 180; return (cx + r * Math.cos(a)).toFixed(2) + " " + (cy - r * Math.sin(a)).toFixed(2); }
    return "M" + at(from) + "A" + r + " " + r + " 0 " + (from - to > 180 ? 1 : 0) + " 1 " + at(to);
  }
  function gauge(used) {
    var svg = svgEl("svg", { viewBox: "0 0 100 82", "aria-hidden": "true" });
    svg.appendChild(svgEl("path", { d: arcPath(1), fill: "none", stroke: "#1f2738", "stroke-width": "9" }));
    if (used > 0.004) {
      svg.appendChild(svgEl("path", { d: arcPath(used), fill: "none", stroke: used > 0.9 ? "#f87171" : "#4cc9f0", "stroke-width": "9", opacity: ".35", style: "filter:blur(2px)" }));
      svg.appendChild(svgEl("path", { d: arcPath(used), fill: "none", stroke: used > 0.9 ? "#f87171" : "#4cc9f0", "stroke-width": "6" }));
    }
    return svg;
  }
  function renderDrives(list, drives) {
    list.textContent = "";
    if (!drives.length) { list.appendChild(el("p", "muted", "No drive to download to.")); return; }
    drives.forEach(function (d) {
      var box = el("div", "panel drive"), known = d.total > 0 && d.free != null, used = known ? 1 - d.free / d.total : 0;
      box.appendChild(gauge(used));
      box.appendChild(el("div", "pct", known ? Math.round(used * 100) + "%" : "–"));
      box.appendChild(el("div", "name ellipsis", d.name));
      box.appendChild(el("div", "subtle", known ? bytes(d.free) + " free of " + bytes(d.total) : "Space unknown"));
      list.appendChild(box);
    });
  }
  function loadDrives(list) { return api("GET", "/api/storage").then(function (data) { renderDrives(list, data.drives); }).catch(function (e) { toast(e.message, true); }); }
  var ticks = 0;
  setInterval(function () {
    if (document.hidden || $("tabs").hidden) return;
    ticks++;
    if (tab === "home") loadHome();
    if (tab === "queue") { loadQueue(); if (ticks % 4 === 0) loadDrives($("drives")); }
  }, 1500);

  // ---- Feeds: add, edit in place, remove (tapped twice), sync all --------------------------------------
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
      function form(placeholder, value, submit, done) {
        var box = el("div", "row"), input = el("input", "field grow"), save = el("button", "btn primary", done), cancel = el("button", "btn", "Cancel");
        box.style.marginTop = "10px";
        input.type = "url"; input.value = value; input.placeholder = placeholder; input.setAttribute("autocapitalize", "off");
        save.onclick = function () { save.disabled = true; submit(input.value.trim()).catch(function (e) { toast(e.message, true); save.disabled = false; }); };
        cancel.onclick = function () { box.remove(); row.hidden = false; };
        box.appendChild(input); box.appendChild(save); box.appendChild(cancel);
        row.hidden = true; p.appendChild(box); input.focus();
      }
      edit.onclick = function () { form("", f.url, function (url) { return api("POST", "/api/feeds/edit", { from: f.url, url: url }).then(function (d) { renderFeeds(d); toast("Feed updated"); }); }, "Save"); };
      mirror.onclick = function () { form("https://mirror.example/catalog.json", "", function (url) { return api("POST", "/api/feeds/mirrors", { url: f.url, mirror: url }).then(function (d) { renderFeeds(d); toast("Mirror added"); }); }, "Add"); };
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

  // ---- Remote and shortcuts: each tap is one press on the console, or opens a part of it ------------------
  function quick(action) {
    buzz();
    api("POST", "/api/quick", { action: action }).then(function () { toast(action === "refresh" ? "Syncing the store's feeds" : "Opened on the console"); }).catch(function (e) { toast(e.message, true); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-press],button[data-quick]") : null;
    if (!b) return;
    if (b.dataset.quick) return quick(b.dataset.quick);
    buzz();
    api("POST", "/api/remote", { action: b.dataset.press }).catch(function (e2) { toast(e2.message, true); });
  });

  function start() {
    api("GET", "/api/info").then(function (info) {
      signedIn = true;
      $("version").textContent = "v" + info.version;
      $("login").hidden = true; $("tabs").hidden = false;
      show(tab);
    }).catch(function (e) { if (!$("login").hidden) return; toast(e.message, true); });
  }
  start();
})();
</script>
</body></html>`.replace("__EXO2_500__", EXO2_500).replace("__EXO2_700__", EXO2_700);

export { PAGE };
