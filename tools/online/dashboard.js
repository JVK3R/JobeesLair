// Jobee'sLair online's dashboard (0.5.2): one page, served by worker.js at /dashboard, for Jake only. Signing in
// takes the password and the authenticator code; the session is a cookie this page's script can't read (the
// password is never kept in the browser). The top row asks /v1/admin/live every 15 seconds; the rest asks
// /v1/admin/summary?days=N (the range picked in the header) every five minutes. Its typeface is Exo 2 from
// /dashboard/exo2-*.woff2. No outside scripts, fonts or images; everything a console sent is put on the page as
// text, never as HTML. Charts are drawn here as SVG: one axis each, a legend for two series, a tooltip on hover
// and a table view.
export const DASHBOARD = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Jobee'sLair Online</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 64'%3E%3Cpath d='M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z' fill='%23FF1E27'/%3E%3Cpath d='M52 4L64 4L64 48L92 48L84 60L52 60Z' fill='%23800000'/%3E%3C/svg%3E">
<style>
  @font-face { font-family: "Exo 2"; src: url(/dashboard/exo2-500.woff2) format("woff2"); font-weight: 400 500; font-display: swap; }
  @font-face { font-family: "Exo 2"; src: url(/dashboard/exo2-700.woff2) format("woff2"); font-weight: 600 800; font-display: swap; }
  :root {
    color-scheme: light;
    --bg: #eef1f6; --glow-1: rgba(225, 29, 38, .07); --glow-2: rgba(42, 120, 214, .09);
    --panel: #ffffff; --panel-2: #f4f6fa; --edge: #e1e6ee; --hi: rgba(255, 255, 255, .9);
    --grid: #e9edf3; --axis: #c5cdd9;
    --ink: #0b1220; --ink-2: #485267; --ink-3: #687284;
    --brand: #e11d26; --brand-hi: #e11d26; --brand-deep: #800000;
    --s1: #2a78d6; --s2: #eb6834; --bad: #d03b3b; --good: #067d06;
    --shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 10px 28px -14px rgba(16, 24, 40, .16);
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      color-scheme: dark;
      --bg: #05070d; --glow-1: rgba(255, 30, 39, .11); --glow-2: rgba(57, 135, 229, .10);
      --panel: #0f1520; --panel-2: #0b1019; --edge: #1e2839; --hi: rgba(255, 255, 255, .035);
      --grid: #1a2333; --axis: #2c3749;
      --ink: #f3f6fb; --ink-2: #a6b1c4; --ink-3: #7d8aa1;
      --brand: #ff1e27; --brand-hi: #ff4d55; --brand-deep: #800000;
      --s1: #3987e5; --s2: #d95926; --bad: #d03b3b; --good: #0ca30c;
      --shadow: 0 1px 0 rgba(255, 255, 255, .02) inset, 0 16px 36px -18px rgba(0, 0, 0, .7);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #05070d; --glow-1: rgba(255, 30, 39, .11); --glow-2: rgba(57, 135, 229, .10);
    --panel: #0f1520; --panel-2: #0b1019; --edge: #1e2839; --hi: rgba(255, 255, 255, .035);
    --grid: #1a2333; --axis: #2c3749;
    --ink: #f3f6fb; --ink-2: #a6b1c4; --ink-3: #7d8aa1;
    --brand: #ff1e27; --brand-hi: #ff4d55; --brand-deep: #800000;
    --s1: #3987e5; --s2: #d95926; --bad: #d03b3b; --good: #0ca30c;
    --shadow: 0 1px 0 rgba(255, 255, 255, .02) inset, 0 16px 36px -18px rgba(0, 0, 0, .7);
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; min-height: 100vh; color: var(--ink); font: 500 14px/1.5 "Exo 2", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1100px 520px at 8% -8%, var(--glow-1), transparent 62%), radial-gradient(1000px 520px at 96% -14%, var(--glow-2), transparent 60%), var(--bg); background-attachment: fixed; }
  [hidden] { display: none !important; }
  button { font: inherit; cursor: pointer; border: 1px solid var(--edge); background: var(--panel-2); color: var(--ink); border-radius: 9px; padding: 7px 14px; }
  button:hover { border-color: var(--ink-3); }
  button:disabled { opacity: .5; cursor: default; }
  button.primary { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 700; }
  button.link { border: 0; background: none; padding: 4px 2px; color: var(--ink-2); }
  button.link:hover { color: var(--ink); }
  button.icon { width: 34px; height: 34px; padding: 0; display: grid; place-items: center; color: var(--ink-2); background: transparent; }
  :focus-visible { outline: 2px solid var(--s1); outline-offset: 2px; }
  input, select, textarea { font: inherit; color: var(--ink); background: var(--panel-2); border: 1px solid var(--edge); border-radius: 9px; padding: 8px 11px; }
  textarea { width: 100%; min-height: 64px; resize: vertical; }
  .note { color: var(--ink-3); font-size: 12.5px; }
  .error-line { color: var(--bad); font-size: 13px; min-height: 1.2em; }

  /* The header: the mark, the live light, the sections, the range. */
  .top { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--bg) 80%, transparent); backdrop-filter: saturate(150%) blur(14px); -webkit-backdrop-filter: saturate(150%) blur(14px); border-bottom: 1px solid var(--edge); }
  .top .in { max-width: 1360px; margin: 0 auto; padding: 0 24px; height: 64px; display: flex; align-items: center; gap: 18px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; letter-spacing: .3px; white-space: nowrap; }
  .brand small { color: var(--ink-3); font-weight: 500; font-size: 15px; }
  .live { display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--brand) 13%, transparent); color: var(--brand-hi); font-size: 11px; font-weight: 700; letter-spacing: 1.3px; }
  .pulse { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--brand-hi); flex: none; }
  .pulse::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--brand-hi); opacity: 0; animation: ping 1.8s ease-out infinite; }
  @keyframes ping { 0% { transform: scale(.45); opacity: .85; } 100% { transform: scale(1.5); opacity: 0; } }
  nav.sections { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
  nav.sections a { position: relative; color: var(--ink-2); text-decoration: none; padding: 8px 11px; border-radius: 8px; font-size: 13.5px; white-space: nowrap; }
  nav.sections a:hover { color: var(--ink); background: var(--panel-2); }
  nav.sections a.on { color: var(--ink); }
  nav.sections a.on::after { content: ""; position: absolute; left: 11px; right: 11px; bottom: -12px; height: 2px; border-radius: 2px; background: var(--brand); }
  .tools { margin-left: auto; display: flex; align-items: center; gap: 10px; white-space: nowrap; }
  .seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--edge); }
  .seg button { border: 0; background: none; color: var(--ink-3); padding: 4px 10px; border-radius: 7px; font-size: 12.5px; font-weight: 700; letter-spacing: .3px; }
  .seg button[aria-pressed="true"] { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, .25); }
  .updated { color: var(--ink-3); font-size: 12.5px; min-width: 7.5em; text-align: right; }

  /* The page: sections of cards on a twelve-column grid. */
  .wrap { max-width: 1360px; margin: 0 auto; padding: 8px 24px 72px; transition: opacity .25s; }
  .wrap.loading { opacity: .62; }
  section { margin-top: 34px; scroll-margin-top: 84px; }
  .sec-head { display: flex; align-items: baseline; gap: 14px; margin: 0 0 14px; flex-wrap: wrap; }
  .sec-head h2 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: .2px; }
  .sec-head p { margin: 0; color: var(--ink-3); font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
  .card { grid-column: span 12; position: relative; min-width: 0; background: linear-gradient(180deg, var(--hi), transparent 46%), var(--panel); border: 1px solid var(--edge); border-radius: 16px; padding: 18px 20px; box-shadow: var(--shadow); }
  .c3 { grid-column: span 3; } .c4 { grid-column: span 4; } .c5 { grid-column: span 5; } .c6 { grid-column: span 6; } .c7 { grid-column: span 7; } .c8 { grid-column: span 8; }
  .card-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; position: relative; }
  .card-head h3 { margin: 0; font-size: 14.5px; font-weight: 700; }
  .card-head .cap { color: var(--ink-3); font-size: 12.5px; }
  .card-head .end { margin-left: auto; display: flex; align-items: center; gap: 14px; color: var(--ink-2); font-size: 12.5px; }
  .key { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .key i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .empty { color: var(--ink-3); font-size: 13px; padding: 26px 0; text-align: center; }

  /* Overview: the live number and four tiles. */
  .hero { padding: 22px 24px; background: radial-gradient(520px 240px at 0% 0%, color-mix(in srgb, var(--brand) 15%, transparent), transparent 70%), linear-gradient(180deg, var(--hi), transparent 46%), var(--panel); }
  .hero .label { display: flex; align-items: center; gap: 9px; color: var(--ink-2); font-size: 13.5px; }
  .hero .big { font-size: 78px; font-weight: 700; line-height: 1; letter-spacing: -1.5px; margin: 14px 0 8px; }
  .hero .sub { display: flex; gap: 18px; flex-wrap: wrap; color: var(--ink-3); font-size: 13px; }
  .hero .sub b { color: var(--ink); font-weight: 700; }
  .hero .chart { margin-top: 16px; }
  .kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .kpis .card { grid-column: auto; }
  .kpi .label { color: var(--ink-2); font-size: 13px; }
  .kpi .value { font-size: 34px; font-weight: 700; line-height: 1.12; letter-spacing: -.4px; margin-top: 8px; }
  .kpi .foot { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12.5px; color: var(--ink-3); min-height: 22px; flex-wrap: wrap; }
  .spark { height: 46px; margin-top: 10px; }
  .spark svg { display: block; width: 100%; height: 46px; overflow: visible; }
  .delta { font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  .delta.up { color: var(--good); background: color-mix(in srgb, var(--good) 13%, transparent); }
  .delta.down { color: var(--bad); background: color-mix(in srgb, var(--bad) 13%, transparent); }
  .delta.flat { color: var(--ink-3); background: var(--panel-2); }

  /* Charts. */
  .chart { position: relative; }
  .chart svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }
  .chart .gl { stroke: var(--grid); stroke-width: 1; }
  .chart .base { stroke: var(--axis); stroke-width: 1; }
  .chart .tick { fill: var(--ink-3); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .chart .cross { stroke: var(--axis); stroke-width: 1; }
  .chart .col { transition: opacity .15s; }
  .chart.hovering .col:not(.on) { opacity: .42; }
  .tip { position: absolute; z-index: 5; display: none; pointer-events: none; min-width: 160px; white-space: nowrap; transform: translate(-50%, calc(-100% - 12px)); padding: 9px 11px; border-radius: 11px; font-size: 12.5px; background: color-mix(in srgb, var(--panel) 94%, transparent); border: 1px solid var(--edge); box-shadow: 0 14px 30px -14px rgba(0, 0, 0, .55); backdrop-filter: blur(8px); }
  .tip .t { color: var(--ink-3); margin-bottom: 5px; }
  .tip .r { display: flex; align-items: center; gap: 8px; line-height: 1.7; }
  .tip .r b { margin-left: auto; padding-left: 14px; font-variant-numeric: tabular-nums; }
  .tip .sw { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
  details.table { margin-top: 10px; }
  details.table summary { cursor: pointer; color: var(--ink-3); font-size: 12.5px; width: max-content; }
  details.table table { margin-top: 8px; }
  .scroll { max-height: 320px; overflow: auto; }

  /* Lists, stats and tables. */
  .stats .stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--grid); }
  .stats .stat:first-child { padding-top: 2px; }
  .stats .stat:last-child { border-bottom: 0; padding-bottom: 2px; }
  .stat .k { color: var(--ink-2); font-size: 13px; }
  .stat .k small { display: block; color: var(--ink-3); font-size: 12px; }
  .stat .v { font-size: 20px; font-weight: 700; text-align: right; white-space: nowrap; }
  .stat .v .delta { margin-left: 8px; vertical-align: 3px; }
  .bars { display: grid; gap: 10px; }
  .bar { display: grid; grid-template-columns: minmax(0, 9em) 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
  .bar .name { display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; color: var(--ink-2); }
  .bar .name span:first-child { overflow: hidden; text-overflow: ellipsis; }
  .bar .track { height: 8px; border-radius: 4px; background: var(--panel-2); overflow: hidden; }
  .bar .fill { height: 100%; border-radius: 0 4px 4px 0; background: var(--s1); min-width: 3px; }
  .bar .n { font-weight: 700; font-variant-numeric: tabular-nums; }
  .bar .n small { color: var(--ink-3); font-weight: 500; margin-left: 5px; }
  .badge { font-size: 10px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--edge); color: var(--ink-2); background: var(--panel-2); flex: none; }
  .badge.brand { color: var(--brand-hi); border-color: color-mix(in srgb, var(--brand) 40%, transparent); background: color-mix(in srgb, var(--brand) 10%, transparent); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--ink-3); font-weight: 500; font-size: 11.5px; letter-spacing: .6px; text-transform: uppercase; padding: 8px 10px; border-bottom: 1px solid var(--edge); }
  td { padding: 9px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td .owner { color: var(--ink-3); font-size: 12px; }
  .rate { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .meter { height: 8px; border-radius: 4px; background: var(--panel-2); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: 4px; }
  .rate .meter { width: 64px; }
  .fails { display: grid; gap: 10px; }
  .fail { border-left: 3px solid var(--bad); padding: 6px 0 6px 12px; }
  .fail .head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .fail .head b { font-weight: 700; }
  .fail .msg { color: var(--ink-2); font-size: 12.5px; overflow-wrap: anywhere; margin-top: 2px; }
  .big-num { font-size: 44px; font-weight: 700; line-height: 1.05; letter-spacing: -.8px; }
  .rels { display: grid; gap: 11px; }
  .rel { display: grid; grid-template-columns: minmax(0, 8.5em) 1fr 5em; gap: 12px; align-items: center; font-size: 13px; }
  .rel .tag { display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; }
  .rel .track { display: flex; gap: 2px; height: 14px; }
  .rel .track i { display: block; height: 100%; min-width: 2px; }
  .rel .track i:first-child { border-radius: 4px 0 0 4px; }
  .rel .track i:last-child { border-radius: 0 4px 4px 0; }
  .rel .track i:only-child { border-radius: 4px; }
  .rel .n { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .repo { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
  .repo div { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 12px; padding: 10px 12px; }
  .repo b { display: block; font-size: 20px; font-weight: 700; }
  .repo span { color: var(--ink-3); font-size: 12px; }

  /* Announcements, and the console's bar as it looks on the PS5 (always dark, like the app). */
  .notes { display: grid; gap: 8px; margin-bottom: 14px; }
  .notes .item { display: flex; align-items: center; gap: 12px; border-left: 3px solid var(--s1); padding: 9px 9px 9px 13px; background: var(--panel-2); border-radius: 0 10px 10px 0; }
  .notes .item.warning { border-left-color: #fbbf24; }
  .notes .item .body { flex: 1; min-width: 0; }
  .notes .item .text { overflow-wrap: anywhere; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  /* The top of the PS5's screen, drawn at its own size (1920 wide, ui/AnnouncementBar.jsx's measures) and scaled
     to the card: the island sketched, the bar as the app draws it. */
  .console { position: relative; overflow: hidden; background: #05070d; border: 1px solid #1d2738; border-radius: 14px; height: 140px; }
  .stage { position: absolute; left: 0; top: 0; width: 1920px; height: 204px; transform-origin: 0 0; }
  .island { position: absolute; left: 50%; top: 24px; transform: translateX(-50%); width: 1300px; height: 80px; display: flex; align-items: center; gap: 26px; padding: 0 30px; border-radius: 999px; border: 1px solid #2f3d58; background: #0f1520; }
  .island i { display: block; width: 104px; height: 14px; border-radius: 7px; background: #1d2738; }
  .island i.on { width: 150px; height: 60px; border-radius: 999px; background: #3a86ff; opacity: .85; }
  .cbar { position: absolute; left: 48px; right: 48px; top: 132px; height: 48px; display: flex; align-items: center; gap: 14px; padding: 0 20px 0 7px; border-radius: 999px; border: 1px solid #2f3d58; background: #0f1520; color: #f3f6fb; overflow: hidden; }
  .cbar.warn { border-color: rgba(251, 191, 36, .4); }
  .cbar .chip { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: none; }
  .cbar .lbl { font-size: 15px; font-weight: 700; letter-spacing: 1.6px; line-height: 20px; flex: none; }
  .cbar .sep { width: 2px; height: 20px; border-radius: 2px; background: #243047; flex: none; }
  .cbar .txt { flex: 1; min-width: 0; font-size: 20px; line-height: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cbar .dots { display: flex; align-items: center; gap: 8px; flex: none; }
  .cbar .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, .25); }
  .cbar .run { width: 28px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, .18); overflow: hidden; }
  .cbar .run i { display: block; height: 100%; width: 0; animation: fill linear forwards; }
  @keyframes fill { to { width: 100%; } }
  footer { margin-top: 40px; color: var(--ink-3); font-size: 12.5px; display: flex; gap: 18px; flex-wrap: wrap; justify-content: space-between; }

  /* Signing in. */
  .gate-wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .gate { width: 100%; max-width: 400px; }
  .gate.setup { max-width: 470px; }
  .gate .mark { display: flex; align-items: center; gap: 12px; justify-content: center; margin-bottom: 18px; font-size: 20px; font-weight: 700; }
  .gate .mark small { color: var(--ink-3); font-weight: 500; }
  .gate input { width: 100%; margin: 0 0 12px; }
  .gate input[type=text] { letter-spacing: 2px; }
  .gate button.primary { width: 100%; padding: 10px; }
  .setup .step { font-weight: 700; margin: 16px 0 8px; }
  .setup .qr { display: inline-block; background: #fff; border-radius: 10px; line-height: 0; margin-bottom: 8px; min-width: 228px; min-height: 228px; }
  .setup code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 6px; padding: 2px 6px; font: 14px ui-monospace, Consolas, monospace; user-select: all; }

  @media (max-width: 1180px) { nav.sections { display: none; } }
  @media (max-width: 1100px) { .c3 { grid-column: span 6; } .c4, .c5, .c7, .c8 { grid-column: span 12; } }
  @media (max-width: 720px) {
    .top .in { padding: 0 16px; gap: 10px; } .brand small, .brand span, .updated, .live { display: none; }
    .wrap { padding: 4px 16px 56px; } .card, .c6 { grid-column: span 12; } .kpis { grid-template-columns: 1fr; }
    .hero .big { font-size: 64px; } .rel { grid-template-columns: minmax(0, 6em) 1fr 4em; } .repo { grid-template-columns: 1fr 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .pulse::after, .cbar .run i { animation: none; } .cbar .run i { width: 100%; } html { scroll-behavior: auto; } }
</style>
</head>
<body>
<div class="gate-wrap" id="gate-wrap" hidden>
  <section class="gate card" id="gate" hidden>
    <div class="mark"><svg width="42" height="28" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg><span>Jobee'sLair <small>Online</small></span></div>
    <form id="gate-form">
      <input type="password" id="password" placeholder="Password" autocomplete="current-password" required>
      <input type="text" id="code" placeholder="6-digit code (not the first time)" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7">
      <div class="error-line" id="gate-error"></div>
      <button class="primary" type="submit">Sign in</button>
    </form>
  </section>

  <section class="gate setup card" id="setup" hidden>
    <div class="mark"><svg width="42" height="28" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg><span>Lock the dashboard down</span></div>
    <p class="note">Once, now: after this, signing in takes your own password and the code from your authenticator.</p>
    <form id="setup-form">
      <div class="step">1. Pick your own password <span class="note">(12 characters or more)</span></div>
      <input type="password" id="new-password" placeholder="New password" autocomplete="new-password" minlength="12" required>
      <input type="password" id="new-password-again" placeholder="The same again" autocomplete="new-password" minlength="12" required>
      <div class="step">2. In Google Authenticator, tap <b>+</b>, then <b>Scan a QR code</b></div>
      <div class="qr" id="qr"></div>
      <div class="note">Can't scan? Choose <b>Enter a setup key</b>: account <b>Jobee'sLair Online</b>, key <code id="setup-key"></code>, time based.</div>
      <div class="step">3. Type the 6-digit code it shows</div>
      <input type="text" id="setup-code" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required>
      <div class="error-line" id="setup-error"></div>
      <button class="primary" type="submit">Finish</button>
    </form>
  </section>
</div>

<div id="app" hidden>
  <header class="top"><div class="in">
    <div class="brand"><svg width="36" height="24" viewBox="0 0 96 64" aria-hidden="true"><path d="M20 4L40 4L40 46L30 60L6 60L6 40L18 40L18 48L28 48L28 16L14 16L14 10Z" fill="#FF1E27"/><path d="M52 4L64 4L64 48L92 48L84 60L52 60Z" fill="#800000"/></svg><span>Jobee'sLair</span><small>Online</small></div>
    <span class="live" title="The top row refreshes every 15 seconds"><span class="pulse"></span>LIVE</span>
    <nav class="sections" id="nav">
      <a href="#overview">Overview</a><a href="#players">Players</a><a href="#time">Time</a><a href="#consoles">Consoles</a><a href="#homebrew">Homebrew</a><a href="#github">GitHub</a><a href="#announcements">Announcements</a>
    </nav>
    <div class="tools">
      <div class="seg" id="range" role="group" aria-label="Range for the charts"><button type="button" data-days="7">7D</button><button type="button" data-days="30">30D</button><button type="button" data-days="90">90D</button></div>
      <span class="updated" id="updated"></span>
      <button class="icon" id="theme" type="button" title="Theme: follow the system"></button>
      <button class="link" id="sign-out" type="button">Sign out</button>
    </div>
  </div></header>

  <main class="wrap" id="main">
    <section id="overview">
      <div class="sec-head"><h2>Overview</h2><p>Right now and today. The top row refreshes every 15 seconds.</p></div>
      <div class="grid">
        <div class="card hero c5">
          <div class="label"><span class="pulse"></span>On Jobee'sLair right now</div>
          <div class="big" id="online">-</div>
          <div class="sub"><span>Peak today <b id="peak-today">-</b></span><span>Best ever <b id="peak-ever">-</b></span><span>Sessions today <b id="sessions-today">-</b></span></div>
          <div class="chart" id="hours-chart"></div>
          <div class="note" id="hours-note">The most online at once, each hour of the last two days (your time).</div>
          <details class="table"><summary>Show as a table</summary><div class="scroll"><table id="hours-table"></table></div></details>
        </div>
        <div class="c7 kpis">
          <div class="card kpi"><div class="label">Players today</div><div class="value" id="k-players">-</div><div class="foot" id="k-players-foot"></div><div class="spark" id="k-players-spark"></div></div>
          <div class="card kpi"><div class="label">Time in Jobee'sLair today</div><div class="value" id="k-time">-</div><div class="foot" id="k-time-foot"></div><div class="spark" id="k-time-spark"></div></div>
          <div class="card kpi"><div class="label">Downloads on GitHub</div><div class="value" id="k-github">-</div><div class="foot" id="k-github-foot"></div><div class="spark" id="k-github-spark"></div></div>
          <div class="card kpi"><div class="label" id="k-installs-label">Homebrew installs</div><div class="value" id="k-installs">-</div><div class="foot" id="k-installs-foot"></div><div class="spark" id="k-installs-spark"></div></div>
        </div>
      </div>
    </section>

    <section id="players">
      <div class="sec-head"><h2>Players</h2><p>Consoles that share anonymous stats, by UTC day. New is a console seen for the first time that day.</p></div>
      <div class="grid">
        <div class="card c8"><div class="card-head"><h3>Players each day</h3><span class="cap" id="players-cap"></span><div class="end"><span class="key"><i style="background:var(--s1)"></i>Returning</span><span class="key"><i style="background:var(--s2)"></i>New</span></div></div><div class="chart" id="players-chart"></div><details class="table"><summary>Show as a table</summary><div class="scroll"><table id="players-table"></table></div></details></div>
        <div class="card c4"><div class="card-head"><h3>Who's around</h3></div><div class="stats" id="players-stats"></div></div>
      </div>
    </section>

    <section id="time">
      <div class="sec-head"><h2>Time in Jobee'sLair</h2><p>Counted from the pings consoles already send, one every five minutes while the app is open.</p></div>
      <div class="grid">
        <div class="card c8"><div class="card-head"><h3>Hours open each day</h3><span class="cap" id="time-cap"></span></div><div class="chart" id="time-chart"></div><details class="table"><summary>Show as a table</summary><div class="scroll"><table id="time-table"></table></div></details></div>
        <div class="card c4"><div class="card-head"><h3>Sessions</h3></div><div class="stats" id="time-stats"></div></div>
      </div>
    </section>

    <section id="consoles">
      <div class="sec-head"><h2>Consoles</h2><p id="consoles-cap">What the consoles seen in this range run.</p></div>
      <div class="grid">
        <div class="card c3"><div class="card-head"><h3>Versions</h3><span class="cap" id="latest-cap"></span></div><div class="bars" id="versions"></div></div>
        <div class="card c3"><div class="card-head"><h3>Firmware</h3></div><div class="bars" id="firmware"></div></div>
        <div class="card c3"><div class="card-head"><h3>Languages</h3></div><div class="bars" id="languages"></div></div>
        <div class="card c3"><div class="card-head"><h3>Editions</h3></div><div class="bars" id="editions"></div></div>
      </div>
    </section>

    <section id="homebrew">
      <div class="sec-head"><h2>Homebrew</h2><p>Installs from the Homebrew section, sent without any console ID.</p></div>
      <div class="grid">
        <div class="card c8"><div class="card-head"><h3>Installs each day</h3><div class="end"><span class="key"><i style="background:var(--s1)"></i>Installed</span><span class="key"><i style="background:var(--bad)"></i>&#x2715; Failed</span></div></div><div class="chart" id="installs-chart"></div><details class="table"><summary>Show as a table</summary><div class="scroll"><table id="installs-table"></table></div></details></div>
        <div class="card c4"><div class="card-head"><h3>Success rate</h3><span class="cap" id="rate-cap"></span></div><div id="rate"></div></div>
        <div class="card c7"><div class="card-head"><h3>Most installed</h3><span class="cap" id="apps-cap"></span></div><table id="apps"></table></div>
        <div class="card c5"><div class="card-head"><h3>Latest failed installs</h3></div><div class="fails scroll" id="failures"></div></div>
      </div>
    </section>

    <section id="github">
      <div class="sec-head"><h2>GitHub</h2><p>Public numbers for the app's repository, checked every 15 minutes while this page is open.</p></div>
      <div class="grid">
        <div class="card c8"><div class="card-head"><h3>Downloads by release</h3><div class="end"><span class="key"><i style="background:var(--s1)"></i>Fresh installs (.exfat)</span><span class="key"><i style="background:var(--s2)"></i>In-app updates (update.zip)</span></div></div><div class="chart" id="releases"></div></div>
        <div class="card c4"><div class="card-head"><h3>All downloads</h3><span class="cap" id="github-cap"></span></div><div class="big-num" id="github-total">-</div><div class="note" id="github-latest"></div><div class="repo" id="repo"></div></div>
        <div class="card"><div class="card-head"><h3>New downloads each day</h3><span class="cap">every release together, counted since the dashboard started checking</span></div><div class="chart" id="github-chart"></div><details class="table"><summary>Show as a table</summary><div class="scroll"><table id="github-table"></table></div></details></div>
      </div>
    </section>

    <section id="announcements">
      <div class="sec-head"><h2>Announcements</h2><p>In a bar under the top menu of every Jobee'sLair, taking turns in this order, until you take them down. Consoles check once a minute.</p></div>
      <div class="grid">
        <div class="card"><div class="card-head"><h3>On the console</h3><span class="cap" id="preview-cap"></span><div class="end" id="preview-what"></div></div><div class="console" id="console"><div class="stage" id="stage"><div class="island"><i></i><i></i><i class="on"></i><i></i><i></i><i></i><i></i><i></i></div><div class="cbar" id="cbar"></div></div></div></div>
        <div class="card">
          <div class="card-head"><h3>Up now</h3><span class="cap" id="notes-count"></span></div>
          <div class="notes" id="notes"></div>
          <form id="announce">
            <textarea id="text" maxlength="140" rows="2" placeholder="0.5.2 is out. Update from Settings, About."></textarea>
            <div class="row">
              <label><input type="radio" name="level" value="info" checked> Info</label>
              <label><input type="radio" name="level" value="warning"> Warning</label>
              <select id="hours" aria-label="How long">
                <option value="0">Until I take it down</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option>
              </select>
              <span class="note" id="count">0 / 140, one line on the console</span>
              <span style="flex:1"></span>
              <span class="note" id="full" hidden>Take one down to post another</span>
              <button class="primary" type="submit" id="post">Post</button>
            </div>
            <div class="error-line" id="announce-error"></div>
          </form>
        </div>
      </div>
    </section>

    <footer><span>Nothing here identifies a console or a person: a random ID per console, no IP addresses, no games or downloads.</span><span>Days are UTC.</span></footer>
  </main>
</div>

<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";
  var DAY = 864e5, MIN_PER_PING = 5, LIVE_MS = 15000, SUMMARY_MS = 300000;
  var MAX_NOTES = 5, MAX_TEXT = 140;  // as worker.js
  var num = new Intl.NumberFormat();
  var one = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  var compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var state = { span: 30, summary: null, live: null, liveAt: 0, timers: [] };
  try { state.span = Number(localStorage.getItem("jl-span")) || 30; } catch (e) {}
  if ([7, 30, 90].indexOf(state.span) < 0) state.span = 30;

  // ---- Building the page out of nodes (never HTML text) ----
  function add(node, kids) {
    [].concat(kids == null ? [] : kids).forEach(function (kid) {
      if (kid == null || kid === false) return;
      node.appendChild(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }
  function h(tag, props, kids) {
    var node = document.createElement(tag);
    for (var key in props || {}) {
      var value = props[key];
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    return add(node, kids);
  }
  function s(tag, attrs, kids) {
    var node = document.createElementNS(NS, tag);
    for (var key in attrs || {}) if (attrs[key] != null) node.setAttribute(key, attrs[key]);
    return add(node, kids);
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  var sum = function (list) { return list.reduce(function (a, b) { return a + (b || 0); }, 0); };
  var max = function (list) { return list.reduce(function (a, b) { return Math.max(a, b || 0); }, 0); };

  // ---- Time and numbers ----
  var dayOf = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
  // The "count" UTC days ending "back" days before today's, oldest first.
  function days(now, count, back) { var list = []; for (var i = count - 1 + back; i >= back; i--) list.push(dayOf(now - i * DAY)); return list; }
  var monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  var weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  var hourOnly = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  var dayHour = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric" });
  var clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  var shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  var dayLabel = function (d) { return monthDay.format(new Date(d + "T00:00:00Z")); };
  var dayTitle = function (d) { return weekday.format(new Date(d + "T00:00:00Z")); };
  var hoursOf = function (pings) { return pings * MIN_PER_PING / 60; };
  function hoursText(hours) {
    if (!hours) return "0 min";
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + " min";
    return (hours < 10 ? one.format(hours) : num.format(Math.round(hours))) + " h";
  }
  function minutesText(minutes) {
    if (!isFinite(minutes) || minutes <= 0) return "-";
    if (minutes < 60) return Math.round(minutes) + " min";
    var whole = Math.floor(minutes / 60), rest = Math.round(minutes % 60);
    return whole + " h" + (rest ? " " + rest + " min" : "");
  }
  function ago(ms) {
    var sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (sec < 5) return "just now";
    if (sec < 60) return sec + "s ago";
    var min = Math.round(sec / 60);
    if (min < 60) return min + " min ago";
    var hr = Math.round(min / 60);
    return hr < 48 ? hr + " h ago" : Math.round(hr / 24) + " days ago";
  }
  var languageNames = null;
  try { languageNames = new Intl.DisplayNames(undefined, { type: "language" }); } catch (e) {}
  function languageName(code) { try { return languageNames ? languageNames.of(code) : code; } catch (e) { return code; } }
  // A change against the period before: up, down or flat, with the arrow as well as the color.
  function delta(now, before, what) {
    if (!now && !before) return h("span", { class: "delta flat", text: "-", title: what });
    if (!before) return h("span", { class: "delta up", text: "▲ new", title: what });
    var change = (now - before) / before;
    if (Math.abs(change) < 0.005) return h("span", { class: "delta flat", text: "0%", title: what });
    return h("span", { class: "delta " + (change > 0 ? "up" : "down"), text: (change > 0 ? "▲ " : "▼ ") + (Math.abs(change) >= 10 ? "×" + one.format(now / before) : Math.round(Math.abs(change) * 100) + "%"), title: what });
  }
  // A number that counts to its new value, once it has had one.
  var shown = new WeakMap();
  function countTo(node, value, format) {
    var from = shown.get(node);
    shown.set(node, value);
    if (reduced || from == null || from === value) { node.textContent = format(value); return; }
    var start = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - start) / 700), eased = 1 - Math.pow(1 - k, 3);
      node.textContent = format(from + (value - from) * eased);
      if (k < 1) requestAnimationFrame(step);
    })(start);
  }
  var whole = function (v) { return num.format(Math.round(v)); };

  // ---- Charts ----
  function niceTop(value, integer) {
    if (value <= 0) return integer ? 2 : 1;
    // The next step up that keeps the highest mark in the top third of the plot.
    var power = Math.pow(10, Math.floor(Math.log10(value))), n = value / power;
    var top = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].filter(function (step) { return step >= n; })[0] * power;
    // Whole numbers keep whole ticks: 0, half and the top.
    if (integer) { top = Math.max(2, Math.ceil(top)); if (top % 2) top += 1; }
    return top;
  }
  function widthOf(box, least) { return Math.max(least || 280, Math.round(box.clientWidth) || 600); }
  function axis(svg, top, left, right, width, y, tick) {
    [0, top / 2, top].forEach(function (v, k) {
      svg.appendChild(s("line", { x1: left, x2: width - right, y1: y(v), y2: y(v), class: k ? "gl" : "base" }));
      svg.appendChild(s("text", { x: left - 8, y: y(v) + 4, "text-anchor": "end", class: "tick" }, (tick || function (n) { return compact.format(n); })(v)));
    });
  }
  // Labels under the plot as many as fit (about one per 72px, six at most), always the newest, which ends at the
  // right edge; one that would run into it is left out.
  function xLabels(svg, texts, at, height, plotWidth) {
    var last = texts.length - 1, fit = Math.max(2, Math.min(6, Math.floor(plotWidth / 72)));
    var every = Math.max(1, Math.ceil(texts.length / fit));
    texts.forEach(function (text, i) {
      if ((last - i) % every || (i !== last && at(last) - at(i) < 64)) return;
      svg.appendChild(s("text", { x: at(i), y: height - 5, "text-anchor": i === last && last > 0 ? "end" : "middle", class: "tick" }, text));
    });
  }
  function tipIn(box) { var tip = h("div", { class: "tip" }); box.appendChild(tip); return tip; }
  function showTip(tip, x, y, title, rows) {
    clear(tip);
    tip.appendChild(h("div", { class: "t", text: title }));
    rows.forEach(function (row) {
      tip.appendChild(h("div", { class: "r" }, [row.color ? h("i", { class: "sw", style: "background:" + row.color }) : null, h("span", { text: row.name }), h("b", { text: row.value })]));
    });
    tip.style.display = "block";
    var width = tip.offsetWidth, room = tip.parentNode.clientWidth;
    tip.style.left = Math.min(Math.max(x, width / 2 + 2), room - width / 2 - 2) + "px";
    tip.style.top = Math.max(y, 0) + "px";
  }
  // Pointer over the plot: the nearest column or point shows in the tooltip.
  function hover(box, svg, width, indexAt, enter, leave) {
    var tip = tipIn(box), last = -1;
    function move(event) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      var i = indexAt((event.clientX - rect.left) / rect.width * width);
      if (i == null) return;
      last = i;
      var info = enter(i);
      showTip(tip, info.x * rect.width, info.y * rect.height, info.title, info.rows);
    }
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", function () { tip.style.display = "none"; last = -1; leave(); });
  }
  var roundTop = function (x, top, w, base) {
    var r = Math.min(4, w / 2, base - top);
    return "M" + x + "," + base + "V" + (top + r) + "Q" + x + "," + top + " " + (x + r) + "," + top + "H" + (x + w - r) + "Q" + (x + w) + "," + top + " " + (x + w) + "," + (top + r) + "V" + base + "Z";
  };
  // Columns by day, stacked (each series in order from the baseline), 2px of surface between the parts.
  function columns(box, c) {
    clear(box);
    var W = widthOf(box), H = c.height || 230, L = 40, R = 6, T = 10, B = 24, n = c.labels.length;
    var slot = (W - L - R) / n, gap = slot > 12 ? 3 : slot > 5 ? 2 : 1, bw = Math.max(1, slot - gap);
    var totals = c.labels.map(function (_, i) { return sum(c.series.map(function (it) { return it.values[i]; })); });
    var top = niceTop(max(totals), c.integer), plot = H - T - B;
    var y = function (v) { return T + plot * (1 - v / top); };
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": c.title });
    axis(svg, top, L, R, W, y, c.tick);
    var cols = c.labels.map(function (_, i) {
      var x = L + i * slot + gap / 2, g = s("g", { class: "col" }), below = 0, last = -1;
      c.series.forEach(function (it, k) { if (it.values[i]) last = k; });
      c.series.forEach(function (it, k) {
        var v = it.values[i] || 0;
        if (!v) return;
        var y0 = y(below) - (below ? 2 : 0), y1 = Math.min(y(below + v), y0 - 1.5);
        below += v;
        g.appendChild(k === last ? s("path", { d: roundTop(x, y1, bw, y0), fill: it.color }) : s("rect", { x: x, y: y1, width: bw, height: y0 - y1, fill: it.color }));
      });
      svg.appendChild(g);
      return g;
    });
    xLabels(svg, c.labels.map(c.xLabel || dayLabel), function (i) { return L + (i + 0.5) * slot; }, H, W - L - R);
    box.appendChild(svg);
    var format = c.format || whole;
    hover(box, svg, W, function (px) { return Math.min(n - 1, Math.max(0, Math.floor((px - L) / slot))); }, function (i) {
      box.classList.add("hovering");
      cols.forEach(function (g, k) { g.setAttribute("class", k === i ? "col on" : "col"); });
      var rows = c.series.map(function (it) { return { color: it.color, name: it.name, value: format(it.values[i] || 0) }; });
      if (c.series.length > 1) rows.push({ name: "Total", value: format(totals[i]) });
      return { x: (L + (i + 0.5) * slot) / W, y: y(totals[i]) / H, title: (c.tipTitle || dayTitle)(c.labels[i]), rows: rows };
    }, function () { box.classList.remove("hovering"); cols.forEach(function (g) { g.setAttribute("class", "col"); }); });
  }
  // One series as a line over a soft fill, with a crosshair on hover and the newest point marked.
  var fills = 0;
  function area(box, c) {
    clear(box);
    var W = widthOf(box), H = c.height || 230, L = 40, R = 10, T = 10, B = 24, n = c.values.length;
    var top = niceTop(max(c.values), c.integer), plot = H - T - B;
    var x = function (i) { return n < 2 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1); };
    var y = function (v) { return T + plot * (1 - v / top); };
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": c.title });
    axis(svg, top, L, R, W, y, c.tick);
    var id = "fill" + (++fills);
    svg.appendChild(s("defs", null, s("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, [s("stop", { offset: "0", "stop-color": c.color, "stop-opacity": 0.3 }), s("stop", { offset: "1", "stop-color": c.color, "stop-opacity": 0 })])));
    var line = c.values.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); }).join("");
    if (n > 1) svg.appendChild(s("path", { d: line + "L" + x(n - 1).toFixed(1) + "," + y(0) + "L" + x(0).toFixed(1) + "," + y(0) + "Z", fill: "url(#" + id + ")" }));
    svg.appendChild(s("path", { d: line, fill: "none", stroke: c.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    svg.appendChild(s("circle", { cx: x(n - 1), cy: y(c.values[n - 1] || 0), r: 4, fill: c.color, stroke: "var(--panel)", "stroke-width": 2 }));
    var cross = s("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" });
    var dot = s("circle", { r: 4.5, fill: c.color, stroke: "var(--panel)", "stroke-width": 2, visibility: "hidden" });
    svg.appendChild(cross);
    svg.appendChild(dot);
    xLabels(svg, c.labels.map(c.xLabel || dayLabel), x, H, W - L - R);
    box.appendChild(svg);
    hover(box, svg, W, function (px) { return n < 2 ? 0 : Math.min(n - 1, Math.max(0, Math.round((px - L) / ((W - L - R) / (n - 1))))); }, function (i) {
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(c.values[i] || 0)); dot.setAttribute("visibility", "visible");
      return { x: x(i) / W, y: y(c.values[i] || 0) / H, title: (c.tipTitle || dayTitle)(c.labels[i]), rows: c.rows(i) };
    }, function () { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
  }
  // A tile's trend: no axes, the shape and the newest point. A running total ("growth") is drawn from its lowest
  // point, so the climb shows.
  function spark(box, values, color, growth) {
    clear(box);
    if (values.length < 2 || !max(values)) return;
    var W = widthOf(box, 120), H = 46, top = max(values), n = values.length;
    var low = growth ? Math.min.apply(null, values) : 0, range = top - low || 1;
    var x = function (i) { return 2 + (W - 4) * i / (n - 1); }, y = function (v) { return 4 + (H - 8) * (1 - (v - low) / range); };
    var id = "fill" + (++fills), line = values.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); }).join("");
    box.appendChild(s("svg", { viewBox: "0 0 " + W + " " + H, "aria-hidden": "true", preserveAspectRatio: "none" }, [
      s("defs", null, s("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, [s("stop", { offset: "0", "stop-color": color, "stop-opacity": 0.26 }), s("stop", { offset: "1", "stop-color": color, "stop-opacity": 0 })])),
      s("path", { d: line + "L" + x(n - 1) + "," + H + "L" + x(0) + "," + H + "Z", fill: "url(#" + id + ")" }),
      s("path", { d: line, fill: "none", stroke: color, "stroke-width": 1.75, "stroke-linejoin": "round", "stroke-linecap": "round" }),
      s("circle", { cx: x(n - 1), cy: y(values[n - 1]), r: 3, fill: color, stroke: "var(--panel)", "stroke-width": 1.5 })
    ]));
  }
  function table(node, head, body) {
    clear(node);
    node.appendChild(h("thead", null, h("tr", null, head.map(function (col, i) { return h("th", { class: i ? "num" : null, text: col }); }))));
    node.appendChild(h("tbody", null, body.map(function (cells) { return h("tr", null, cells.map(function (cell, i) { return h("td", { class: i ? "num" : null, text: cell }); })); })));
  }
  function bars(box, list, label, extra) {
    clear(box);
    if (!list.length) { box.appendChild(h("div", { class: "empty", text: "Nothing yet" })); return; }
    var all = sum(list.map(function (row) { return row.n; })), top = max(list.map(function (row) { return row.n; }));
    list.forEach(function (row) {
      var badge = extra ? extra(row) : null;
      box.appendChild(h("div", { class: "bar", title: label(row) + ": " + num.format(row.n) }, [
        h("span", { class: "name" }, [h("span", { text: label(row) }), badge]),
        h("div", { class: "track" }, h("div", { class: "fill", style: "width:" + (100 * row.n / top) + "%" })),
        h("span", { class: "n" }, [num.format(row.n), h("small", { text: Math.round(100 * row.n / all) + "%" })])
      ]));
    });
  }
  function stat(key, note, value, change) {
    return h("div", { class: "stat" }, [h("div", { class: "k" }, [key, note ? h("small", { text: note }) : null]), h("div", { class: "v" }, [value, change || null])]);
  }

  // ---- What the summary says, by day ----
  function derive(data) {
    var now = data.at, span = data.span, here = days(now, span, 0), before = days(now, span, span);
    var index = function (list, key) { var out = {}; (list || []).forEach(function (row) { out[row[key]] = row; }); return out; };
    var daily = index(data.daily, "day"), usage = index(data.usage, "day"), installs = index(data.installDays, "day"), gh = index(data.github && data.github.days, "day");
    var pick = function (list, table, get) { return list.map(function (d) { return table[d] ? get(table[d]) || 0 : 0; }); };
    var out = { here: here, before: before, yesterday: dayOf(now - DAY), daily: daily, usage: usage, gh: gh };
    [["active", daily, function (r) { return r.active; }], ["fresh", daily, function (r) { return r.fresh; }], ["pings", usage, function (r) { return r.pings; }],
      ["sessions", usage, function (r) { return r.sessions; }], ["peak", usage, function (r) { return r.peak; }], ["ok", installs, function (r) { return r.ok; }],
      ["failed", installs, function (r) { return r.failed; }]].forEach(function (spec) {
      out[spec[0]] = pick(here, spec[1], spec[2]);
      out[spec[0] + "Before"] = pick(before, spec[1], spec[2]);
    });
    out.returning = out.active.map(function (v, i) { return v - out.fresh[i]; });
    out.hours = out.pings.map(hoursOf);
    out.hoursBefore = out.pingsBefore.map(hoursOf);
    return out;
  }

  // ---- Drawing each part ----
  function renderLive() {
    var live = state.live, data = state.summary;
    if (!live || !data) return;
    countTo($("online"), live.online, whole);
    $("peak-today").textContent = num.format(live.peak);
    $("peak-ever").textContent = num.format(Math.max(live.peak, (data.ever && data.ever.peak) || 0));
    $("sessions-today").textContent = num.format(live.sessions);
    // Today isn't over: players are set against all of yesterday as plain text, and time open against yesterday
    // up to this hour (the last two days' hours are in the summary).
    var d = derive(data), yesterday = d.daily[d.yesterday];
    countTo($("k-players"), live.today, whole);
    add(clear($("k-players-foot")), "Yesterday " + num.format(yesterday ? yesterday.active : 0) + " in all");
    var midnight = Date.parse(dayOf(live.at) + "T00:00:00Z"), byNow = 0;
    (data.hours || []).forEach(function (row) {
      var at = Date.parse(row.hour + ":00:00Z");
      if (at >= midnight - DAY && at < live.at - DAY) byNow += row.pings;
    });
    countTo($("k-time"), hoursOf(live.pings), hoursText);
    add(clear($("k-time-foot")), [delta(live.pings, byNow, "vs yesterday by this time"), "vs yesterday by now"]);
    tick();
  }
  function renderOverview(d) {
    var data = state.summary, gh = data.github;
    // The last 48 hours, in the viewer's own time.
    var byHour = {};
    (data.hours || []).forEach(function (row) { byHour[row.hour] = row; });
    var hours = [], peaks = [], averages = [];
    for (var i = 47; i >= 0; i--) {
      var at = Math.floor(data.at / 36e5) * 36e5 - i * 36e5, key = new Date(at).toISOString().slice(0, 13), row = byHour[key];
      hours.push(at); peaks.push(row ? row.peak : 0); averages.push(row ? row.pings / 12 : 0);
    }
    area($("hours-chart"), { title: "Most online at once, each hour of the last two days", labels: hours, values: peaks, color: "var(--s1)", height: 190, integer: true,
      xLabel: function (at) { return hourOnly.format(new Date(at)); }, tipTitle: function (at) { return dayHour.format(new Date(at)); },
      rows: function (i) { return [{ color: "var(--s1)", name: "Most at once", value: num.format(peaks[i]) }, { name: "On average", value: one.format(averages[i]) }]; } });
    table($("hours-table"), ["Hour", "Most at once", "On average"], hours.map(function (at, i) { return [dayHour.format(new Date(at)), num.format(peaks[i]), one.format(averages[i])]; }).reverse());
    spark($("k-players-spark"), d.active, "var(--s1)");
    spark($("k-time-spark"), d.hours, "var(--s1)");
    // GitHub: the total, and what came in since the day before.
    if (gh) {
      countTo($("k-github"), gh.total, whole);
      var series = d.here.map(function (day) { return d.gh[day] ? d.gh[day].downloads : null; }).filter(function (v) { return v != null; });
      var ydl = d.gh[d.yesterday];
      add(clear($("k-github-foot")), ydl ? [h("span", { class: "delta up", text: "+" + num.format(Math.max(0, gh.total - ydl.downloads)) }), "since yesterday"] : ["across " + gh.releases.length + " releases"]);
      spark($("k-github-spark"), series, "var(--s2)", true);
    } else {
      $("k-github").textContent = "-";
      add(clear($("k-github-foot")), "GitHub hasn't answered yet");
      clear($("k-github-spark"));
    }
    var installs = sum(d.ok), before = sum(d.okBefore);
    $("k-installs-label").textContent = "Homebrew installs, " + data.span + " days";
    countTo($("k-installs"), installs, whole);
    add(clear($("k-installs-foot")), [delta(installs, before, "vs the " + data.span + " days before"), "vs the " + data.span + " days before"]);
    spark($("k-installs-spark"), d.ok, "var(--s1)");
  }
  function renderPlayers(d) {
    var data = state.summary, live = state.live;
    $("players-cap").textContent = "last " + data.span + " days";
    columns($("players-chart"), { title: "Players each day", labels: d.here, integer: true, height: 268, series: [{ name: "Returning", color: "var(--s1)", values: d.returning }, { name: "New", color: "var(--s2)", values: d.fresh }] });
    table($("players-table"), ["Day", "Returning", "New", "Players"], d.here.slice().reverse().map(function (day, k) { var i = d.here.length - 1 - k; return [day, num.format(d.returning[i]), num.format(d.fresh[i]), num.format(d.active[i])]; }));
    var average = sum(d.active) / data.span, averageBefore = sum(d.activeBefore) / data.span;
    var stats = $("players-stats");
    clear(stats);
    add(stats, [
      stat("A day, on average", "over the " + data.span + " days", one.format(average), delta(average, averageBefore, "vs the " + data.span + " days before")),
      stat("New in the range", "first seen in the last " + data.span + " days", num.format(sum(d.fresh)), delta(sum(d.fresh), sum(d.freshBefore), "vs the " + data.span + " days before")),
      stat("Last 7 days", "different consoles", num.format(data.week)),
      stat("Last 30 days", "different consoles", num.format(data.month)),
      stat("Here today", "of the last 30 days' players", data.month ? Math.round(100 * live.today / data.month) + "%" : "-"),
      stat("All consoles", "ever seen, kept a year after their last day", num.format(data.consoles))
    ]);
  }
  function renderTime(d) {
    var data = state.summary, hours = sum(d.hours), hoursBefore = sum(d.hoursBefore), sessions = sum(d.sessions);
    $("time-cap").textContent = "last " + data.span + " days";
    area($("time-chart"), { title: "Hours open each day", labels: d.here, values: d.hours, color: "var(--s1)", height: 268, tick: function (v) { return one.format(v) + "h"; },
      rows: function (i) { return [{ color: "var(--s1)", name: "Open", value: hoursText(d.hours[i]) }, { name: "Sessions", value: num.format(d.sessions[i]) }, { name: "Most at once", value: num.format(d.peak[i]) }]; } });
    table($("time-table"), ["Day", "Hours", "Sessions", "Most at once"], d.here.slice().reverse().map(function (day, k) { var i = d.here.length - 1 - k; return [day, one.format(d.hours[i]), num.format(d.sessions[i]), num.format(d.peak[i])]; }));
    var ever = data.ever || { pings: 0, sessions: 0, peak: 0 };
    var stats = $("time-stats");
    clear(stats);
    add(stats, [
      stat("Hours open", "in the last " + data.span + " days", hoursText(hours), delta(hours, hoursBefore, "vs the " + data.span + " days before")),
      stat("Sessions", "a console's first ping after ten quiet minutes", num.format(sessions), delta(sessions, sum(d.sessionsBefore), "vs the " + data.span + " days before")),
      stat("A session, on average", null, minutesText(sessions ? hours * 60 / sessions : 0)),
      stat("A player, on a day", "time open ÷ players, day by day", minutesText(sum(d.active) ? hours * 60 / sum(d.active) : 0)),
      stat("All time", "since counting started", hoursText(hoursOf(ever.pings))),
      stat("Most online at once", "ever", num.format(Math.max(ever.peak, state.live ? state.live.peak : 0)))
    ]);
  }
  function renderConsoles() {
    var data = state.summary, gh = data.github;
    $("consoles-cap").textContent = "What the consoles seen in the last " + data.span + " days run.";
    var latest = gh && gh.releases.filter(function (r) { return !r.prerelease; })[0];
    var latestVersion = latest ? latest.tag.replace(/^v/, "") : null;
    var onLatest = latestVersion ? sum((data.versions || []).filter(function (r) { return r.name === latestVersion || r.name.indexOf(latestVersion + "-") === 0; }).map(function (r) { return r.n; })) : 0;
    var all = sum((data.versions || []).map(function (r) { return r.n; }));
    $("latest-cap").textContent = latestVersion && all ? Math.round(100 * onLatest / all) + "% on " + latestVersion + " or its pre-releases" : "";
    bars($("versions"), data.versions || [], function (r) { return r.name; }, function (r) {
      return r.name === latestVersion ? h("span", { class: "badge brand", text: "Latest" }) : /-(pre|beta)/i.test(r.name) ? h("span", { class: "badge", text: "Test" }) : null;
    });
    bars($("firmware"), data.firmware || [], function (r) { return r.name; });
    bars($("languages"), data.languages || [], function (r) { return languageName(r.name); });
    bars($("editions"), data.editions || [], function (r) { return r.name === "homebrew" ? "Homebrew-only" : "Store"; });
  }
  function renderHomebrew(d) {
    var data = state.summary, ok = sum(d.ok), failed = sum(d.failed);
    columns($("installs-chart"), { title: "Homebrew installs each day", labels: d.here, integer: true, series: [{ name: "Installed", color: "var(--s1)", values: d.ok }, { name: "✕ Failed", color: "var(--bad)", values: d.failed }] });
    table($("installs-table"), ["Day", "Installed", "Failed"], d.here.slice().reverse().map(function (day, k) { var i = d.here.length - 1 - k; return [day, num.format(d.ok[i]), num.format(d.failed[i])]; }));
    $("rate-cap").textContent = "last " + data.span + " days";
    var rate = ok + failed ? ok / (ok + failed) : null, rateBefore = sum(d.okBefore) + sum(d.failedBefore) ? sum(d.okBefore) / (sum(d.okBefore) + sum(d.failedBefore)) : null;
    var box = clear($("rate"));
    if (rate == null) box.appendChild(h("div", { class: "empty", text: "No installs in this range" }));
    else {
      var busiest = d.ok.indexOf(max(d.ok)), last = d.here.length - 1;
      add(box, [
        h("div", { class: "big-num", text: Math.round(rate * 100) + "%" }),
        h("div", { class: "meter", style: "margin:12px 0 6px" }, h("i", { style: "width:" + (rate * 100) + "%;background:" + (rate >= 0.9 ? "var(--good)" : rate >= 0.7 ? "#fab219" : "var(--bad)") })),
        h("div", { class: "note" }, [num.format(ok) + " installed · " + num.format(failed) + " failed", rateBefore == null ? "" : " · " + Math.round(rateBefore * 100) + "% the " + data.span + " days before"]),
        h("div", { class: "stats", style: "margin-top:14px" }, [
          stat("Today", null, num.format(d.ok[last]) + (d.failed[last] ? " · " + num.format(d.failed[last]) + " failed" : "")),
          stat("A day, on average", null, one.format(ok / data.span)),
          stat("Busiest day", dayTitle(d.here[busiest]), num.format(d.ok[busiest]))
        ])
      ]);
    }
    var list = (data.apps || []).slice(0, 10);
    $("apps-cap").textContent = (data.apps || []).length > list.length ? "top " + list.length + " of " + data.apps.length + ", last " + data.span + " days" : "last " + data.span + " days";
    var apps = $("apps");
    clear(apps);
    if (!list.length) apps.appendChild(h("tbody", null, h("tr", null, h("td", { class: "empty", text: "Nothing yet" }))));
    else {
      apps.appendChild(h("thead", null, h("tr", null, [h("th", { text: "App" }), h("th", { class: "num", text: "Installed" }), h("th", { class: "num", text: "Failed" }), h("th", { class: "num", text: "Worked" })])));
      apps.appendChild(h("tbody", null, list.map(function (row) {
        var parts = String(row.app).split("/"), worked = row.ok + row.failed ? row.ok / (row.ok + row.failed) : 0;
        return h("tr", null, [
          h("td", null, [h("b", { text: parts.slice(1).join("/") || parts[0] }), parts.length > 1 ? h("div", { class: "owner", text: parts[0] }) : null]),
          h("td", { class: "num", text: num.format(row.ok) }),
          h("td", { class: "num", text: num.format(row.failed) }),
          h("td", { class: "num" }, h("div", { class: "rate" }, [Math.round(worked * 100) + "%", h("div", { class: "meter" }, h("i", { style: "width:" + (worked * 100) + "%;background:" + (worked >= 0.9 ? "var(--good)" : worked >= 0.7 ? "#fab219" : "var(--bad)") }))]))
        ]);
      })));
    }
    var fails = clear($("failures"));
    if (!(data.failures || []).length) fails.appendChild(h("div", { class: "empty", text: "None. Every install worked." }));
    (data.failures || []).forEach(function (row) {
      fails.appendChild(h("div", { class: "fail" }, [
        h("div", { class: "head" }, [h("b", { text: row.app }), h("span", { class: "note", text: ago(row.at) + " · " + row.version + " · firmware " + row.firmware })]),
        h("div", { class: "msg", text: row.error || "No error given" })
      ]));
    });
  }
  function renderGithub() {
    var gh = state.summary.github, box = clear($("releases"));
    if (!gh) {
      box.appendChild(h("div", { class: "empty", text: "GitHub hasn't answered yet. It's asked again in 15 minutes." }));
      $("github-total").textContent = "-";
      clear($("repo")); $("github-latest").textContent = ""; $("github-cap").textContent = "";
      clear($("github-chart")).appendChild(h("div", { class: "empty", text: "Nothing yet" }));
      return;
    }
    var list = gh.releases.slice(0, 12), top = max(list.map(function (r) { return r.image + r.update + r.other; })) || 1;
    var rels = h("div", { class: "rels" });
    var tip = null;
    list.forEach(function (r) {
      var all = r.image + r.update + r.other;
      var row = h("div", { class: "rel" }, [
        h("div", { class: "tag" }, [h("span", { text: r.tag }), r.prerelease ? h("span", { class: "badge", text: "Pre" }) : null, r === gh.releases.filter(function (x) { return !x.prerelease; })[0] ? h("span", { class: "badge brand", text: "Latest" }) : null]),
        h("div", { class: "track", style: "width:" + Math.max(2, 100 * all / top) + "%" }, [r.image ? h("i", { style: "flex:" + r.image + ";background:var(--s1)" }) : null, r.update ? h("i", { style: "flex:" + r.update + ";background:var(--s2)" }) : null, r.other ? h("i", { style: "flex:" + r.other + ";background:var(--axis)" }) : null]),
        h("div", { class: "n", text: num.format(all) })
      ]);
      row.addEventListener("pointermove", function (event) {
        var rect = box.getBoundingClientRect();
        var rows = [{ color: "var(--s1)", name: "Fresh installs", value: num.format(r.image) }, { color: "var(--s2)", name: "In-app updates", value: num.format(r.update) }];
        if (r.other) rows.push({ color: "var(--axis)", name: "Other files", value: num.format(r.other) });
        showTip(tip, event.clientX - rect.left, row.offsetTop, r.name + (r.published ? " · " + shortDate.format(new Date(r.published)) : ""), rows);
      });
      row.addEventListener("pointerleave", function () { tip.style.display = "none"; });
      rels.appendChild(row);
    });
    box.appendChild(rels);
    tip = tipIn(box);
    countTo($("github-total"), gh.total, whole);
    var fresh = Date.now() - gh.at < 30 * 6e4;
    $("github-cap").textContent = (fresh ? "checked " : "GitHub last answered ") + ago(gh.at);
    var latest = gh.releases.filter(function (r) { return !r.prerelease; })[0];
    $("github-latest").textContent = latest ? "Latest release " + latest.tag + (latest.published ? ", out " + ago(latest.published) : "") : "";
    add(clear($("repo")), [
      h("div", null, [h("b", { text: num.format(gh.stars) }), h("span", { text: "Stars" })]),
      h("div", null, [h("b", { text: num.format(gh.watchers) }), h("span", { text: "Watching" })]),
      h("div", null, [h("b", { text: num.format(gh.forks) }), h("span", { text: "Forks" })])
    ]);
    // Each day's new downloads: the difference between one day's total and the day before's.
    var chart = $("github-chart"), points = gh.days || [];
    if (points.length < 2) {
      clear(chart).appendChild(h("div", { class: "empty", text: "Counting started today: the first column comes tomorrow." }));
    } else {
      var news = points.slice(1).map(function (p, i) { return Math.max(0, p.downloads - points[i].downloads); });
      columns(chart, { title: "New downloads each day", labels: points.slice(1).map(function (p) { return p.day; }), integer: true, height: 200, series: [{ name: "New downloads", color: "var(--s2)", values: news }] });
    }
    table($("github-table"), ["Day", "New downloads", "All downloads"], points.map(function (p, i) { return [p.day, i ? num.format(Math.max(0, p.downloads - points[i - 1].downloads)) : "-", num.format(p.downloads)]; }).reverse());
  }
  function renderAll() {
    var data = state.summary;
    if (!data) return;
    var d = derive(data);
    state.live = state.live && state.live.at > data.at ? state.live : data;
    renderOverview(d);
    renderLive();
    renderPlayers(d);
    renderTime(d);
    renderConsoles();
    renderHomebrew(d);
    renderGithub();
    notes(data.announcements || []);
  }

  // ---- Talking to the worker ----
  // Same-origin requests carry the session cookie by themselves.
  function api(path, options) {
    return fetch(path, Object.assign({ credentials: "same-origin" }, options || {})).then(function (response) {
      if (response.status === 401) throw Object.assign(new Error("Signed out"), { gate: true });
      if (!response.ok) return response.json().catch(function () { return {}; }).then(function (body) { throw new Error(body.error || ("The server answered " + response.status)); });
      return response.json();
    });
  }
  // A POST that answers JSON; a refusal comes back as its sentence.
  function post(path, body) {
    return fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw Object.assign(new Error(data.error || ("The server answered " + response.status)), { gate: response.status === 401 && data.error === "signed out" });
          return data;
        });
      });
  }
  function failed(error) {
    if (error.gate) { stop(); showGate(""); } else $("updated").textContent = error.message;
  }
  function loadLive() {
    return api("/v1/admin/live").then(function (live) { state.live = live; state.liveAt = Date.now(); renderLive(); });
  }
  function loadSummary() {
    $("main").classList.add("loading");
    return api("/v1/admin/summary?days=" + state.span).then(function (data) {
      state.summary = data;
      state.liveAt = Date.now();
      showApp();
      renderAll();
    }).finally(function () { $("main").classList.remove("loading"); });
  }
  function tick() { if (state.liveAt) $("updated").textContent = "Updated " + ago(state.liveAt); }
  function start() {
    stop();
    loadSummary().catch(failed);
    state.timers.push(setInterval(function () { if (!document.hidden) loadLive().catch(failed); }, LIVE_MS));
    state.timers.push(setInterval(function () { if (!document.hidden) loadSummary().catch(failed); }, SUMMARY_MS));
    state.timers.push(setInterval(tick, 1000));
  }
  function stop() { state.timers.forEach(clearInterval); state.timers = []; }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.timers.length && state.summary) loadLive().catch(failed); });
  var resizing = null;
  window.addEventListener("resize", function () { clearTimeout(resizing); resizing = setTimeout(function () { if (state.summary) renderAll(); }, 150); });

  // ---- The header: range, sections, theme ----
  function pressRange() { [].forEach.call($("range").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-days")) === state.span)); }); }
  $("range").addEventListener("click", function (event) {
    var days = Number(event.target.getAttribute && event.target.getAttribute("data-days"));
    if (!days || days === state.span) return;
    state.span = days;
    try { localStorage.setItem("jl-span", String(days)); } catch (e) {}
    pressRange();
    loadSummary().catch(failed);
  });
  pressRange();
  if (window.IntersectionObserver) {
    var links = {};
    [].forEach.call($("nav").querySelectorAll("a"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        for (var id in links) links[id].classList.toggle("on", id === entry.target.id);
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(links).forEach(function (id) { seen.observe($(id)); });
  }
  var THEMES = ["auto", "dark", "light"], ICONS = {
    auto: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M12 3v18a9 9 0 0 0 0-18z"],
    dark: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"],
    light: ["M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"]
  }, NAMES = { auto: "follow the system", dark: "dark", light: "light" };
  var theme = "auto";
  try { theme = localStorage.getItem("jl-theme") || "auto"; } catch (e) {}
  function applyTheme() {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", theme);
    var button = clear($("theme"));
    button.title = "Theme: " + NAMES[theme];
    button.appendChild(s("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" },
      ICONS[theme].map(function (d, i) { return s("path", { d: d, fill: theme === "auto" && i === 1 ? "currentColor" : "none" }); })));
  }
  $("theme").addEventListener("click", function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem("jl-theme", theme); } catch (e) {}
    applyTheme();
    if (state.summary) renderAll();
  });
  applyTheme();

  // ---- Announcements ----
  // The announcements up now, each with its own Take down. As worker.js: five at once, 140 characters each.
  function notes(list) {
    var box = clear($("notes"));
    if (!list.length) box.appendChild(h("div", { class: "empty", text: "Nothing up right now." }));
    list.forEach(function (note) {
      var down = h("button", { type: "button", text: "Take down" });
      down.addEventListener("click", function () { if (confirm("Take this one down?\n\n" + note.text)) takeDown(note.id, down); });
      box.appendChild(h("div", { class: "item" + (note.level === "warning" ? " warning" : "") }, [
        h("div", { class: "body" }, [h("div", { class: "text", text: note.text }), h("div", { class: "note", text: (note.level === "warning" ? "Warning" : "Info") + " · posted " + new Date(note.id).toLocaleString() + (note.until ? " · until " + new Date(note.until).toLocaleString() : " · until you take it down") })]),
        down
      ]));
    });
    $("notes-count").textContent = list.length + " of " + MAX_NOTES + " up";
    $("post").disabled = list.length >= MAX_NOTES;
    $("full").hidden = list.length < MAX_NOTES;
    preview.list = list;
    preview.at = 0;
    showPreview();
  }
  function counted() { $("count").textContent = $("text").value.length + " / " + MAX_TEXT + ", one line on the console"; showPreview(); }
  function announce(text) {
    var level = document.querySelector("input[name=level]:checked").value;
    $("announce-error").textContent = "";
    return api("/v1/admin/announcement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text, level: level, hours: Number($("hours").value) }) })
      .then(function () { $("text").value = ""; counted(); return loadSummary(); })
      .catch(function (error) { if (error.gate) failed(error); else $("announce-error").textContent = error.message; });
  }
  function takeDown(id, button) {
    button.disabled = true;
    $("announce-error").textContent = "";
    return api("/v1/admin/announcement/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id }) })
      .then(loadSummary)
      .catch(function (error) { button.disabled = false; if (error.gate) failed(error); else $("announce-error").textContent = error.message; });
  }
  // The bar as the console draws it (ui/AnnouncementBar.jsx): the draft while one is being written, else the ones
  // up now taking turns, each for as long as the console keeps it.
  var preview = { list: [], at: 0, timer: null };
  var MEGAPHONE = ["M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14", "M8 6v8"];
  var ALERT = ["M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0", "M12 8v4", "M12 16h.01"];
  var turnOf = function (note) { return Math.max(6000, 2500 + note.text.length * 60); };
  // The stage is the console's 1920-wide screen top; the card is narrower, so it's drawn scaled down to fit.
  function fitConsole() {
    var box = $("console"), k = box.clientWidth / 1920;
    if (!k) return;
    $("stage").style.transform = "scale(" + k + ")";
    box.style.height = Math.round(204 * k) + "px";
  }
  function showPreview() {
    clearTimeout(preview.timer);
    fitConsole();
    var draft = $("text").value.trim(), bar = clear($("cbar"));
    var list = draft ? [{ text: draft, level: document.querySelector("input[name=level]:checked").value }] : preview.list;
    $("preview-cap").textContent = draft ? "your draft, before posting" : list.length > 1 ? "taking turns, as on the PS5" : "as on the PS5";
    $("preview-what").textContent = draft ? "Draft" : list.length ? (preview.at % list.length + 1) + " of " + list.length : "Nothing up: the bar is hidden";
    if (!list.length) { bar.style.visibility = "hidden"; return; }
    bar.style.visibility = "visible";
    var note = list[preview.at % list.length], warning = note.level === "warning", tone = warning ? "#fbbf24" : "#4cc9f0";
    bar.className = "cbar" + (warning ? " warn" : "");
    add(bar, [
      h("span", { class: "chip", style: "background:" + tone + "26" }, s("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: tone, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, (warning ? ALERT : MEGAPHONE).map(function (d) { return s("path", { d: d }); }))),
      h("span", { class: "lbl", style: "color:" + tone, text: "FROM JOBEE'SLAIR" }),
      h("span", { class: "sep" }),
      h("span", { class: "txt", text: note.text }),
      list.length > 1 ? h("span", { class: "dots" }, list.map(function (_, i) { return i === preview.at % list.length ? h("span", { class: "run" }, h("i", { style: "background:" + tone + ";animation-duration:" + turnOf(note) + "ms" })) : h("span", { class: "dot" }); })) : null
    ]);
    if (!draft && list.length > 1) preview.timer = setTimeout(function () { preview.at++; showPreview(); }, turnOf(note));
  }
  $("text").addEventListener("input", counted);
  [].forEach.call(document.querySelectorAll("input[name=level]"), function (radio) { radio.addEventListener("change", showPreview); });
  $("announce").addEventListener("submit", function (event) { event.preventDefault(); var text = $("text").value.trim(); if (text) announce(text); });

  // ---- Signing in, and the first-time setup ----
  function showApp() { $("gate-wrap").hidden = true; $("app").hidden = false; }
  function showGate(message) {
    $("app").hidden = true; $("gate-wrap").hidden = false; $("setup").hidden = true; $("gate").hidden = false;
    $("gate-error").textContent = message || "";
    $("code").value = "";
    ($("password").value ? $("code") : $("password")).focus();
  }
  // The authenticator key's QR code, one square a dark module, inside the quiet zone.
  function drawQr(size, cells) {
    var quiet = 4, total = size + quiet * 2, d = "";
    for (var i = 0; i < cells.length; i++) if (cells.charAt(i) === "1") d += "M" + (i % size + quiet) + " " + (Math.floor(i / size) + quiet) + "h1v1h-1z";
    clear($("qr")).appendChild(s("svg", { viewBox: "0 0 " + total + " " + total, width: total * 4, height: total * 4, "shape-rendering": "crispEdges" }, s("path", { d: d, fill: "#000" })));
  }
  function showSetup() {
    $("app").hidden = true; $("gate-wrap").hidden = false; $("gate").hidden = true; $("setup").hidden = false;
    $("setup-error").textContent = "";
    post("/v1/admin/setup/key").then(function (data) {
      drawQr(data.size, data.cells);
      $("setup-key").textContent = data.key.match(/.{1,4}/g).join(" ");
      $("new-password").focus();
    }).catch(function (error) { $("setup-error").textContent = error.message; });
  }
  $("gate-form").addEventListener("submit", function (event) {
    event.preventDefault();
    $("gate-error").textContent = "";
    post("/v1/admin/login", { password: $("password").value, code: $("code").value })
      .then(function (data) { $("password").value = ""; $("code").value = ""; if (data.setup) showSetup(); else start(); })
      .catch(function (error) { showGate(error.message); });
  });
  $("setup-form").addEventListener("submit", function (event) {
    event.preventDefault();
    $("setup-error").textContent = "";
    if ($("new-password").value !== $("new-password-again").value) { $("setup-error").textContent = "The two passwords aren't the same."; return; }
    post("/v1/admin/setup/finish", { password: $("new-password").value, code: $("setup-code").value })
      .then(function () { ["new-password", "new-password-again", "setup-code"].forEach(function (id) { $(id).value = ""; }); start(); })
      .catch(function (error) { if (error.gate) showGate("Setup took too long. Sign in with the first-time password again."); else $("setup-error").textContent = error.message; });
  });
  $("sign-out").addEventListener("click", function () {
    stop();
    fetch("/v1/admin/logout", { method: "POST", credentials: "same-origin" }).catch(function () {}).then(function () { showGate(""); });
  });
  start();  // a session from earlier opens straight in; otherwise the first look comes back 401 and asks
})();
</script>
</body>
</html>`;
