// The phone companion's page, served whole by the native server at `/`. Self-contained (no outside
// requests but game covers and homebrew art), touch-first, and safe with what the console sends: every
// value goes into the page as text, never as markup, and an image only ever gets an https address. The
// address carries no secret: the page asks for the 6-digit PIN Settings shows, and the console answers
// with a session cookie (HttpOnly, so this script never sees it) that the browser sends from then on.
// Every request adds X-JBH: 1, which the server requires.
// MODIFIED (0.5.4): brought up to date with the console app.
//   - In the console's language: service.js builds the page with the phone.* messages of the language in use
//     (pageFor), and formats them here (a small ICU reader: {name}, plural, select). Right to left for Arabic and Urdu.
//   - Live: the page holds GET /api/events open (fetch, since EventSource cannot add X-JBH) and the console pushes
//     the queue, homebrew progress, announcements and notices as they change (LocalServer.push). Without a
//     stream (an old browser, the stream dropped) it asks every two seconds, as before, and reconnects.
//   - Tabs: Home, Games, Homebrew, Downloads, Remote; Library (with Fix it) and catalog feeds open from Home.
//     Downloads clears finished ones and cancels all; a game's sources each download on their own; a homebrew
//     app can be removed (keeping what it saved, or not) and its helper run; the remote has Triangle, Square,
//     L2 and R2. The console's announcements show under the header.
//   - The look follows the store and jobees.org: flat panels, small corners, no capsules or glows, labels in
//     Title Case.
//   - Later in 0.5.4, what typing on a controller made slow: a box on the console that asks for text (a debrid key, a
//     feed, a file link, a search) shows here with a field of its own; Settings (from Home) sets the debrid keys, the
//     speed limit, parts and the app's update; a download waiting on the browser has its page opened here and takes
//     the file link from here; a source a debrid service takes goes through it; a download that finishes or stops
//     says so, and the tab's title shows how far the running one is.

