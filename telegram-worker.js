// Air Taxi Nepal: booking relay (Cloudflare Worker)
// Telegram is blocked inside Nepal, so the website sends bookings here,
// and this worker (running outside Nepal) forwards them to your Telegram bot.
// Your token stays private here: visitors can never see this code.

// 1. PASTE YOUR DETAILS HERE (keep the quotes)
const BOT_TOKEN = "9197262737:AAH2FfbUt8oot_y0--grYfimIU1xugfQqhM";
const CHAT_ID   = "9197262737";

// Websites allowed to send bookings (any *.github.io address is also allowed)
const ALLOWED = ["https://airtaxinepal.org", "https://www.airtaxinepal.org"];

const AIRPORTS = { KTM:"Kathmandu", PKR:"Pokhara", BHR:"Bharatpur", BIR:"Biratnagar", BDP:"Bhadrapur", JKR:"Janakpur", SIF:"Simara", BWA:"Bhairahawa", KEP:"Nepalgunj", DHI:"Dhangadhi", SKH:"Surkhet", RJB:"Rajbiraj", TMI:"Tumlingtar", LUA:"Lukla", RHP:"Ramechhap", JMO:"Jomsom", JUM:"Jumla", IMK:"Simikot", DOP:"Dolpa", TPJ:"Taplejung" };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const pretty = v => new Date(v + "T00:00:00Z").toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric", timeZone:"UTC" });

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const allowed = ALLOWED.includes(origin) || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method === "GET") return json({ ok: true, message: "Booking relay is running." });
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!allowed) return json({ ok: false, error: "Website not allowed: " + origin }, 403);

    let d;
    try { d = await req.json(); } catch { return json({ ok: false, error: "Bad data" }, 400); }

    const name  = String(d.name || "").trim().slice(0, 80);
    const cc    = String(d.cc || "").replace(/[^\d+]/g, "").slice(0, 5);
    const phone = String(d.phone || "").replace(/\D/g, "").slice(0, 15);
    const pax   = Math.min(9, Math.max(1, parseInt(d.pax, 10) || 1));
    const round = d.trip === "round";
    const ref   = /^ATN-[A-Z0-9]{5}$/.test(d.ref || "") ? d.ref : "ATN-?????";
    const { from, to, date, ret } = d;

    if (name.length < 2 || phone.length < 6 || !AIRPORTS[from] || !AIRPORTS[to] || from === to || !isDate(date) || (round && !isDate(ret))) {
      return json({ ok: false, error: "Missing or invalid booking details" }, 400);
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
<b>Date:</b> ${pretty(date)}${round ? `\n<b>Return:</b> ${pretty(ret)}` : ""}
<b>Passengers:</b> ${pax}
--------------------------------`;

    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    const t = await r.json().catch(() => ({}));
    return t.ok ? json({ ok: true }) : json({ ok: false, error: "Telegram: " + (t.description || r.status) }, 502);
  }
};
