// Air Taxi Nepal: booking relay (Cloudflare Worker)
// Telegram is blocked inside Nepal, so the website sends bookings here,
// and this worker (running outside Nepal) forwards them to your Telegram bot.
// Your token stays private here: visitors can never see this code.

// 1. PASTE YOUR DETAILS HERE (keep the quotes)
const BOT_TOKEN = "PASTE_YOUR_BOT_TOKEN_HERE";
const CHAT_ID   = "PASTE_YOUR_CHAT_ID_HERE";


const AIRPORTS = { KTM:"Kathmandu", PKR:"Pokhara", BHR:"Bharatpur", BIR:"Biratnagar", BDP:"Bhadrapur", JKR:"Janakpur", SIF:"Simara", BWA:"Bhairahawa", KEP:"Nepalgunj", DHI:"Dhangadhi", SKH:"Surkhet", RJB:"Rajbiraj", TMI:"Tumlingtar", LUA:"Lukla", RHP:"Ramechhap", JMO:"Jomsom", JUM:"Jumla", IMK:"Simikot", DOP:"Dolpa", TPJ:"Taplejung" };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const pretty = v => new Date(v + "T00:00:00Z").toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric", timeZone:"UTC" });

function explain(desc) {
  const d = String(desc || "");
  if (/unauthorized|not found/i.test(d) && !/chat/i.test(d)) return "Your BOT_TOKEN is wrong or was revoked. Copy the latest token from @BotFather and paste it at the top of this worker.";
  if (/chat not found/i.test(d)) return "Your CHAT_ID is wrong, or you never pressed Start in your bot. Open your bot in Telegram, press Start, then get YOUR ID from @userinfobot. Do not use the number at the start of the bot token.";
  if (/blocked by the user/i.test(d)) return "You blocked the bot. Open it in Telegram, unblock it, and press Start.";
  if (/PASTE_YOUR/.test(d)) return "You haven't pasted your BOT_TOKEN and CHAT_ID at the top of this worker yet.";
  return d;
}

async function sendTelegram(text) {
  if (BOT_TOKEN.startsWith("PASTE") || CHAT_ID.startsWith("PASTE")) return { ok: false, error: explain("PASTE_YOUR") };
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    const t = await r.json().catch(() => ({}));
    return t.ok ? { ok: true } : { ok: false, error: explain(t.description || "HTTP " + r.status) };
  } catch (e) {
    return { ok: false, error: "Could not reach Telegram: " + e.message };
  }
}

export default {
  async fetch(req) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (!url.searchParams.has("test")) {
        return new Response("Booking relay is running.\n\nTo send a test message to your Telegram, add ?test to the end of this address.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
      const res = await sendTelegram("<b>Test message</b>\nYour airtaxinepal.org booking relay is connected.");
      return new Response(res.ok ? "SUCCESS: a test message was sent to your Telegram bot chat." : "PROBLEM: " + res.error,
        { status: res.ok ? 200 : 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

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

    const res = await sendTelegram(text);
    return res.ok ? json({ ok: true }) : json({ ok: false, error: res.error }, 502);
  }
};