import { EXO2_500, EXO2_700 } from './fonts.js';

  var TEMPLATE = String.raw`<!doctype html>
<html lang="__LANG__" dir="__DIR__"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#05070d"><title>Jobee'sLair</title>
<style>
@font-face{font-family:"Exo 2";src:url(data:font/woff2;base64,__EXO2_500__) format("woff2");font-weight:300 550;font-display:swap}
@font-face{font-family:"Exo 2";src:url(data:font/woff2;base64,__EXO2_700__) format("woff2");font-weight:551 900;font-display:swap}
:root{--ink:#05070d;--deep:#090d16;--panel:#0f1520;--panel2:#151d2b;--raise:#1d2738;--line:#243047;--line-hi:#34445f;--fg:#f3f6fb;--muted:#aab4c6;--subtle:#7f8ca3;--accent:#3a86ff;--ice:#4cc9f0;--good:#4ade80;--warn:#fbbf24;--bad:#f87171;--red:#ff1e27;--hb:#4ade80;--ease:cubic-bezier(.2,.8,.2,1);--pad:16px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%;background:var(--ink);color:var(--fg);font:16px/1.5 "Exo 2",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{padding-bottom:calc(84px + env(safe-area-inset-bottom))}
button,input{font-family:inherit;font-size:inherit;color:inherit}
:focus-visible{outline:2px solid var(--ice);outline-offset:2px}
[hidden]{display:none!important}
svg.i{width:20px;height:20px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) max(var(--pad),env(safe-area-inset-right)) 10px max(var(--pad),env(safe-area-inset-left));background:var(--ink);border-bottom:1px solid var(--line)}
header h1{font-size:19px;margin:0;font-weight:700;letter-spacing:.02em}
.status{margin-inline-start:auto;display:flex;align-items:center;gap:8px;color:var(--subtle);font-size:13px}
.status i{width:9px;height:9px;border-radius:50%;background:var(--subtle)}
.status.on i{background:var(--good)}
.status.on{color:var(--muted)}
.version:empty{display:none}
.version{color:var(--subtle);font-size:13px;padding:2px 8px;border:1px solid var(--line);border-radius:4px}
.notes{display:grid;gap:1px;background:var(--line)}
.note{display:flex;gap:10px;align-items:flex-start;padding:10px max(var(--pad),env(safe-area-inset-right)) 10px max(var(--pad),env(safe-area-inset-left));background:var(--deep);font-size:14.5px;color:var(--fg)}
.note svg{color:var(--ice);margin-top:2px}
.note.warning svg{color:var(--warn)}
main{padding:16px max(var(--pad),env(safe-area-inset-right)) 0 max(var(--pad),env(safe-area-inset-left));max-width:980px;margin:0 auto}
section.view{animation:enter .22s var(--ease)}
@keyframes enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
h2.label{display:flex;align-items:baseline;gap:10px;margin:24px 0 10px;font-size:17px;font-weight:700}
h2.label span{margin-inline-start:auto;color:var(--subtle);font-weight:500;font-size:13px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px}
.block{padding:14px;margin-bottom:10px}
.row{display:flex;align-items:center;gap:10px}
.wrap{flex-wrap:wrap}
.grow{flex:1;min-width:0}
.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.muted{color:var(--muted)}.subtle{color:var(--subtle);font-size:13.5px}
.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.field{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--deep);color:var(--fg);outline:none}
.field:focus{border-color:var(--ice)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1px solid var(--line-hi);border-radius:8px;padding:10px 16px;font-weight:600;font-size:15px;color:var(--fg);background:var(--raise);cursor:pointer;transition:background .15s,border-color .15s,transform .1s}
.btn:active{transform:scale(.98)}
.btn:disabled{opacity:.45;cursor:default;transform:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.hb{background:var(--hb);border-color:var(--hb);color:#04210f}
.btn.danger{background:transparent;border-color:rgba(248,113,113,.6);color:#fecaca}
.btn.quiet{background:transparent}
.btn.small{min-height:34px;padding:6px 12px;font-size:13.5px}
.btn.wide{width:100%}
.actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.actions .btn{flex:1 1 140px}
.bar{position:relative;height:8px;background:var(--raise);border-radius:4px;overflow:hidden;margin:10px 0 8px}
.bar>i{position:absolute;inset:0 auto 0 0;background:var(--accent);border-radius:4px;transition:width .5s var(--ease)}
[dir=rtl] .bar>i{inset:0 0 0 auto}
.bar.full>i{background:var(--bad)}
.tag{display:inline-block;font-size:12.5px;font-weight:600;padding:2px 8px;border:1px solid var(--line-hi);border-radius:4px;color:var(--muted);white-space:nowrap}
.tag.active{border-color:var(--ice);color:var(--ice)}.tag.done{border-color:rgba(74,222,128,.55);color:var(--good)}.tag.failed{border-color:rgba(248,113,113,.6);color:#fecaca}.tag.update{border-color:var(--accent);color:#cfe0ff}
.now .pct{font-size:40px;font-weight:700;line-height:1}
.now h3{margin:4px 0 2px;font-size:19px;line-height:1.3}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{padding:12px;display:grid;gap:4px}
.stat svg{color:var(--ice)}
.stat b{font-size:26px;line-height:1.1}
.stat span{color:var(--muted);font-size:13px;line-height:1.3}
.list{display:grid;gap:10px}
.item{display:flex;gap:12px;align-items:center;padding:12px;width:100%;text-align:start;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:inherit;cursor:pointer}
.item:active{background:var(--panel2)}
.item svg.chev{color:var(--subtle)}
[dir=rtl] .item svg.chev{transform:scaleX(-1)}
.thumb{width:56px;height:56px;border-radius:6px;object-fit:cover;background:var(--raise);flex:0 0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px}
.card{display:block;width:100%;padding:0;text-align:start;color:inherit;overflow:hidden;cursor:pointer;background:var(--panel);border:1px solid var(--line);border-radius:10px}
.card:active{transform:scale(.98)}
.cover{aspect-ratio:3/4;width:100%;display:block;object-fit:cover;background:var(--raise)}
.card .meta{padding:9px 11px 11px}
.card .title{font-weight:700;font-size:14.5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .sub{color:var(--subtle);font-size:12.5px;margin-top:3px}
.rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 calc(-1 * var(--pad));padding:2px var(--pad) 10px;scrollbar-width:none}
.rail::-webkit-scrollbar{display:none}
.rail .card{flex:0 0 42%;max-width:220px;scroll-snap-align:start}
.tabsrow{display:flex;gap:4px;overflow-x:auto;margin:12px calc(-1 * var(--pad)) 4px;padding:0 var(--pad);border-bottom:1px solid var(--line);scrollbar-width:none}
.tabsrow::-webkit-scrollbar{display:none}
.tabsrow button{flex:0 0 auto;border:0;border-bottom:3px solid transparent;background:none;padding:10px 12px 9px;color:var(--muted);font-weight:600;font-size:14.5px;cursor:pointer;white-space:nowrap}
.tabsrow button small{color:var(--subtle);font-weight:500;margin-inline-start:6px}
.tabsrow button[aria-pressed=true]{color:var(--fg);border-bottom-color:var(--hb)}
.hbgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:14px 10px}
.hb{display:block;width:100%;padding:0;border:0;background:none;color:inherit;text-align:start;cursor:pointer}
.art{position:relative;width:100%;aspect-ratio:1;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:10px;background:var(--raise)}
.art img.icon{width:100%;height:100%;object-fit:cover;display:block}
.art img.logo{width:80%;height:80%;object-fit:contain;display:block}
.art .mono{font-weight:700;font-size:28px;color:#ffffffee}
.art .badge{position:absolute;inset-inline-start:6px;top:6px;font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(5,7,13,.86);color:#fff}
.art .badge.update{background:var(--accent)}.art .badge.installed{color:var(--good)}.art .badge.failed{background:#b91c1c}
.hb .name{margin-top:7px;font-weight:700;font-size:13.5px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hb .by{color:var(--subtle);font-size:12px}
.drives{display:grid;gap:10px}
.drive{padding:12px 14px}
.drive .bar{margin:8px 0 4px}
nav{position:fixed;inset:auto 0 0 0;z-index:6;display:flex;padding:0 0 env(safe-area-inset-bottom);background:var(--deep);border-top:1px solid var(--line)}
nav button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:0;border-top:3px solid transparent;color:var(--subtle);font-size:11.5px;font-weight:700;padding:7px 2px 8px;cursor:pointer}
nav button svg{width:22px;height:22px}
nav button[aria-selected=true]{color:var(--fg);border-top-color:var(--ice)}
nav .count{position:absolute;margin-inline-start:26px;margin-top:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:4px;background:var(--accent);color:#fff;font-size:11px;line-height:18px;text-align:center}
nav .count:empty{display:none}
nav button{position:relative}
.sheet{position:fixed;inset:0;z-index:10;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,7,13,.78);animation:fade .18s ease}
@media (min-width:640px){.sheet{align-items:center;padding:16px}}
@keyframes fade{from{opacity:0}}
.sheet>div{width:100%;max-width:560px;max-height:92vh;overflow:auto;padding:0 0 16px;background:var(--panel);border:1px solid var(--line);border-radius:12px 12px 0 0;animation:pop .24s var(--ease)}
@media (min-width:640px){.sheet>div{border-radius:12px}}
@keyframes pop{from{opacity:0;transform:translateY(14px)}}
.sheet .hero{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--raise)}
.sheet .body{padding:14px 16px 0}
.sheet h2{margin:0 0 4px;font-size:22px;line-height:1.25}
.sheet h3{margin:20px 0 8px;font-size:16px}
.source{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.shots{display:flex;gap:8px;overflow-x:auto;margin:6px calc(-1 * 16px) 0;padding:2px 16px 6px;scroll-snap-type:x mandatory;scrollbar-width:none}
.shots::-webkit-scrollbar{display:none}
.shots img{flex:0 0 82%;max-width:420px;aspect-ratio:16/9;object-fit:cover;scroll-snap-align:start;border-radius:8px;background:var(--raise)}
.notes-text{white-space:pre-wrap;color:var(--muted);font-size:14px}
.file{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);font-size:14px}
.file code{font:12.5px ui-monospace,Menlo,Consolas,monospace;word-break:break-all}
.callout{padding:12px 14px;border-radius:8px;border:1px solid var(--line-hi);background:var(--panel2);font-size:14.5px}
.callout.bad{border-color:rgba(248,113,113,.6)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px;margin:0 auto}
.pad .btn{aspect-ratio:1;padding:0;font-size:15px}
.pad .btn svg{width:30px;height:30px}
.pad .gap{visibility:hidden}
.face{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:300px;margin:14px auto 0}
.face .btn{aspect-ratio:1;padding:0}
.face .btn svg{width:26px;height:26px;stroke-width:2.4}
.shoulders{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-width:300px;margin:14px auto 0}
.shoulders .btn{padding:8px 0;font-size:14px}
.quick{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.quick .btn{justify-content:flex-start;text-align:start;flex-direction:column;align-items:flex-start;gap:2px;min-height:58px}
.quick .btn small{color:var(--subtle);font-weight:500;font-size:12.5px}
.toast{position:fixed;inset-inline:16px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:20;margin:0 auto;max-width:520px;padding:12px 14px;background:var(--panel2);border:1px solid var(--line-hi);border-radius:8px;opacity:0;transform:translateY(8px);transition:.22s var(--ease);pointer-events:none}
.toast.show{opacity:1;transform:none}.toast.bad{border-color:rgba(248,113,113,.7)}
.login{min-height:calc(100vh - 150px);display:flex;align-items:center;justify-content:center}
.login form{width:100%;max-width:380px;text-align:center;padding:28px 22px 24px}
.login h2{margin:14px 0 6px;font-size:22px}
.login p{margin:0 0 18px}
.pin{width:100%;max-width:300px;margin:0 auto 16px;display:block;padding:14px 0;border:1px solid var(--line-hi);border-radius:8px;background:var(--deep);color:#fff;font:600 32px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3em;text-indent:.3em;text-align:center;outline:none;direction:ltr}
.pin:focus{border-color:var(--ice)}
.login .btn{width:100%;max-width:300px}
.login .error{min-height:20px;margin-top:12px;color:#fecaca;font-size:14px}
@keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.shake{animation:shake .35s}
.mirror{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:13px;color:var(--muted)}
.back{margin:2px 0 6px}
[dir=rtl] .back svg{transform:scaleX(-1)}
.asking{margin:0 0 16px;padding:14px;border:1px solid var(--ice);border-radius:10px;background:var(--panel2)}
.asking .head{display:flex;align-items:center;gap:8px;color:var(--ice);font-size:13.5px;font-weight:600}
.asking b{display:block;margin:6px 0 2px;font-size:18px;line-height:1.3}
.asking form{margin-top:12px}
.asking .error{margin-top:8px;color:#fecaca;font-size:14px}
.asking .error:empty{display:none}
.setting{display:flex;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.setting:first-child{border-top:0;padding-top:0}
.setting b{display:block}
.seg{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.seg .btn{flex:1 1 72px;min-height:40px;padding:8px 10px;font-size:14px}
.seg .btn[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.switch{flex:0 0 auto;position:relative;width:54px;height:32px;padding:0;border:1px solid var(--line-hi);border-radius:6px;background:var(--raise);cursor:pointer}
.switch::after{content:"";position:absolute;top:4px;inset-inline-start:4px;width:22px;height:22px;border-radius:4px;background:var(--muted);transition:transform .18s var(--ease)}
.switch[aria-pressed=true]{background:var(--accent);border-color:var(--accent)}
.switch[aria-pressed=true]::after{background:#fff;transform:translateX(22px)}
[dir=rtl] .switch[aria-pressed=true]::after{transform:translateX(-22px)}
.switch:disabled{opacity:.5}
a.btn{text-decoration:none}
.ltr{direction:ltr;unicode-bidi:isolate}
[dir=rtl] .ell,[dir=rtl] .note .grow{unicode-bidi:plaintext}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style></head>
<body>
<header>
<svg width="42" height="28" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg>
<h1>Jobee'sLair</h1>
<div class="status" id="status"><i></i><span id="statusText"></span></div>
<span class="version ltr" id="version"></span>
</header>
<div class="notes" id="notes" hidden></div>
<main>
<div class="asking" id="asking" role="region" hidden>
<div class="head"><svg class="i" viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/></svg><span data-s="phone.typing.asking"></span></div>
<b id="askTitle"></b><div class="subtle" id="askDetail"></div>
<form class="row" id="askForm" autocomplete="off"><input class="field grow ltr" id="askText" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="btn primary" id="askSend" type="submit" data-s="phone.typing.send"></button><button class="btn" id="askClose" type="button" data-s="phone.close"></button></form>
<div class="error" id="askError" role="alert"></div>
</div>
<section id="login" class="login view" hidden>
<form class="panel" id="loginForm" autocomplete="off">
<svg width="84" height="56" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg>
<h2 data-s="phone.login.title"></h2>
<p class="muted" data-s="phone.login.where"></p>
<input class="pin" id="pin" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;">
<button class="btn primary" id="signIn" type="submit" data-s="phone.login.signIn"></button>
<div class="error" id="loginError" role="alert"></div>
</form>
</section>
<section id="home" class="view" hidden>
<div class="panel block now" id="now">
<div class="subtle" id="nowLabel"></div>
<div class="row" style="align-items:flex-end;gap:14px;margin-top:6px"><div class="pct ltr" id="nowPct"></div><div class="grow"><h3 class="ell" id="nowTitle"></h3><div class="subtle" id="nowDetail"></div></div></div>
<div class="bar" id="nowBar" hidden><i id="nowFill" style="width:0"></i></div>
<div class="actions" id="nowActions" hidden></div>
</div>
<div class="stats">
<div class="panel stat"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><b id="statActive">0</b><span data-s="phone.stat.queue"></span></div>
<div class="panel stat"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg><b id="statDone">0</b><span data-s="phone.stat.done"></span></div>
<div class="panel stat"><svg class="i" viewBox="0 0 24 24"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/></svg><b id="statUpdates">0</b><span data-s="phone.stat.updates"></span></div>
</div>
<div id="updatesBox" hidden><h2 class="label"><span style="margin:0" data-s="phone.home.updates"></span></h2><div class="hbgrid" id="updateList"></div><div class="actions"><button class="btn primary" id="updateAll" data-s="phone.home.updateAll"></button></div></div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.home.console"></span></h2>
<div class="list">
<button class="item" id="openLibrary"><svg class="i" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg><div class="grow"><b data-s="phone.library.title"></b><div class="subtle" id="libraryNote" data-s="phone.library.note"></div></div><svg class="i chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
<button class="item" id="openFeeds"><svg class="i" viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg><div class="grow"><b data-s="phone.feeds.title"></b><div class="subtle" data-s="phone.feeds.note"></div></div><svg class="i chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
<button class="item" id="openSettings"><svg class="i" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg><div class="grow"><b data-s="phone.settings.title"></b><div class="subtle" data-s="phone.settings.note"></div></div><svg class="i chev" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
</div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.storage.title"></span></h2>
<div class="drives" id="homeDrives"></div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.shortcuts.title"></span></h2>
<div class="quick">
<button class="btn" data-quick="homebrew"><span data-s="phone.tab.homebrew"></span><small data-s="phone.shortcuts.open"></small></button>
<button class="btn" data-quick="downloads"><span data-s="phone.tab.downloads"></span><small data-s="phone.shortcuts.open"></small></button>
<button class="btn" data-quick="home"><span data-s="phone.shortcuts.store"></span><small data-s="phone.shortcuts.discover"></small></button>
<button class="btn" data-quick="refresh"><span data-s="phone.shortcuts.refresh"></span><small data-s="phone.shortcuts.refreshNote"></small></button>
</div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.report.title"></span></h2>
<div class="panel block" id="report"><p class="subtle" style="margin:0 0 12px" data-s="phone.report.note"></p>
<div class="quick"><button class="btn" id="shareLog"><span data-s="phone.report.share"></span><small data-s="phone.report.shareNote"></small></button><button class="btn" id="saveLog"><span data-s="phone.report.save"></span><small data-s="phone.report.saveNote"></small></button><button class="btn" id="copyLog"><span data-s="phone.report.copy"></span><small data-s="phone.report.copyNote"></small></button></div></div>
</section>
<section id="library" class="view" hidden>
<button class="btn small quiet back" data-back="home"><svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg><span data-s="phone.tab.home"></span></button>
<h2 class="label" style="margin-top:8px"><span style="margin:0;color:var(--fg);font-size:19px;font-weight:700" data-s="phone.library.title"></span><span id="libraryCount"></span></h2>
<div class="list" id="libraryList"></div>
</section>
<section id="feeds" class="view" hidden>
<button class="btn small quiet back" data-back="home"><svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg><span data-s="phone.tab.home"></span></button>
<div class="panel block" style="margin-top:8px"><div class="row"><input class="field grow ltr" id="feedUrl" type="url" inputmode="url" placeholder="https://&hellip;/catalog.json" autocomplete="off" autocapitalize="off"><button class="btn primary" id="addFeed" data-s="phone.feeds.add"></button></div>
<p class="subtle" style="margin:10px 0 0" data-s="phone.feeds.explain"></p></div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.feeds.yours"></span><button class="btn small" id="syncFeeds" data-s="phone.feeds.sync"></button></h2>
<div id="feedList"></div>
</section>
<section id="settings" class="view" hidden>
<button class="btn small quiet back" data-back="home"><svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg><span data-s="phone.tab.home"></span></button>
<h2 class="label" style="margin-top:8px"><span style="margin:0;color:var(--fg);font-size:19px;font-weight:700" data-s="phone.settings.title"></span></h2>
<div id="settingsBody"></div>
</section>
<section id="games" class="view" hidden>
<input class="field" id="q" type="search" autocomplete="off" data-sp="phone.games.search">
<div id="featured"><h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.games.popular"></span></h2><div class="rail" id="rail"></div></div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.games.all"></span><span id="count"></span></h2>
<div class="grid" id="grid"></div>
<div class="actions"><button class="btn wide" id="more" hidden data-s="phone.more"></button></div>
</section>
<section id="homebrew" class="view" hidden>
<input class="field" id="hbq" type="search" autocomplete="off" data-sp="phone.homebrew.search">
<div class="tabsrow" id="hbTabs"></div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" id="hbLabel"></span><span id="hbCount"></span></h2>
<div class="hbgrid" id="hbGrid"></div>
<div class="actions"><button class="btn wide" id="hbMore" hidden data-s="phone.more"></button></div>
<p class="subtle" style="margin-top:22px" data-s="phone.homebrew.hosting"></p>
</section>
<section id="downloads" class="view" hidden>
<h2 class="label" style="margin-top:6px"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.tab.downloads"></span><span id="jobCount"></span></h2>
<div class="actions" id="bulk" style="margin:0 0 12px" hidden><button class="btn small" id="clearFinished" data-s="phone.downloads.clearFinished"></button><button class="btn small danger" id="cancelAll" data-s="phone.downloads.cancelAll"></button></div>
<div id="jobs"></div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.storage.title"></span></h2>
<div class="drives" id="drives"></div>
</section>
<section id="remote" class="view" hidden>
<h2 class="label" style="margin-top:6px"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.remote.title"></span><span data-s="phone.remote.note"></span></h2>
<div class="shoulders"><button class="btn" data-press="l2">L2</button><button class="btn" data-press="l1">L1</button><button class="btn" data-press="options" data-sa="phone.remote.options"><svg class="i" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg></button><button class="btn" data-press="r1">R1</button><button class="btn" data-press="r2">R2</button></div>
<div class="pad" style="margin-top:14px">
<button class="btn gap" tabindex="-1" aria-hidden="true"></button><button class="btn" data-press="up" data-sa="phone.remote.up"><svg class="i" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button><button class="btn gap" tabindex="-1" aria-hidden="true"></button>
<button class="btn" data-press="left" data-sa="phone.remote.left"><svg class="i" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button><button class="btn primary" data-press="confirm" data-sa="phone.remote.cross"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button><button class="btn" data-press="right" data-sa="phone.remote.right"><svg class="i" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
<button class="btn gap" tabindex="-1" aria-hidden="true"></button><button class="btn" data-press="down" data-sa="phone.remote.down"><svg class="i" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button><button class="btn gap" tabindex="-1" aria-hidden="true"></button>
</div>
<div class="face">
<button class="btn" data-press="triangle" data-sa="phone.remote.triangle"><svg class="i" viewBox="0 0 24 24" style="color:#5eead4"><path d="M12 4 21 19H3Z"/></svg></button>
<button class="btn" data-press="back" data-sa="phone.remote.circle"><svg class="i" viewBox="0 0 24 24" style="color:#fda4af"><circle cx="12" cy="12" r="8"/></svg></button>
<button class="btn" data-press="square" data-sa="phone.remote.square"><svg class="i" viewBox="0 0 24 24" style="color:#f0abfc"><path d="M5 5h14v14H5Z"/></svg></button>
<button class="btn" data-press="confirm" data-sa="phone.remote.cross"><svg class="i" viewBox="0 0 24 24" style="color:#93c5fd"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
</div>
<h2 class="label"><span style="margin:0;color:var(--fg);font-size:17px;font-weight:700" data-s="phone.shortcuts.title"></span></h2>
<div class="quick">
<button class="btn" data-quick="home"><span data-s="phone.shortcuts.store"></span><small data-s="phone.shortcuts.discover"></small></button>
<button class="btn" data-quick="homebrew"><span data-s="phone.tab.homebrew"></span><small data-s="phone.shortcuts.open"></small></button>
<button class="btn" data-quick="downloads"><span data-s="phone.tab.downloads"></span><small data-s="phone.shortcuts.open"></small></button>
<button class="btn" data-quick="search"><span data-s="phone.shortcuts.search"></span><small data-s="phone.shortcuts.open"></small></button>
<button class="btn" data-quick="settings"><span data-s="phone.shortcuts.settings"></span><small data-s="phone.shortcuts.open"></small></button>
<button class="btn" data-quick="refresh"><span data-s="phone.shortcuts.refresh"></span><small data-s="phone.shortcuts.refreshNote"></small></button>
</div>
</section>
</main>
<nav id="tabs" hidden>
<button data-tab="home" aria-selected="true"><svg class="i" viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg><span data-s="phone.tab.home"></span></button>
<button data-tab="games"><svg class="i" viewBox="0 0 24 24"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/></svg><span data-s="phone.tab.games"></span></button>
<button data-tab="homebrew"><svg class="i" viewBox="0 0 24 24"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/></svg><span data-s="phone.tab.homebrew"></span><i class="count" id="hbDot"></i></button>
<button data-tab="downloads"><svg class="i" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span data-s="phone.tab.downloads"></span><i class="count" id="dlDot"></i></button>
<button data-tab="remote"><svg class="i" viewBox="0 0 24 24"><path d="M6 11h4"/><path d="M8 9v4"/><path d="M15 12h.01"/><path d="M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59l-.885 8.86A3 3 0 0 0 4.8 20.75c.69 0 1.35-.28 1.83-.77L8 18.5h8l1.37 1.48c.48.49 1.14.77 1.83.77a3 3 0 0 0 2.98-3.3l-.885-8.86A4 4 0 0 0 17.32 5Z"/></svg><span data-s="phone.tab.remote"></span></button>
</nav>
<div class="toast" id="toast" role="status"></div>
<script>
(function () {
  "use strict";
  var S = __STRINGS__;
  var LANG = document.documentElement.lang || "en";
  var $ = function (id) { return document.getElementById(id); };
  // ---- Messages: the console's phone.* strings, in its language; {name}, plural and select as the app writes them.
  var plurals = {};
  function pluralOf(n) {
    try { var rules = plurals[LANG] || (plurals[LANG] = new Intl.PluralRules(LANG)); return rules.select(n); } catch (e) { return n === 1 ? "one" : "other"; }
  }
  function render(text, params, hash) {
    var out = "", i = 0;
    while (i < text.length) {
      var c = text[i];
      if (c === "#" && hash != null) { out += hash; i++; continue; }
      if (c !== "{") { out += c; i++; continue; }
      var depth = 0, j = i;
      for (; j < text.length; j++) { if (text[j] === "{") depth++; else if (text[j] === "}" && --depth === 0) break; }
      var inner = text.slice(i + 1, j), comma = inner.indexOf(",");
      i = j + 1;
      if (comma < 0) { var v = params[inner.trim()]; out += v == null ? "" : String(v); continue; }
      var name = inner.slice(0, comma).trim(), rest = inner.slice(comma + 1), comma2 = rest.indexOf(",");
      var kind = rest.slice(0, comma2).trim(), cases = rest.slice(comma2 + 1), value = params[name], picked = null, k = 0;
      var key = kind === "plural" ? pluralOf(Number(value)) : String(value), matched = null, other = null;
      while (k < cases.length) {
        var open = cases.indexOf("{", k); if (open < 0) break;
        var label = cases.slice(k, open).trim(), d = 0, e2 = open;
        for (; e2 < cases.length; e2++) { if (cases[e2] === "{") d++; else if (cases[e2] === "}" && --d === 0) break; }
        var body = cases.slice(open + 1, e2);
        if (label === "=" + value) { picked = body; break; }
        if (label === key && matched === null) matched = body;
        if (label === "other") other = body;
        k = e2 + 1;
      }
      out += render(picked !== null ? picked : matched !== null ? matched : other || "", params, kind === "plural" ? number(Number(value)) : null);
    }
    return out;
  }
  function s(key, params) { var text = S[key]; return text == null ? key : render(text, params || {}, null); }
  function number(n) { try { return new Intl.NumberFormat(LANG).format(n); } catch (e) { return String(n); } }
  document.querySelectorAll("[data-s]").forEach(function (n) { n.textContent = s(n.getAttribute("data-s")); });
  document.querySelectorAll("[data-sp]").forEach(function (n) { n.placeholder = s(n.getAttribute("data-sp")); });
  document.querySelectorAll("[data-sa]").forEach(function (n) { n.setAttribute("aria-label", s(n.getAttribute("data-sa"))); });
  $("pin").setAttribute("aria-label", s("phone.login.pin"));
  $("status").title = s("phone.status.title");
  // ---- Small things ------------------------------------------------------------------------------------------
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function bytes(n) { if (!n) return number(0) + " B"; var u = ["B", "KB", "MB", "GB", "TB"], i = Math.min(4, Math.floor(Math.log(n) / Math.log(1000))); var v = n / Math.pow(1000, i); try { return new Intl.NumberFormat(LANG, { maximumFractionDigits: i > 1 ? 1 : 0 }).format(v) + " " + u[i]; } catch (e) { return v.toFixed(i > 1 ? 1 : 0) + " " + u[i]; } }
  function duration(sec) { if (!isFinite(sec) || sec <= 0) return ""; if (sec < 60) return s("phone.time.seconds", { n: Math.ceil(sec) }); if (sec < 3600) return s("phone.time.minutes", { n: Math.ceil(sec / 60) }); return s("phone.time.hours", { h: Math.floor(sec / 3600), m: Math.round(sec % 3600 / 60) }); }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
  // Only https art from the index or the catalog ever goes into an image.
  function img(cls, src) { var i = el("img", cls); i.alt = ""; i.loading = "lazy"; i.decoding = "async"; if (typeof src === "string" && /^https:\/\//.test(src)) i.src = src; return i; }
  var SVG = "http://www.w3.org/2000/svg";
  function icon(paths) { var svg = document.createElementNS(SVG, "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "i"); paths.forEach(function (d) { var p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); svg.appendChild(p); }); return svg; }
  var toastTimer;
  function toast(text, bad) { var t = $("toast"); t.textContent = text; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = "toast"; }, 3600); }
  var connected = false, live = false;
  function status() { var n = $("status"); n.className = "status" + (connected ? " on" : ""); $("statusText").textContent = connected ? (live ? s("phone.status.live") : s("phone.status.connected")) : s("phone.status.offline"); }
  function online(on) { if (connected !== on) { connected = on; status(); } }
  // Errors the console names by code are said here in the phone's language; others come as the console wrote them.
  function failureText(data, statusCode) { if (data && data.code && S["phone.error." + data.code]) return s("phone.error." + data.code); return (data && data.error) || s("phone.error.http", { status: statusCode }); }
  function api(method, path, body) {
    var headers = { "X-JBH": "1" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", credentials: "same-origin" })
      .then(function (r) {
        online(true);
        return r.json().catch(function () { return {}; }).then(function (data) {
          // Jobee'sLair closed and its helper took the port (it says so in every answer): its own page is loaded instead.
          if (data && data.app === "closed") { closedApp(); throw new Error(s("phone.error.closed")); }
          if (r.status === 401) { if (signedIn) showLogin(s("phone.login.signedOut")); else if ($("login").hidden) showLogin(""); throw new Error(s("phone.login.signedOut")); }
          if (!r.ok) throw new Error(failureText(data, r.status));
          return data;
        });
      }, function () { online(false); throw new Error(s("phone.error.unreachable")); });
  }
  var reloading = false;
  function closedApp() { if (reloading) return; reloading = true; toast(s("phone.error.closed")); setTimeout(function () { location.reload(); }, 600); }
  // ---- Signing in --------------------------------------------------------------------------------------------
  var signedIn = false;
  var VIEWS = ["home", "library", "feeds", "settings", "games", "homebrew", "downloads", "remote"];
  function showLogin(message) {
    signedIn = false; stopEvents();
    VIEWS.forEach(function (v) { $(v).hidden = true; });
    $("asking").hidden = true; asking = null;
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
        if (answer.status === 429) return refuse(s("phone.login.tooMany", { seconds: answer.data.retryAfter || 30 }));
        if (answer.status === 423) return refuse(s("phone.login.locked"));
        if (answer.status === 401 && answer.data.retryAfter) return refuse(s("phone.login.wrongWait", { seconds: answer.data.retryAfter }));
        refuse(s("phone.login.wrong"));
      })
      .catch(function () { refuse(s("phone.error.unreachable")); })
      .then(function () { signing = false; $("signIn").disabled = false; });
  }
  $("loginForm").onsubmit = function (e) { e.preventDefault(); signIn(); };
  $("pin").oninput = function () {
    var digits = $("pin").value.replace(/[^0-9]/g, "").slice(0, 6);
    if ($("pin").value !== digits) $("pin").value = digits;
    if (digits.length === 6) signIn();
  };
  // ---- Views -------------------------------------------------------------------------------------------------
  var view = "home", gamesLoaded = false, hbLoaded = false;
  function show(name) {
    view = name;
    VIEWS.forEach(function (v) { $(v).hidden = v !== name; });
    var lit = name === "feeds" || name === "library" || name === "settings" ? "home" : name;
    Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === lit)); });
    if (name === "home") loadHome();
    if (name === "library") loadLibrary();
    if (name === "downloads") { loadQueue(); loadDrives($("drives")); }
    if (name === "feeds") loadFeeds();
    if (name === "settings") loadSettings();
    if (name === "games" && !gamesLoaded) { gamesLoaded = true; loadGames(true); }
    if (name === "homebrew" && !hbLoaded) { hbLoaded = true; loadHomebrew(true); }
    window.scrollTo(0, 0);
  }
  $("tabs").onclick = function (e) { var b = e.target.closest ? e.target.closest("button[data-tab]") : null; if (b) show(b.dataset.tab); };
  document.querySelectorAll("[data-back]").forEach(function (b) { b.onclick = function () { show(b.dataset.back); }; });
  $("openLibrary").onclick = function () { show("library"); };
  $("openFeeds").onclick = function () { show("feeds"); };
  $("openSettings").onclick = function () { show("settings"); };
  // ---- The console asking for text (a key, a link, a feed, a search): answered from here ----------------------------
  // The box shows on every tab while a box on the console is open, and goes when it closes. What is sent goes in as if
  // typed on the console; a refusal (a link that is not one, a key of the wrong shape) shows under the field.
  var asking = null;
  function renderAsking(next) {
    var was = asking;
    asking = next && signedIn ? next : null;
    $("asking").hidden = !asking;
    if (!asking) { $("askError").textContent = ""; return; }
    if (was && was.id === asking.id) return;
    $("askTitle").textContent = asking.title;
    $("askDetail").textContent = asking.detail || ""; $("askDetail").hidden = !asking.detail;
    var input = $("askText");
    input.value = ""; $("askError").textContent = "";
    input.type = asking.kind === "url" ? "url" : asking.kind === "search" ? "search" : "text";
    input.setAttribute("inputmode", asking.kind === "url" ? "url" : "text");
    input.placeholder = asking.kind === "url" ? "https://…" : s("phone.typing.placeholder");
    if (!was) { buzz(); window.scrollTo(0, 0); }
  }
  function loadAsking() { return api("GET", "/api/typing").then(function (d) { renderAsking(d.asking); }).catch(function () {}); }
  $("askForm").onsubmit = function (e) {
    e.preventDefault();
    var box = asking, button = $("askSend");
    if (!box || button.disabled) return;
    // Nothing typed is no answer to a key or a link (the console takes an empty key as "remove it"); a search may be cleared.
    if (!$("askText").value.trim() && box.kind !== "search") { $("askText").focus(); return; }
    button.disabled = true; $("askError").textContent = ""; buzz();
    api("POST", "/api/typing", { id: box.id, text: $("askText").value }).then(function () { $("askText").value = ""; toast(s("phone.typing.sent")); })
      .catch(function (e2) { $("askError").textContent = e2.message; }).then(function () { button.disabled = false; });
  };
  // Close: the console's box goes unanswered, as Circle would close it, and the PS5 keyboard with it.
  $("askClose").onclick = function () {
    var box = asking, button = $("askClose");
    if (!box || button.disabled) return;
    button.disabled = true; $("askError").textContent = ""; buzz();
    api("POST", "/api/typing/close", { id: box.id }).catch(function (e2) { $("askError").textContent = e2.message; })
      .then(function () { button.disabled = false; });
  };
  // The tab's title says how far the download running is, for a phone with the page in another tab.
  function titleFor(job) { document.title = job && job.percent != null ? Math.floor(job.percent) + "% · Jobee'sLair" : "Jobee'sLair"; }
  // A download that finishes or stops while the page is open says so (once, from the second look on).
  var lastStates = null;
  function noteChanges(jobs) {
    var next = {};
    jobs.forEach(function (j) {
      next[j.id] = j.state;
      var before = lastStates && lastStates[j.id];
      if (!before || before === j.state) return;
      if (DONE.indexOf(j.state) >= 0 && DONE.indexOf(before) < 0) { toast(s("phone.done.finished", { title: j.title })); try { if (navigator.vibrate) navigator.vibrate([30, 60, 30]); } catch (e) {} }
      else if (j.state === "failed") toast(s("phone.done.failed", { title: j.title }), true);
    });
    lastStates = next;
  }
  // ---- Announcements from the console (Jobee'sLair online) ---------------------------------------------------------
  function renderNotes(notes) {
    var box = $("notes"); box.textContent = "";
    (notes || []).forEach(function (n) {
      var row = el("div", "note" + (n.level === "warning" ? " warning" : ""));
      row.appendChild(icon(n.level === "warning" ? ["M12 9v4", "M12 17h.01", "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"] : ["M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14", "M8 6v8"]));
      row.appendChild(el("div", "grow", n.text));
      box.appendChild(row);
    });
    box.hidden = !box.children.length;
  }
  // ---- Home --------------------------------------------------------------------------------------------------
  var homeBusy = false, lastUpdates = -1;
  var ACTIVE = ["queued", "resolving", "connecting", "downloading", "verifying", "extracting", "installing", "pausing"];
  var DONE = ["downloaded", "file-downloaded", "installed", "extracted", "installer-required", "extraction-required", "attention"];
  function stateName(state) { return S["phone.state." + state] != null ? s("phone.state." + state) : state.replace(/-/g, " "); }
  function renderNow(data) {
    var job = data.active, acts = $("nowActions"); acts.textContent = "";
    titleFor(job);
    if (!job) {
      $("nowPct").textContent = "";
      $("nowLabel").textContent = data.counts.total ? s("phone.now.waiting") : s("phone.now.quiet");
      $("nowTitle").textContent = data.counts.total ? s("phone.now.nothingRunning") : s("phone.now.empty");
      $("nowDetail").textContent = data.counts.done ? s("phone.now.finished", { count: data.counts.done }) : s("phone.now.pick");
      $("nowBar").hidden = true; acts.hidden = true; return;
    }
    var pct = job.percent != null ? job.percent : 0;
    $("nowPct").textContent = job.percent != null ? Math.floor(pct) + "%" : "";
    $("nowLabel").textContent = stateName(job.state);
    $("nowTitle").textContent = job.title;
    $("nowBar").hidden = job.percent == null; $("nowFill").style.width = pct + "%";
    var left = job.total && job.bytesPerSecond ? (job.total - job.written) / job.bytesPerSecond : 0;
    $("nowDetail").textContent = [job.part ? s("phone.now.part", { part: job.part, parts: job.parts }) : null, job.state === "awaiting-browser" ? (job.opensAt ? s("phone.now.opensSoon") : s("phone.now.waitingBrowser")) : null, job.bytesPerSecond ? bytes(job.bytesPerSecond) + "/s" : null, job.total ? s("phone.now.of", { written: bytes(job.written), total: bytes(job.total) }) : null, left ? s("phone.now.left", { time: duration(left) }) : null].filter(Boolean).join(" · ");
    (job.actions || []).filter(function (a) { return a === "pause" || a === "resume" || a === "browser"; }).forEach(function (a) {
      var b = el("button", "btn" + (a !== "pause" ? " primary" : ""), a === "pause" ? s("phone.action.pause") : a === "browser" ? s("phone.action.browserPart", { part: job.part || 1 }) : s("phone.action.resume"));
      b.onclick = function () { buzz(); b.disabled = true; api("POST", "/api/queue/" + a, { id: job.id }).then(function () { if (!live) loadHome(); }).catch(function (e) { toast(e.message, true); b.disabled = false; }); };
      acts.appendChild(b);
    });
    acts.hidden = !acts.children.length;
  }
  function renderCounts(data) {
    $("statActive").textContent = number(data.counts.active); $("statDone").textContent = number(data.counts.done);
    $("dlDot").textContent = data.counts.active ? String(data.counts.active) : "";
  }
  function renderUpdates(updates) {
    $("statUpdates").textContent = number(updates.length); $("hbDot").textContent = updates.length ? String(updates.length) : "";
    $("updatesBox").hidden = !updates.length;
    if (updates.length === lastUpdates) return;
    lastUpdates = updates.length;
    var list = $("updateList"); list.textContent = "";
    updates.forEach(function (a) { list.appendChild(hbTile(a)); });
  }
  function loadHome() {
    if (homeBusy) return;
    homeBusy = true;
    api("GET", "/api/dashboard").then(function (data) {
      renderNow(data); renderCounts(data);
      var hb = data.homebrew; renderUpdates(hb ? hb.updates : []);
      renderDrives($("homeDrives"), data.drives);
      if (data.notes) renderNotes(data.notes);
      if ("asking" in data) renderAsking(data.asking);
    }).catch(function (e) { if (signedIn) toast(e.message, true); }).then(function () { homeBusy = false; if (signedIn && !window.IntersectionObserver) warmLog(); });
  }
  $("updateAll").onclick = function () { buzz(); $("updateAll").disabled = true; api("POST", "/api/homebrew/update-all").then(function (r) { toast(r.started.length ? s("phone.home.updating", { count: r.started.length }) : s("phone.home.nothingToUpdate")); lastUpdates = -1; loadHome(); }).catch(function (e) { toast(e.message, true); }).then(function () { $("updateAll").disabled = false; }); };
  // Report a problem: the console's debug log, shared, saved or copied. A phone only shares or copies from the tap
  // itself, so the log is fetched ahead and kept (warmLog); over plain http there is no share sheet at all, so Share
  // and Copy fall back to a sheet showing the log, ready to select (and Save always works).
  var LOG_NAME = "jobeeslair-log.txt", logText = null, logAt = 0, logLoading = null;
  function getLog() {
    return fetch("/api/logs", { headers: { "X-JBH": "1" }, cache: "no-store", credentials: "same-origin" }).then(function (r) {
      if (r.status === 401) throw new Error(s("phone.login.signedOut"));
      if (!r.ok) throw new Error(s("phone.error.http", { status: r.status }));
      return r.text();
    }, function () { throw new Error(s("phone.error.unreachable")); });
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
    var sh = sheetOf(), body = el("div", "body");
    body.appendChild(el("h2", null, s("phone.report.log")));
    body.appendChild(el("p", "subtle", note));
    var box = el("textarea", "field ltr"); box.readOnly = true; box.value = text; box.style.cssText = "height:46vh;font-size:12px;font-family:ui-monospace,Menlo,monospace";
    body.appendChild(box);
    var row = el("div", "actions"), all = el("button", "btn primary", s("phone.report.selectAll")), save = el("button", "btn", s("phone.report.save")), close = el("button", "btn", s("phone.close"));
    row.appendChild(all); row.appendChild(save); row.appendChild(close); body.appendChild(row); sh.box.appendChild(body);
    function pick() { box.focus(); box.select(); try { box.setSelectionRange(0, text.length); } catch (e) {} }
    all.onclick = function () { pick(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} if (ok) toast(s("phone.report.copied")); };
    save.onclick = function () { saveText(text); toast(s("phone.report.saved", { name: LOG_NAME })); };
    close.onclick = function () { sh.close(); };
    document.body.appendChild(sh.sheet);
    setTimeout(pick, 80);
  }
  function withLog(button, act) {
    button.onclick = function () {
      buzz();
      if (logText !== null) { act(logText, true); return; }
      button.disabled = true;
      warmLog(true).then(function () {
        button.disabled = false;
        if (logText === null) toast(s("phone.report.noLog"), true);
        else act(logText, false);
      });
    };
  }
  withLog($("shareLog"), function (text, fresh) {
    var file = typeof File === "function" ? new File([text], LOG_NAME, { type: "text/plain" }) : null;
    if (fresh && navigator.share) {
      var data = file && navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], title: "Jobee'sLair log" } : { title: "Jobee'sLair log", text: text.slice(-100000) };
      navigator.share(data).catch(function (e) { if (e && e.name !== "AbortError") showLogSheet(text, s("phone.report.noShareSheet")); });
      return;
    }
    showLogSheet(text, navigator.share ? s("phone.report.tapAgain") : s("phone.report.noShare"));
  });
  withLog($("saveLog"), function (text) { saveText(text); toast(s("phone.report.saved", { name: LOG_NAME })); });
  // Fetched when the report box comes into view, not with every look at Home: it is half a megabyte from the console.
  if (window.IntersectionObserver) new IntersectionObserver(function (seen) { if (signedIn && seen.some(function (e) { return e.isIntersecting; })) warmLog(); }).observe($("report"));
  withLog($("copyLog"), function (text, fresh) {
    if (fresh && navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(s("phone.report.copied")); }, function () { showLogSheet(text, s("phone.report.noCopy")); });
      return;
    }
    var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(t); t.focus(); t.select(); try { t.setSelectionRange(0, text.length); } catch (e) {}
    var ok = false; try { ok = fresh && document.execCommand("copy"); } catch (e) {}
    t.remove();
    if (ok) toast(s("phone.report.copied")); else showLogSheet(text, s("phone.report.noCopy"));
  });
  // ---- Sheets ------------------------------------------------------------------------------------------------
  function sheetOf() {
    var sheet = el("div", "sheet"), box = el("div");
    sheet.appendChild(box);
    sheet.onclick = function (e) { if (e.target === sheet) close(); };
    function close() { sheet.remove(); if (sheet.onclose) sheet.onclose(); }
    return { sheet: sheet, box: box, close: close };
  }
  // ---- Games -------------------------------------------------------------------------------------------------
  var query = "", offset = 0, searchTimer, searchId = 0, FEATURED = 8;
  function loadGames(reset) {
    if (reset) { offset = 0; $("grid").textContent = ""; $("rail").textContent = ""; }
    var id = ++searchId;
    api("GET", "/api/games?q=" + encodeURIComponent(query) + "&offset=" + offset + "&limit=30").then(function (data) {
      if (id !== searchId) return;
      $("count").textContent = s("phone.games.count", { count: data.total });
      var featured = !query && data.offset === 0;
      $("featured").hidden = !featured;
      data.games.forEach(function (g, i) { (featured && i < FEATURED ? $("rail") : $("grid")).appendChild(gameCard(g)); });
      if (!data.total) $("grid").appendChild(el("p", "muted", s("phone.games.none")));
      offset = data.offset + data.games.length;
      $("more").hidden = offset >= data.total;
    }).catch(function (e) { toast(e.message, true); });
  }
  function gameCard(g) {
    var b = el("button", "card"), meta = el("div", "meta");
    meta.appendChild(el("div", "title", g.title));
    meta.appendChild(el("div", "sub", [g.platform.toUpperCase(), g.year, g.sizeGb ? bytes(g.sizeGb * 1e9) : null].filter(Boolean).join(" · ")));
    b.appendChild(img("cover", g.cover)); b.appendChild(meta);
    b.onclick = function () { openGame(g.id); };
    return b;
  }
  $("q").oninput = function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { query = $("q").value; loadGames(true); }, 250); };
  $("more").onclick = function () { loadGames(false); };
  // 0.5.4: a source that needs its page opened is queued too (it waits under Downloads for the page, opened on the
  // console or here), and one a debrid service set up on the console takes says so and can go through it.
  var USABLE = ["direct", "page", "browser"];
  function openGame(id) {
    api("GET", "/api/game?id=" + encodeURIComponent(id)).then(function (g) {
      var sh = sheetOf(), body = el("div", "body");
      sh.box.appendChild(img("hero", g.cover)); sh.box.appendChild(body);
      body.appendChild(el("h2", null, g.title));
      body.appendChild(el("div", "subtle", [g.platform.toUpperCase(), g.year, g.developer, g.sizeGb ? bytes(g.sizeGb * 1e9) : null].filter(Boolean).join(" · ")));
      // What players saw when they started it: on how many consoles, and on this one's firmware.
      if (g.players) {
        var p = g.players, line = el("div", p.started / (p.started + p.failed) >= 0.9 ? "good" : p.started / (p.started + p.failed) < 0.5 ? "bad" : "muted", s("phone.game.players", { started: number(p.started), all: number(p.started + p.failed) }) + (p.here ? " · " + s("phone.game.playersHere", { started: number(p.here.started), all: number(p.here.started + p.here.failed) }) : ""));
        line.style.marginTop = "8px";
        body.appendChild(line);
      }
      if (g.summary) body.appendChild(el("p", "muted", g.summary));
      var usable = g.sources.some(function (x) { return USABLE.indexOf(x.group) >= 0 || x.debrid; });
      var torrents = g.sources.some(function (x) { return x.group === "torrent"; });
      var go = el("button", "btn primary wide", usable ? s("phone.game.download") : torrents ? s("phone.game.needsDebrid") : s("phone.game.noSource"));
      go.style.marginTop = "12px";
      go.disabled = !usable;
      function queue(source, button, debrid) {
        button.disabled = true; buzz();
        var ask = { id: g.id };
        if (source != null) ask.source = source;
        if (debrid != null) ask.debrid = debrid;
        api("POST", "/api/download", ask).then(function (r) { toast(r.debrid ? s("phone.game.queuedDebrid", { service: r.debrid }) : r.browser ? s("phone.game.queuedBrowser") : s("phone.game.queued", { source: r.source })); sh.close(); })
          .catch(function (e) { toast(e.message, true); button.disabled = false; });
      }
      go.onclick = function () { queue(null, go); };
      body.appendChild(go);
      if (g.sources.length) body.appendChild(el("h3", null, s("phone.game.sources")));
      g.sources.forEach(function (x) {
        var row = el("div", "source"), text = el("div", "grow");
        text.appendChild(el("div", null, x.name + (x.size ? " · " + x.size : "")));
        text.appendChild(el("div", "subtle", [x.detail, x.group === "browser" ? s("phone.game.needsBrowser") : null, x.group === "torrent" && !x.debrid ? s("phone.game.torrent") : null, x.group === "unavailable" ? s("phone.game.unavailable") : null].filter(Boolean).join(" · ")));
        row.appendChild(text);
        if (x.debrid) { var d = el("button", "btn small primary", s("phone.game.through", { service: x.debrid })); d.onclick = function () { queue(x.index, d, true); }; row.appendChild(d); }
        if (USABLE.indexOf(x.group) >= 0) { var b = el("button", "btn small", s("phone.game.this")); b.onclick = function () { queue(x.index, b, false); }; row.appendChild(b); }
        body.appendChild(row);
      });
      var close = el("button", "btn wide", s("phone.close")); close.style.marginTop = "14px"; close.onclick = function () { sh.close(); };
      body.appendChild(close);
      document.body.appendChild(sh.sheet);
    }).catch(function (e) { toast(e.message, true); });
  }
  // ---- Homebrew ----------------------------------------------------------------------------------------------
  var TINTS = { emulators: ["#2b1055", "#7597de"], games: ["#5f0a2c", "#ff5f6d"], media: ["#1e3c72", "#2a9df4"], streaming: ["#0f2027", "#2c9a8f"], jailbreak: ["#3a0b0b", "#e0482a"], files: ["#11324d", "#3fa9d6"], dumps: ["#232526", "#7a8a99"], system: ["#16222a", "#3a8f8a"], controllers: ["#2d1b3d", "#b05ee6"], mods: ["#3d2a05", "#f2a516"], stores: ["#0b2e1f", "#2ec27e"], dev: ["#1c1c2e", "#6366f1"], linux: ["#2b2b0c", "#d4c21a"] };
  var KIND = { image: "phone.kind.app", app: "phone.kind.app", "archive-image": "phone.kind.app", payload: "phone.kind.payload", "archive-payload": "phone.kind.payload", pkg: "phone.kind.package", "archive-pkg": "phone.kind.package" };
  var BUSY = ["waiting", "downloading", "extracting", "installing"];
  function tint(category) { var t = TINTS[category] || ["#1d2738", "#4cc9f0"]; return "linear-gradient(135deg," + t[1] + "," + t[0] + ")"; }
  function monogram(name) { var w = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "?").slice(0, 2)).toUpperCase(); }
  // The app's icon, else its logo on its category's colors, else its initials: a picture that won't load gives way
  // to the next, as on the console.
  var https = function (url) { return typeof url === "string" && /^https:\/\//.test(url); };
  function art(a) {
    var box = el("div", "art");
    function initials() {
      Array.prototype.forEach.call(box.querySelectorAll("img"), function (i) { i.remove(); });
      box.insertBefore(el("span", "mono", monogram(a.name)), box.firstChild);
    }
    function painted() {
      box.style.background = tint(a.category);
      if (!https(a.logo)) return initials();
      var logo = img("logo", a.logo); logo.onerror = initials; box.insertBefore(logo, box.firstChild);
    }
    if (https(a.icon)) { var icon = img("icon", a.icon); icon.onerror = function () { icon.remove(); painted(); }; box.appendChild(icon); }
    else painted();
    return box;
  }
  function badgeOf(a) {
    if (!a.state) return null;
    var text = a.state === "downloading" ? (a.percent != null ? a.percent + "%" : "…") : s("phone.hbstate." + a.state);
    return el("span", "badge " + a.state, text);
  }
  var tiles = {};
  function hbTile(a) {
    var b = el("button", "hb"), box = art(a), badge = badgeOf(a);
    if (badge) box.appendChild(badge);
    b.appendChild(box);
    b.appendChild(el("div", "name", a.name));
    b.appendChild(el("div", "by", [KIND[a.kind] ? s(KIND[a.kind]) : "", a.author].filter(Boolean).join(" · ")));
    b.onclick = function () { openApp(a.id); };
    // An app can show in more than one list at once (Home's updates and the Homebrew grid): each gets the live change.
    tiles[a.id] = (tiles[a.id] || []).filter(function (x) { return x.isConnected; }).concat(box);
    return b;
  }
  // A live change to an app's progress or state, onto its tile where it shows.
  function updateTile(change) {
    tiles[change.id] = (tiles[change.id] || []).filter(function (box) { return box.isConnected; });
    tiles[change.id].forEach(function (box) {
      var old = box.querySelector(".badge"); if (old) old.remove();
      var badge = badgeOf(change); if (badge) box.appendChild(badge);
    });
  }
  var hb = { q: "", category: "", filter: "", offset: 0, id: 0, timer: null };
  function tabButton(label, count, pressed, onclick) {
    var c = el("button", null, label);
    if (count != null) c.appendChild(el("small", null, number(count)));
    c.setAttribute("aria-pressed", String(pressed));
    c.onclick = function () { buzz(); onclick(); };
    return c;
  }
  function renderTabs(data) {
    var box = $("hbTabs"); box.textContent = "";
    var pick = function (category, filter) { return function () { hb.category = category; hb.filter = filter; loadHomebrew(true); }; };
    box.appendChild(tabButton(s("phone.homebrew.all"), data.counts.all, !hb.category && !hb.filter, pick("", "")));
    if (data.counts.installed) box.appendChild(tabButton(s("phone.homebrew.installed"), data.counts.installed, hb.filter === "installed", pick("", "installed")));
    if (data.counts.updates) box.appendChild(tabButton(s("phone.homebrew.updates"), data.counts.updates, hb.filter === "updates", pick("", "updates")));
    data.categories.forEach(function (c) { box.appendChild(tabButton(c.name, c.count, hb.category === c.id, pick(c.id, ""))); });
  }
  function loadHomebrew(reset) {
    if (reset) { hb.offset = 0; $("hbGrid").textContent = ""; }
    var id = ++hb.id;
    var path = "/api/homebrew?q=" + encodeURIComponent(hb.q) + "&category=" + encodeURIComponent(hb.category) + "&filter=" + hb.filter + "&offset=" + hb.offset + "&limit=48";
    api("GET", path).then(function (data) {
      if (id !== hb.id) return;
      if (reset) renderTabs(data);
      $("hbDot").textContent = data.counts.updates ? String(data.counts.updates) : "";
      var name = hb.filter === "installed" ? s("phone.homebrew.installed") : hb.filter === "updates" ? s("phone.homebrew.updates") : hb.category ? (data.categories.filter(function (c) { return c.id === hb.category; })[0] || {}).name : hb.q ? s("phone.homebrew.results") : s("phone.tab.homebrew");
      $("hbLabel").textContent = name || s("phone.tab.homebrew");
      $("hbCount").textContent = s("phone.homebrew.count", { count: data.total });
      data.apps.forEach(function (a) { $("hbGrid").appendChild(hbTile(a)); });
      if (!data.total) $("hbGrid").appendChild(el("p", "muted", s("phone.homebrew.none")));
      hb.offset = data.offset + data.apps.length;
      $("hbMore").hidden = hb.offset >= data.total;
    }).catch(function (e) { toast(e.message, true); });
  }
  $("hbq").oninput = function () { clearTimeout(hb.timer); hb.timer = setTimeout(function () { hb.q = $("hbq").value; loadHomebrew(true); }, 250); };
  $("hbMore").onclick = function () { loadHomebrew(false); };
  var openSheet = null;
  function openApp(id) {
    api("GET", "/api/homebrew/app?id=" + encodeURIComponent(id)).then(function (a) {
      var sh = sheetOf(), poll = null;
      openSheet = { id: a.id, render: null };
      sh.sheet.onclose = function () { clearInterval(poll); openSheet = null; if (view === "homebrew" && !live) loadHomebrew(true); };
      var hero = img("hero", a.hero || a.icon);
      if (!a.hero && !a.icon) hero.style.background = tint(a.category);
      sh.box.appendChild(hero);
      var body = el("div", "body"); sh.box.appendChild(body);
      var head = el("div", "row"), title = el("div", "grow"), small = art(a);
      small.style.width = "64px"; small.style.flex = "0 0 64px";
      head.appendChild(small);
      title.appendChild(el("h2", null, a.name));
      title.appendChild(el("div", "subtle ell ltr", a.author + " · " + a.repo));
      head.appendChild(title); body.appendChild(head);
      var tags = el("div", "tags");
      [KIND[a.kind] ? s(KIND[a.kind]) : null, s("phone.hb.stars", { count: a.stars }), a.version, a.license].filter(Boolean).forEach(function (t) { tags.appendChild(el("span", "tag", t)); });
      if (a.release.prerelease) tags.appendChild(el("span", "tag update", s("phone.hb.prerelease")));
      if (a.installed) tags.appendChild(el("span", "tag done", a.installed.version ? s("phone.hb.installedVersion", { version: a.installed.version }) : s("phone.hb.onConsole")));
      body.appendChild(tags);
      if (a.note) body.appendChild(el("div", "callout", a.note));
      var actions = el("div", "actions"), status = el("div", "subtle");
      status.style.marginTop = "8px";
      body.appendChild(actions); body.appendChild(status);
      function post(path, extra, message) {
        buzz();
        return api("POST", path, Object.assign({ id: a.id }, extra || {})).then(function (n) { if (message) toast(message); if (n && n.id) render(n); return n; }).catch(function (e) { toast(e.message, true); });
      }
      var shown = a;
      function render(d) {
        shown = d;
        actions.textContent = "";
        var busy = BUSY.indexOf(d.state) >= 0;
        if (busy) {
          var p = el("button", "btn primary", d.state === "downloading" ? s("phone.hb.downloading", { percent: d.percent != null ? d.percent : 0 }) : s("phone.hbstate." + d.state)); p.disabled = true; actions.appendChild(p);
          var c = el("button", "btn danger", s("phone.action.cancel")); c.onclick = function () { post("/api/homebrew/cancel"); }; actions.appendChild(c);
        } else {
          if (d.state !== "installed" || d.installed === null) {
            var label = d.state === "update" ? s("phone.hb.updateTo", { version: d.version }) : d.state === "failed" ? s("phone.hb.retry") : s("phone.hb.install");
            var go = el("button", "btn hb", label);
            go.onclick = function () { go.disabled = true; post("/api/homebrew/install", null, s("phone.hb.installing", { name: d.name })).then(function () { start2(); }); };
            actions.appendChild(go);
          }
          if (d.installed && d.installed.runnable) { var run = el("button", "btn" + (d.state === "update" ? "" : " primary"), s("phone.hb.run")); run.onclick = function () { run.disabled = true; post("/api/homebrew/run", null, s("phone.hb.sent", { name: d.name })).then(function () { run.disabled = false; }); }; actions.appendChild(run); }
          if (d.helper) { var helper = el("button", "btn", s("phone.hb.helper")); helper.onclick = function () { post("/api/homebrew/helper", null, s("phone.hb.helperSending")); }; actions.appendChild(helper); }
          if (d.installed && d.installed.file !== null) { var rm = el("button", "btn danger", s("phone.hb.remove")); rm.onclick = function () { askRemove(d); }; actions.appendChild(rm); }
        }
        status.textContent = d.error ? s("phone.hb.lastFailed", { error: d.error }) : d.kind.indexOf("payload") >= 0 ? s("phone.hb.aboutPayload") : d.kind.indexOf("pkg") >= 0 ? s("phone.hb.aboutPackage") : s("phone.hb.aboutApp");
        status.className = d.error ? "bad" : "subtle";
        if (!busy) clearInterval(poll);
      }
      // Progress on the same step is drawn from the event; a new step (done, failed) asks for the app again.
      openSheet.render = function (change) {
        if (change.id !== a.id) return;
        if (change.state === shown.state && BUSY.indexOf(change.state) >= 0) { render(Object.assign({}, shown, { percent: change.percent })); return; }
        api("GET", "/api/homebrew/app?id=" + encodeURIComponent(a.id)).then(render).catch(function () {});
      };
      function askRemove(d) {
        actions.textContent = "";
        var ask = el("div", "callout");
        ask.appendChild(el("div", null, d.saves ? s("phone.hb.removeSaves", { name: d.name }) : s("phone.hb.removeSure", { name: d.name })));
        actions.appendChild(ask);
        if (d.saves) {
          var keep = el("button", "btn primary", s("phone.hb.removeKeep")); keep.onclick = function () { post("/api/homebrew/remove", { keep: true }, s("phone.hb.removing", { name: d.name })).then(function () { sh.close(); }); }; actions.appendChild(keep);
        }
        var all = el("button", "btn danger", d.saves ? s("phone.hb.removeAll") : s("phone.hb.remove")); all.onclick = function () { post("/api/homebrew/remove", { keep: false }, s("phone.hb.removing", { name: d.name })).then(function () { sh.close(); }); }; actions.appendChild(all);
        var cancel = el("button", "btn", s("phone.action.keepIt")); cancel.onclick = function () { render(d); }; actions.appendChild(cancel);
      }
      // Without a live stream, an install's progress is asked for every second or so.
      function start2() { clearInterval(poll); if (live) return; poll = setInterval(function () { api("GET", "/api/homebrew/app?id=" + encodeURIComponent(a.id)).then(render).catch(function () {}); }, 1200); }
      render(a);
      if (BUSY.indexOf(a.state) >= 0) start2();
      if (a.description) body.appendChild(el("p", null, a.description));
      if (a.shots.length) { var shots = el("div", "shots"); a.shots.forEach(function (u) { shots.appendChild(img(null, u)); }); body.appendChild(shots); }
      if (a.about) { body.appendChild(el("h3", null, s("phone.hb.about"))); body.appendChild(el("div", "notes-text", a.about)); }
      if (a.release.notes) { body.appendChild(el("h3", null, s("phone.hb.whatsNew", { version: a.version }))); body.appendChild(el("div", "notes-text", a.release.notes)); }
      body.appendChild(el("h3", null, s("phone.hb.files")));
      a.files.forEach(function (f, i) {
        var row = el("div", "file"), name = el("div", "grow");
        name.appendChild(el("code", null, f.name));
        name.appendChild(el("div", "subtle", [KIND[f.kind] ? s(KIND[f.kind]) : null, f.size ? bytes(f.size) : null, i === 0 ? s("phone.hb.recommended") : null].filter(Boolean).join(" · ")));
        row.appendChild(name);
        var b = el("button", "btn small", s("phone.hb.install"));
        b.onclick = function () { post("/api/homebrew/install", { file: f.name }, s("phone.hb.installing", { name: f.name })).then(function () { start2(); }); };
        row.appendChild(b);
        body.appendChild(row);
      });
      var close = el("button", "btn wide", s("phone.close")); close.style.marginTop = "14px"; close.onclick = function () { sh.close(); };
      body.appendChild(close);
      document.body.appendChild(sh.sheet);
    }).catch(function (e) { toast(e.message, true); });
  }
  // ---- Library -----------------------------------------------------------------------------------------------
  var libraryBusy = false;
  function loadLibrary() {
    if (libraryBusy) return;
    libraryBusy = true;
    api("GET", "/api/library").then(function (data) {
      var list = $("libraryList"); list.textContent = "";
      $("libraryCount").textContent = s("phone.library.count", { count: data.entries.length });
      if (!data.entries.length) list.appendChild(el("p", "muted", s("phone.library.empty")));
      data.entries.forEach(function (entry) {
        var row = el("div", "panel block"), top = el("div", "row"), text = el("div", "grow");
        row.style.margin = "0";
        top.appendChild(img("thumb", entry.cover));
        var name = el("div", "ell", entry.title); name.style.fontWeight = "700"; text.appendChild(name);
        text.appendChild(el("div", entry.tone === "bad" ? "bad" : entry.tone === "good" ? "good" : "subtle", entry.state));
        text.appendChild(el("div", "subtle", [entry.homebrew ? s("phone.library.app") : null, entry.drive, entry.size ? bytes(entry.size) : null].filter(Boolean).join(" · ")));
        top.appendChild(text); row.appendChild(top);
        if (entry.fix) {
          row.appendChild(el("div", "subtle", entry.fix.text)).style.marginTop = "8px";
          if (entry.fix.needed) {
            var b = el("button", "btn primary", s("phone.library.fix"));
            b.style.marginTop = "10px";
            b.onclick = function () { buzz(); b.disabled = true; api("POST", "/api/library/fix", { key: entry.key }).then(function () { toast(s("phone.library.fixing", { title: entry.title })); }).catch(function (e) { toast(e.message, true); b.disabled = false; }); };
            row.appendChild(b);
          }
        }
        list.appendChild(row);
      });
    }).catch(function (e) { toast(e.message, true); }).then(function () { libraryBusy = false; });
  }
  // ---- Downloads ---------------------------------------------------------------------------------------------
  var queueBusy = false, ACTIONS = { pause: "phone.action.pause", resume: "phone.action.resume", cancel: "phone.action.cancel", clear: "phone.action.clear", browser: "phone.action.browser", link: "phone.action.link" };
  function loadQueue() {
    if (queueBusy) return;
    queueBusy = true;
    return api("GET", "/api/queue").then(function (d) { noteChanges(d.jobs); renderQueue(d); }).catch(function (e) { toast(e.message, true); }).then(function () { queueBusy = false; });
  }
  // A download waiting on the browser, from this phone: its page opens here, its check is passed with a finger, and
  // the file link its download button gives goes to the console. A sheet, so the queue's live redraws leave it be.
  function openLink(j) {
    var sh = sheetOf(), body = el("div", "body");
    sh.box.appendChild(body);
    body.appendChild(el("h2", null, s("phone.link.title")));
    body.appendChild(el("div", "subtle", j.title + (j.part ? " · " + s("phone.now.part", { part: j.part, parts: j.parts }) : "")));
    body.appendChild(el("p", "muted", s("phone.link.help")));
    if (j.page) { var page = el("a", "btn wide", s("phone.link.open")); page.href = j.page; page.target = "_blank"; page.rel = "noopener noreferrer"; body.appendChild(page); }
    var form = el("form", "row"), input = el("input", "field grow ltr"), send = el("button", "btn primary", s("phone.typing.send")), error = el("div", "bad");
    form.style.marginTop = "12px"; error.style.marginTop = "8px";
    input.type = "url"; input.setAttribute("inputmode", "url"); input.setAttribute("autocapitalize", "off"); input.setAttribute("spellcheck", "false"); input.autocomplete = "off"; input.placeholder = s("phone.link.paste");
    send.type = "submit";
    form.onsubmit = function (e) {
      e.preventDefault();
      var url = input.value.trim();
      if (!url || send.disabled) return;
      send.disabled = true; error.textContent = ""; buzz();
      api("POST", "/api/queue/link", { id: j.id, url: url }).then(function (d) { toast(s("phone.link.sent")); sh.close(); if (view === "downloads") renderQueue(d); })
        .catch(function (e2) { error.textContent = e2.message; send.disabled = false; });
    };
    form.appendChild(input); form.appendChild(send); body.appendChild(form); body.appendChild(error);
    var close = el("button", "btn wide", s("phone.close")); close.style.marginTop = "14px"; close.onclick = function () { sh.close(); };
    body.appendChild(close);
    document.body.appendChild(sh.sheet);
  }
  function renderQueue(data) {
    var list = $("jobs"); list.textContent = "";
    var running = data.jobs.filter(function (j) { return ACTIVE.indexOf(j.state) >= 0; }).length, finished = data.jobs.filter(function (j) { return DONE.indexOf(j.state) >= 0; }).length;
    $("jobCount").textContent = data.jobs.length ? s("phone.downloads.count", { active: running, total: data.jobs.length }) : "";
    $("bulk").hidden = !data.jobs.length; $("clearFinished").hidden = !finished; $("cancelAll").hidden = finished === data.jobs.length;
    if (!data.jobs.length) { list.appendChild(el("p", "muted", s("phone.downloads.empty"))); return; }
    data.jobs.forEach(function (j) {
      var p = el("div", "panel block"), top = el("div", "row");
      top.appendChild(el("div", "grow ell", j.title));
      top.appendChild(el("span", "tag" + (ACTIVE.indexOf(j.state) >= 0 ? " active" : j.state === "failed" ? " failed" : DONE.indexOf(j.state) >= 0 ? " done" : ""), stateName(j.state)));
      p.appendChild(top);
      if (j.percent != null) { var bar = el("div", "bar"), fill = el("i"); fill.style.width = j.percent + "%"; bar.appendChild(fill); p.appendChild(bar); }
      var left = j.total && j.bytesPerSecond ? (j.total - j.written) / j.bytesPerSecond : 0;
      var detail = [j.percent != null ? j.percent + "%" : null, j.total ? s("phone.now.of", { written: bytes(j.written), total: bytes(j.total) }) : j.written ? bytes(j.written) : null,
        j.bytesPerSecond ? bytes(j.bytesPerSecond) + "/s" : null, left ? s("phone.now.left", { time: duration(left) }) : null, j.part ? s("phone.now.part", { part: j.part, parts: j.parts }) : null].filter(Boolean).join(" · ");
      if (detail) p.appendChild(el("div", "subtle", detail));
      if (j.error || j.message) p.appendChild(el("div", j.error ? "bad" : "subtle", j.error || j.message)).style.marginTop = "6px";
      var actions = (j.actions || []).filter(function (a) { return ACTIONS[a]; });
      // A download that stopped can be started again from another of the game's sources (its sheet, as under Games).
      if (j.state === "failed" && j.gameId) actions.push("other");
      if (actions.length) {
        var row = el("div", "actions");
        actions.forEach(function (a) {
          var b = el("button", "btn small" + (a === "cancel" ? " danger" : a === "resume" || a === "link" ? " primary" : ""), a === "other" ? s("phone.action.otherSources") : s(ACTIONS[a]));
          b.onclick = function () {
            if (a === "link") { openLink(j); return; }
            if (a === "other") { openGame(j.gameId); return; }
            if (a === "cancel" && b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = s("phone.action.sure"); return; }
            b.disabled = true; buzz();
            api("POST", "/api/queue/" + a, { id: j.id }).then(function (d) { renderQueue(d); }).catch(function (e) { toast(e.message, true); b.disabled = false; });
          };
          row.appendChild(b);
        });
        p.appendChild(row);
      }
      list.appendChild(p);
    });
  }
  $("clearFinished").onclick = function () { buzz(); api("POST", "/api/queue/clear-finished").then(function (d) { renderQueue(d); toast(s("phone.downloads.cleared", { count: d.cleared })); }).catch(function (e) { toast(e.message, true); }); };
  $("cancelAll").onclick = function () {
    var b = $("cancelAll");
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = s("phone.downloads.cancelAllSure"); setTimeout(function () { b.dataset.sure = ""; b.textContent = s("phone.downloads.cancelAll"); }, 4000); return; }
    b.dataset.sure = ""; b.textContent = s("phone.downloads.cancelAll"); buzz();
    api("POST", "/api/queue/cancel-all").then(function (d) { toast(s("phone.downloads.cancelling", { count: d.cancelling })); if (!live) setTimeout(loadQueue, 800); }).catch(function (e) { toast(e.message, true); });
  };
  function renderDrives(list, drives) {
    list.textContent = "";
    if (!drives.length) { list.appendChild(el("p", "muted", s("phone.storage.none"))); return; }
    drives.forEach(function (d) {
      var box = el("div", "panel drive"), known = d.total > 0 && d.free != null, used = known ? 1 - d.free / d.total : 0, top = el("div", "row");
      top.appendChild(el("b", "grow ell", d.name));
      top.appendChild(el("span", "subtle", known ? s("phone.storage.free", { free: bytes(d.free) }) : s("phone.storage.unknown")));
      box.appendChild(top);
      var bar = el("div", "bar" + (used > 0.9 ? " full" : "")), fill = el("i"); fill.style.width = Math.round(used * 100) + "%"; bar.appendChild(fill); box.appendChild(bar);
      if (known) box.appendChild(el("div", "subtle", s("phone.storage.used", { used: bytes(d.total - d.free), total: bytes(d.total) })));
      list.appendChild(box);
    });
  }
  function loadDrives(list) { return api("GET", "/api/storage").then(function (data) { renderDrives(list, data.drives); }).catch(function (e) { toast(e.message, true); }); }
  // ---- Feeds -------------------------------------------------------------------------------------------------
  function loadFeeds() { return api("GET", "/api/feeds").then(renderFeeds).catch(function (e) { toast(e.message, true); }); }
  function renderFeeds(data) {
    var list = $("feedList"); list.textContent = "";
    if (!data.feeds.length) list.appendChild(el("p", "muted", s("phone.feeds.none")));
    data.feeds.forEach(function (f) {
      var p = el("div", "panel block"), text = el("div");
      text.appendChild(el("div", "ell", f.name || f.url));
      text.appendChild(el("div", "subtle ell ltr", f.url));
      var state = f.state === "refreshing" ? s("phone.feeds.syncing") : f.state === "failed" ? s("phone.feeds.failed", { error: f.error || "" }) : s("phone.feeds.games", { count: f.games }) + (f.fetchedAt ? " · " + s("phone.feeds.updated", { date: f.fetchedAt.slice(0, 10) }) : "");
      text.appendChild(el("div", f.state === "failed" ? "bad" : "subtle", state));
      if (f.via) text.appendChild(el("div", "subtle ell", s("phone.feeds.via", { mirror: f.via })));
      (f.mirrors || []).forEach(function (m) {
        var line = el("div", "mirror"); line.appendChild(el("span", "ell grow ltr", m));
        if ((f.own || []).indexOf(m) >= 0) { var drop = el("button", "btn small", s("phone.feeds.removeMirror")); drop.onclick = function () { api("DELETE", "/api/feeds/mirrors?url=" + encodeURIComponent(f.url) + "&mirror=" + encodeURIComponent(m)).then(function (d) { renderFeeds(d); toast(s("phone.feeds.mirrorRemoved")); }).catch(function (e) { toast(e.message, true); }); }; line.appendChild(drop); }
        text.appendChild(line);
      });
      if (f.restart) text.appendChild(el("div", "subtle", s("phone.feeds.reopen")));
      p.appendChild(text);
      var row = el("div", "actions"), edit = el("button", "btn small", s("phone.feeds.edit")), mirror = el("button", "btn small", s("phone.feeds.addMirror")), remove = el("button", "btn small danger", s("phone.feeds.remove"));
      function form(placeholder, value, submit, done) {
        var box = el("div", "row"), input = el("input", "field grow ltr"), save = el("button", "btn small primary", done), cancel = el("button", "btn small", s("phone.action.cancel"));
        box.style.marginTop = "10px";
        input.type = "url"; input.value = value; input.placeholder = placeholder; input.setAttribute("autocapitalize", "off");
        save.onclick = function () { save.disabled = true; submit(input.value.trim()).catch(function (e) { toast(e.message, true); save.disabled = false; }); };
        cancel.onclick = function () { box.remove(); row.hidden = false; };
        box.appendChild(input); box.appendChild(save); box.appendChild(cancel);
        row.hidden = true; p.appendChild(box); input.focus();
      }
      edit.onclick = function () { form("", f.url, function (url) { return api("POST", "/api/feeds/edit", { from: f.url, url: url }).then(function (d) { renderFeeds(d); toast(s("phone.feeds.saved")); }); }, s("phone.feeds.save")); };
      mirror.onclick = function () { form("https://mirror.example/catalog.json", "", function (url) { return api("POST", "/api/feeds/mirrors", { url: f.url, mirror: url }).then(function (d) { renderFeeds(d); toast(s("phone.feeds.mirrorAdded")); }); }, s("phone.feeds.add")); };
      remove.onclick = function () {
        if (remove.dataset.sure !== "1") { remove.dataset.sure = "1"; remove.textContent = s("phone.action.sure"); return; }
        api("DELETE", "/api/feeds?url=" + encodeURIComponent(f.url)).then(function (d) { renderFeeds(d); toast(s("phone.feeds.removed")); }).catch(function (e) { toast(e.message, true); });
      };
      row.appendChild(edit); row.appendChild(mirror); row.appendChild(remove); p.appendChild(row);
      list.appendChild(p);
    });
    if (data.feeds.some(function (f) { return f.state === "refreshing"; })) setTimeout(function () { if (view === "feeds") loadFeeds(); }, 1500);
  }
  $("addFeed").onclick = function () {
    var url = $("feedUrl").value.trim();
    if (!url) return;
    api("POST", "/api/feeds", { url: url }).then(function (d) { $("feedUrl").value = ""; renderFeeds(d); toast(s("phone.feeds.added")); }).catch(function (e) { toast(e.message, true); });
  };
  $("syncFeeds").onclick = function () { buzz(); api("POST", "/api/feeds/refresh").then(function (d) { renderFeeds(d); toast(s("phone.feeds.syncingAll")); }).catch(function (e) { toast(e.message, true); }); };
  // ---- Settings: the debrid keys, the speed limit, parts, the app's update ------------------------------------------
  // Named as the console's Settings names them (labels). A key is pasted here and sent to the console, which only
  // ever answers with its last four characters. Slow things (a connection test, an update check) say how they went
  // as a notice, or, without a live stream, show at the next look.
  var settingsBusy = false, settingsMoving = false;
  function loadSettings() {
    if (settingsBusy) return;
    settingsBusy = true;
    api("GET", "/api/settings").then(renderSettings).catch(function (e) { toast(e.message, true); }).then(function () { settingsBusy = false; });
  }
  function settingsPost(path, body, done) {
    buzz();
    return api("POST", path, body).then(function (d) { if (d && d.labels) renderSettings(d); if (done) toast(done); if (d && d.started && !live) setTimeout(loadSettings, 4000); return d; }, function (e) { toast(e.message, true); throw e; });
  }
  function heading(text) { var h = el("h2", "label"), t = el("span", null, text); t.style.cssText = "margin:0;color:var(--fg);font-size:17px;font-weight:700"; h.appendChild(t); return h; }
  function settingRow(name, detail, end) {
    var row = el("div", "setting"), text = el("div", "grow");
    text.appendChild(el("b", null, name));
    if (detail) text.appendChild(el("div", "subtle", detail));
    row.appendChild(text);
    if (end) row.appendChild(end);
    return row;
  }
  function switchOf(on, path) {
    var b = el("button", "switch");
    b.type = "button"; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", s(on ? "phone.settings.on" : "phone.settings.off"));
    b.onclick = function () { b.disabled = true; settingsPost(path, { on: !on }).catch(function () { b.disabled = false; }); };
    return b;
  }
  function renderSettings(d) {
    var box = $("settingsBody"), L = d.labels, u = d.update;
    box.textContent = "";
    // Debrid: a key each, pasted here; Test and Remove once one is set.
    box.appendChild(heading(L.debrid));
    [["torbox", L.torbox, L.torboxStored], ["alldebrid", L.alldebrid, L.alldebridStored]].forEach(function (one) {
      var service = one[0], a = d.debrid[service], p = el("div", "panel block"), top = el("div", "row");
      top.appendChild(el("b", "grow", one[1]));
      top.appendChild(el("span", "tag" + (a.set ? " done" : ""), a.set ? s("phone.settings.keySet", { key: a.masked }) : s("phone.settings.keyNone")));
      p.appendChild(top);
      if (a.status) p.appendChild(el("div", "subtle", a.status));
      var form = el("form", "row"), input = el("input", "field grow ltr"), save = el("button", "btn primary", s("phone.settings.save"));
      form.style.marginTop = "10px";
      input.type = "text"; input.autocomplete = "off"; input.setAttribute("autocapitalize", "off"); input.setAttribute("autocorrect", "off"); input.setAttribute("spellcheck", "false"); input.placeholder = s("phone.settings.paste");
      save.type = "submit";
      form.onsubmit = function (e) {
        e.preventDefault();
        var key = input.value.trim();
        if (!key || save.disabled) return;
        save.disabled = true;
        settingsPost("/api/settings/debrid", { service: service, key: key }, s("phone.settings.saved")).catch(function () { save.disabled = false; });
      };
      form.appendChild(input); form.appendChild(save); p.appendChild(form);
      if (a.set) {
        var row = el("div", "actions"), test = el("button", "btn small", L.test), drop = el("button", "btn small danger", L.remove);
        test.onclick = function () { test.disabled = true; test.textContent = s("phone.settings.testing"); settingsPost("/api/settings/debrid/test", { service: service }).catch(function () { test.disabled = false; test.textContent = L.test; }); };
        drop.onclick = function () {
          if (drop.dataset.sure !== "1") { drop.dataset.sure = "1"; drop.textContent = s("phone.action.sure"); return; }
          drop.disabled = true;
          settingsPost("/api/settings/debrid", { service: service, key: "" }, s("phone.settings.removed")).catch(function () { drop.disabled = false; });
        };
        row.appendChild(test); row.appendChild(drop); p.appendChild(row);
      }
      var note = el("p", "subtle", one[2]); note.style.margin = "10px 0 0"; p.appendChild(note);
      box.appendChild(p);
    });
    if (d.debrid.torbox.set && d.debrid.alldebrid.set) box.appendChild(el("div", "callout", L.both));
    box.appendChild(el("p", "subtle", s("phone.settings.private")));
    // Downloads: the speed limit and whether parts open the browser by themselves.
    box.appendChild(heading(L.downloads));
    var dl = el("div", "panel block"), speed = el("div"), seg = el("div", "seg");
    speed.appendChild(el("b", null, L.speed)); speed.appendChild(el("div", "subtle", L.speedDetail));
    d.speed.choices.forEach(function (c) {
      var b = el("button", "btn", c.label);
      b.setAttribute("aria-pressed", String(c.value === d.speed.limit));
      b.onclick = function () { if (c.value !== d.speed.limit) settingsPost("/api/settings/speed", { limit: c.value }); };
      seg.appendChild(b);
    });
    speed.appendChild(seg);
    var first = el("div", "setting"); first.appendChild(speed); speed.className = "grow"; dl.appendChild(first);
    dl.appendChild(settingRow(L.parts, L.partsDetail, switchOf(d.parts, "/api/settings/parts")));
    box.appendChild(dl);
    // Jobee'sLair itself: its version, the update and what can be done about it from here.
    box.appendChild(heading("Jobee'sLair"));
    var app = el("div", "panel block");
    // The console's own line, but where it says what to select on the console, the phone's.
    var status = u.checking ? u.status : u.phase === "ready" || u.phase === "armed" ? s("phone.settings.ready", { version: u.latest }) : u.phase === "failed" ? s("phone.settings.installFailed", { version: u.latest, error: u.error || "" }) : u.latest && (u.phase === "idle" || u.phase === "paused") ? s("phone.settings.available", { version: u.latest }) : u.status;
    app.appendChild(settingRow("v" + u.version, status));
    var acts = el("div", "actions"), check = el("button", "btn small", L.check);
    check.disabled = u.checking;
    check.onclick = function () { check.disabled = true; settingsPost("/api/settings/update/check", null, s("phone.settings.checking")).catch(function () { check.disabled = false; }); };
    acts.appendChild(check);
    // A download the app's closing stopped (paused) goes on from where it was.
    if (u.latest && u.canInstall && (u.phase === "idle" || u.phase === "failed" || u.phase === "paused")) {
      var install = el("button", "btn small primary", L.install);
      install.onclick = function () { install.disabled = true; settingsPost("/api/settings/update/install", null, s("phone.settings.installing")).catch(function () { install.disabled = false; }); };
      acts.appendChild(install);
    }
    if (u.phase === "ready" || u.phase === "armed") {
      var restart = el("button", "btn small primary", L.restart);
      restart.onclick = function () {
        if (restart.dataset.sure !== "1") { restart.dataset.sure = "1"; restart.textContent = s("phone.action.sure"); return; }
        restart.disabled = true;
        settingsPost("/api/settings/update/restart", null, s("phone.settings.restarting")).catch(function () { restart.disabled = false; });
      };
      acts.appendChild(restart);
      app.appendChild(el("div", "subtle", L.restartDetail));
    }
    app.appendChild(acts);
    if (u.canInstall) { var auto = settingRow(L.auto, L.autoDetail, switchOf(u.auto, "/api/settings/update/auto")); auto.style.marginTop = "12px"; app.appendChild(auto); }
    box.appendChild(app);
    // While it checks or downloads, the next look is soon.
    settingsMoving = u.checking || u.phase === "waiting" || u.phase === "downloading" || u.phase === "checking";
  }
  // ---- Remote and shortcuts: each tap is one press on the console, or opens a part of it --------------------------
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-press],button[data-quick]") : null;
    if (!b) return;
    buzz();
    if (b.dataset.quick) { api("POST", "/api/quick", { action: b.dataset.quick }).then(function () { toast(b.dataset.quick === "refresh" ? s("phone.shortcuts.refreshing") : s("phone.shortcuts.opened")); }).catch(function (e2) { toast(e2.message, true); }); return; }
    api("POST", "/api/remote", { action: b.dataset.press }).catch(function (e2) { toast(e2.message, true); });
  });
  // ---- Live updates: the console pushes what changes (GET /api/events) ---------------------------------------------
  // Each connection has its number: one that was let go (hidden, signed out, connected again) touches nothing after.
  var stream = null, retry = 0, retryTimer = null, generation = 0;
  function stopEvents() { generation++; if (stream) { try { stream.cancel(); } catch (e) {} stream = null; } clearTimeout(retryTimer); live = false; status(); }
  function connectEvents() {
    if (!signedIn || stream || document.hidden || !window.fetch || !window.TextDecoder) return;
    clearTimeout(retryTimer);
    var mine = ++generation;
    fetch("/api/events", { headers: { "X-JBH": "1" }, cache: "no-store", credentials: "same-origin" }).then(function (r) {
      if (mine !== generation) { try { r.body.cancel().catch(function () {}); } catch (e) {} return; }
      if (r.status === 401) { showLogin(s("phone.login.signedOut")); return; }
      if (!r.ok || !r.body || !r.body.getReader) throw new Error("no stream");
      var reader = r.body.getReader(), decoder = new TextDecoder(), buffer = "";
      stream = reader; live = true; retry = 0; online(true); status();
      // What changed while there was no stream: once, now that every change will come.
      refresh();
      function read() {
        return reader.read().then(function (part) {
          if (part.done) throw new Error("closed");
          buffer += decoder.decode(part.value, { stream: true });
          var at;
          while ((at = buffer.indexOf("\n\n")) >= 0) { handle(buffer.slice(0, at)); buffer = buffer.slice(at + 2); }
          return read();
        });
      }
      return read();
    }).catch(function () {}).then(function () {
      if (mine !== generation) return;
      stream = null; live = false; status();
      if (!signedIn || reloading || document.hidden) return;
      retryTimer = setTimeout(connectEvents, Math.min(15000, 1000 * Math.pow(2, retry++)));
    });
  }
  function handle(block) {
    var name = "message", data = [];
    block.split("\n").forEach(function (line) {
      if (line.indexOf("event: ") === 0) name = line.slice(7);
      else if (line.indexOf("data: ") === 0) data.push(line.slice(6));
    });
    if (!data.length) return;
    var value;
    try { value = JSON.parse(data.join("\n")); } catch (e) { return; }
    if (name === "queue") {
      renderCounts(value);
      noteChanges(value.jobs || []);
      titleFor(value.active);
      if (view === "home") renderNow(value);
      if (view === "downloads") renderQueue(value);
    } else if (name === "typing") {
      renderAsking(value.asking);
    } else if (name === "homebrew") {
      (value.changes || []).forEach(function (change) { updateTile(change); if (openSheet && openSheet.render) openSheet.render(change); });
      if (value.updates) renderUpdates(value.updates);
    } else if (name === "notes") {
      renderNotes(value.notes);
    } else if (name === "notice") {
      toast(noticeText(value), value.bad);
      if (view === "library") loadLibrary();
      if (view === "settings") loadSettings();
    } else if (name === "app") {
      if (value.language && value.language !== LANG) location.reload();
    }
  }
  function noticeText(n) {
    if (n.text && !n.event) return n.text;
    if (n.event === "removed") return n.kept ? s("phone.hb.removedKept", { name: n.name, path: n.kept }) : s("phone.hb.removed", { name: n.name });
    if (n.event === "helper") return s("phone.hb.helperSent", { name: n.name });
    return n.name ? s("phone.hb.failed", { name: n.name, error: n.text || "" }) : n.text || "";
  }
  // The open view's data again: after the stream connects, and every two seconds while there is none.
  function refresh() {
    if (view === "home") loadHome();
    else loadAsking();
    if (view === "downloads") { loadQueue(); loadDrives($("drives")); }
    if (view === "library") loadLibrary();
    if (view === "settings") loadSettings();
  }
  var ticks = 0;
  setInterval(function () {
    if (document.hidden || $("tabs").hidden) return;
    ticks++;
    if (!live) { if (view === "home") loadHome(); else loadAsking(); if (view === "downloads") { loadQueue(); if (ticks % 4 === 0) loadDrives($("drives")); } }
    else if (ticks % 15 === 0 && view === "downloads") loadDrives($("drives"));
    if (view === "settings" && settingsMoving) loadSettings();
  }, 2000);
  // A page in the background lets its stream go, so the console stops sending to a phone in a pocket; back in front,
  // it opens it again and catches up.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { stopEvents(); return; }
    if (signedIn) { if (!stream) connectEvents(); refresh(); }
  });
  function start() {
    api("GET", "/api/info").then(function (info) {
      if (info.language && info.language !== LANG) { location.reload(); return; }
      signedIn = true;
      $("version").textContent = "v" + info.version;
      $("login").hidden = true; $("tabs").hidden = false;
      show(view);
      connectEvents();
    }).catch(function (e) { if (!$("login").hidden) return; toast(e.message, true); });
  }
  status();
  start();
})();
</script>
</body></html>`;
  // The page in the console's language: \`strings\` are the phone.* messages (English where the language has none).
  // Each part goes in through a function, so a "$&" or "$'" in a message is text, not a replacement pattern.
  function pageFor({ strings = {}, language = "en", rtl = false } = {}) {
    const fill = { __EXO2_500__: EXO2_500, __EXO2_700__: EXO2_700, __LANG__: language.replace(/[^A-Za-z-]/g, ""), __DIR__: rtl ? "rtl" : "ltr", __STRINGS__: JSON.stringify(strings).replace(/</g, "\\u003c") };
    let page = TEMPLATE;
    for (const [mark, value] of Object.entries(fill)) page = page.replace(mark, () => value);
    return page;
  }
  var PAGE = pageFor();

export { PAGE, TEMPLATE, pageFor };
