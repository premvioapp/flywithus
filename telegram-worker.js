// Optional Cloudflare Worker: keeps your Telegram bot token secret.
// Setup: Cloudflare dashboard → Workers & Pages → Create → Worker → paste this file → Deploy.
// Then Settings → Variables and Secrets → add BOT_TOKEN and CHAT_ID (type: Secret).
// Finally, put the worker URL in PROXY_URL inside index.html.

const ALLOWED_ORIGINS = [
  "https://airtaxinepal.org",
  "https://www.airtaxinepal.org",
  "https://YOUR-GITHUB-USERNAME.github.io" // for testing before the domain is connected
];

const AIRPORTS = { KTM:"Kathmandu", PKR:"Pokhara", BHR:"Bharatpur", BIR:"Biratnagar", BDP:"Bhadrapur", JKR:"Janakpur", SIF:"Simara", BWA:"Bhairahawa", KEP:"Nepalgunj", DHI:"Dhangadhi", SKH:"Surkhet", RJB:"Rajbiraj", TMI:"Tumlingtar", LUA:"Lukla", RHP:"Ramechhap", JMO:"Jomsom", JUM:"Jumla", IMK:"Simikot", DOP:"Dolpa", TPJ:"Taplejung" };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false }, 403);

    let d;
    try { d = await req.json(); } catch { return json({ ok: false }, 400); }

    const name = String(d.name || "").trim().slice(0, 80);
    const cc = String(d.cc || "").replace(/[^\d+]/g, "").slice(0, 5);
    const phone = String(d.phone || "").replace(/\D/g, "").slice(0, 15);
    const pax = Math.min(9, Math.max(1, parseInt(d.pax, 10) || 1));
    const { from, to, date } = d;
    const round = d.trip === "round";
    const ret = round ? String(d.ret || "") : "";
    const ref = /^ATN-[A-Z0-9]{5}$/.test(d.ref || "") ? d.ref : "ATN-?????";

    if (name.length < 2 || phone.length < 6 || !AIRPORTS[from] || !AIRPORTS[to] || from === to || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || (round && !/^\d{4}-\d{2}-\d{2}$/.test(ret))) {
      return json({ ok: false }, 400);
    }

    const text =
`<b>NEW BOOKING REQUEST</b>
Ref: <b>${ref}</b>  |  airtaxinepal.org
--------------------------------
<b>Name:</b> ${esc(name)}
<b>WhatsApp:</b> ${esc(cc)} ${esc(phone)}
<b>Chat link:</b> https://wa.me/${(cc + phone).replace(/\D/g, "")}
--------------------------------
<b>From:</b> ${AIRPORTS[from]} (${from})
<b>To:</b> ${AIRPORTS[to]} (${to})
<b>Trip:</b> ${round ? "Round trip" : "One way"}
<b>Date:</b> ${date}${round ? `\n<b>Return:</b> ${ret}` : ""}
<b>Passengers:</b> ${pax}
--------------------------------`;

    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }
};
