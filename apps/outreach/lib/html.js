/** Server-rendered HTML, no framework, one stylesheet. */
import { config } from "./config.js";

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAV = [
  ["/", "Overview"],
  ["/review", "Review"],
  ["/queue", "Outbox"],
  ["/sent", "Sent"],
  ["/suppressions", "Do not contact"],
  ["/audit", "Audit"],
];

const STYLE = `
:root{--paper:#faf6f1;--ink:#191310;--muted:#7b6e64;--line:#ede3d8;--card:#fff;--coral:#ff5a36;--green:#0f8a5f;--amber:#b87400;--blue:#2f6fed;--radius:16px}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);
background:radial-gradient(900px 600px at 8% -5%,#fff3e6 0,transparent 55%),#efe9e2;background-attachment:fixed;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a.underline{text-decoration:underline;text-underline-offset:2px}
.shell{display:grid;grid-template-columns:200px minmax(0,1fr);gap:28px;max-width:1180px;margin:0 auto;padding:26px 22px 70px}
aside{position:sticky;top:26px;align-self:start}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}
.mark{width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#ff8a5b,var(--coral));color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px}
.brand b{display:block;font-size:15px;letter-spacing:-.01em}
.brand span{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
nav{display:grid;gap:4px}
nav a{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:11px;font-size:13.5px;color:#4a4038;font-weight:550}
nav a:hover{background:#fff}
nav a[data-active=true]{background:var(--ink);color:#fff}
nav .n{font-size:11px;opacity:.65;font-variant-numeric:tabular-nums}
main{min-width:0}
h1{font-size:25px;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:16px;letter-spacing:-.01em;margin:26px 0 10px}
h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
p{margin:0 0 12px;line-height:1.55;color:#3b332c}
.lede{color:var(--muted);font-size:14px;max-width:62ch;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;margin-bottom:14px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(168px,1fr))}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}
.stat b{display:block;font-size:26px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.stat span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.stat.hot b{color:var(--coral)}
.stat.ok b{color:var(--green)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:0 10px 8px}
td{padding:11px 10px;border-top:1px solid var(--line);vertical-align:top}
tr:first-child td{border-top:none}
.name{font-weight:600}
.sub{color:var(--muted);font-size:12px;margin-top:2px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.01em;background:#f1ece6;color:#5d5249;white-space:nowrap}
.chip.sent{background:#e6f4ee;color:#0b6b49}
.chip.simulated{background:#eef0fb;color:#3b4a9c}
.chip.approved,.chip.replied{background:#fff0e6;color:#b8460f}
.chip.drafted{background:#fff8e0;color:#8a6100}
.chip.blocked,.chip.failed{background:#fdeaea;color:#a32121}
.chip.partner{background:#e6f4ee;color:#0b6b49}
.chip.enriched{background:#eaf3ff;color:#1f4fa8}
.chip.no_email,.chip.skipped{background:#f1ece6;color:#6c6058}
.btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:#fff;color:var(--ink);padding:8px 13px;border-radius:11px;font-size:13px;font-weight:600;cursor:pointer;transition:.12s}
.btn:hover{border-color:#d9cbbd;transform:translateY(-1px)}
.btn.primary{background:var(--ink);border-color:var(--ink);color:#fff}
.btn.primary:hover{background:#000}
.btn.coral{background:var(--coral);border-color:var(--coral);color:#fff}
.btn.ghost{background:transparent}
.btn.danger{color:#a32121;border-color:#f0d3d3;background:#fffafa}
.btn.sm{padding:5px 10px;font-size:12px;border-radius:9px}
form.inline{display:inline}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.between{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
.note{background:#fff8e6;border:1px solid #f3e2b7;border-radius:12px;padding:11px 14px;font-size:13px;color:#6b4e00;margin-bottom:14px}
.note.ok{background:#eaf7f0;border-color:#c9e9d9;color:#0b6b49}
.note.bad{background:#fdeeee;border-color:#f2cfcf;color:#931f1f}
.note code{background:#0000000d;padding:1px 5px;border-radius:5px}
label{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 5px;font-weight:600}
input[type=text],input[type=password],input[type=number],input[type=email],select,textarea{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:#fff;font:inherit;font-size:14px;color:var(--ink)}
textarea{resize:vertical;line-height:1.5}
input:focus,textarea:focus,select:focus{outline:2px solid #ffd0bf;outline-offset:1px;border-color:#ffb79c}
.field{margin-bottom:14px}
.letter{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;white-space:pre-wrap;line-height:1.6;font-size:14.5px;color:#26201a}
.letter .small{color:var(--muted);font-size:12.5px}
.evidence{background:#f7f3ee;border-radius:12px;padding:12px 14px;font-size:12.5px;color:#5b5048;margin-top:10px}
.evidence b{color:#3b332c}
.evidence a{text-decoration:underline;text-underline-offset:2px}
.pill-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.preview-frame{width:100%;height:520px;border:1px solid var(--line);border-radius:14px;background:#fff}
details summary{cursor:pointer;color:var(--muted);font-size:12.5px}
.detail-body{margin-top:8px;font-size:12.5px;color:#5b5048}
.empty{color:var(--muted);font-size:13.5px;padding:18px 0}
.quote{font-size:13px;color:var(--muted);max-width:60ch}
footer{margin-top:34px;font-size:11.5px;color:var(--muted)}
.tag{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
`;

export function layout({ title, active = "/", body, user = null, flash = "", wide = false }) {
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${href}" data-active="${href === active}"><span>${label}</span></a>`
  ).join("");

  const devNotice =
    user && !config.password && !config.isProduction
      ? `<div class="note bad">This instance uses the development password. Set <code>OUTREACH_PASSWORD</code> before it can reach anyone real.</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · Away outreach</title>
<style>${STYLE}</style>
</head>
<body>
<div class="shell"${wide ? ' style="grid-template-columns:200px minmax(0,1fr)"' : ""}>
  <aside>
    <div class="brand">
      <div class="mark">A</div>
      <div><b>Away outreach</b><span>one city at a time</span></div>
    </div>
    <nav>${nav}</nav>
    <div style="margin-top:18px">
      ${
        user
          ? `<form method="post" action="/logout"><button class="btn sm ghost" type="submit">Sign out</button></form>`
          : `<a class="btn sm" href="/login">Sign in</a>`
      }
    </div>
  </aside>
  <main>
    ${devNotice}
    ${flash}
    ${body}
    <footer>Every send is attributed to a person, and nothing leaves without one. <a class="underline" href="/audit">Audit log</a> · <a class="underline" href="/suppressions">Do not contact</a></footer>
  </main>
</div>
</body>
</html>`;
}

export function flashNote(text, kind = "") {
  return text ? `<div class="note ${kind}">${text}</div>` : "";
}

const LABELS = {
  new: "found",
  enriched: "has email",
  no_email: "no email",
  drafted: "draft",
  approved: "approved",
  sent: "sent",
  replied: "replied",
  skipped: "skipped",
  blocked: "blocked",
  partner: "already a partner",
  failed: "failed",
  simulated: "simulated",
  would_send: "would send",
};

export function chip(status) {
  return `<span class="chip ${esc(status)}">${esc(LABELS[status] ?? status)}</span>`;
}

export function stat(value, label, cls = "") {
  return `<div class="stat ${cls}"><b>${value}</b><span>${esc(label)}</span></div>`;
}

export function cityName(city) {
  return city ? city.name : "—";
}
