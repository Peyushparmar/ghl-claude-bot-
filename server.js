require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const conversationHistory = {};
const pendingBookings = {}; // stores proposed slot per contact

const STOP_WORDS = ["stop", "unsubscribe", "quit", "cancel", "optout", "opt out", "opt-out"];

// Area code → timezone map (US)
const AREA_CODE_TIMEZONES = {
  // Eastern
  "201":"America/New_York","202":"America/New_York","203":"America/New_York","205":"America/Chicago",
  "206":"America/Los_Angeles","207":"America/New_York","208":"America/Denver","209":"America/Los_Angeles",
  "210":"America/Chicago","212":"America/New_York","213":"America/Los_Angeles","214":"America/Chicago",
  "215":"America/New_York","216":"America/New_York","217":"America/Chicago","218":"America/Chicago",
  "219":"America/Chicago","220":"America/New_York","223":"America/New_York","224":"America/Chicago",
  "225":"America/Chicago","228":"America/Chicago","229":"America/New_York","231":"America/Detroit",
  "234":"America/New_York","239":"America/New_York","240":"America/New_York","248":"America/Detroit",
  "251":"America/Chicago","252":"America/New_York","253":"America/Los_Angeles","254":"America/Chicago",
  "256":"America/Chicago","260":"America/Indiana/Indianapolis","262":"America/Chicago","267":"America/New_York",
  "269":"America/Detroit","270":"America/Chicago","272":"America/New_York","276":"America/New_York",
  "281":"America/Chicago","301":"America/New_York","302":"America/New_York","303":"America/Denver",
  "304":"America/New_York","305":"America/New_York","307":"America/Denver","308":"America/Chicago",
  "309":"America/Chicago","310":"America/Los_Angeles","312":"America/Chicago","313":"America/Detroit",
  "314":"America/Chicago","315":"America/New_York","316":"America/Chicago","317":"America/Indiana/Indianapolis",
  "318":"America/Chicago","319":"America/Chicago","320":"America/Chicago","321":"America/New_York",
  "323":"America/Los_Angeles","325":"America/Chicago","330":"America/New_York","331":"America/Chicago",
  "332":"America/New_York","334":"America/Chicago","336":"America/New_York","337":"America/Chicago",
  "339":"America/New_York","340":"America/Puerto_Rico","341":"America/Los_Angeles","346":"America/Chicago",
  "347":"America/New_York","351":"America/New_York","352":"America/New_York","360":"America/Los_Angeles",
  "361":"America/Chicago","364":"America/Chicago","380":"America/New_York","385":"America/Denver",
  "386":"America/New_York","401":"America/New_York","402":"America/Chicago","404":"America/New_York",
  "405":"America/Chicago","406":"America/Denver","407":"America/New_York","408":"America/Los_Angeles",
  "409":"America/Chicago","410":"America/New_York","412":"America/New_York","413":"America/New_York",
  "414":"America/Chicago","415":"America/Los_Angeles","417":"America/Chicago","419":"America/New_York",
  "423":"America/New_York","424":"America/Los_Angeles","425":"America/Los_Angeles","430":"America/Chicago",
  "432":"America/Chicago","434":"America/New_York","435":"America/Denver","440":"America/New_York",
  "442":"America/Los_Angeles","443":"America/New_York","445":"America/New_York","447":"America/Chicago",
  "448":"America/New_York","458":"America/Los_Angeles","463":"America/Indiana/Indianapolis",
  "469":"America/Chicago","470":"America/New_York","475":"America/New_York","478":"America/New_York",
  "479":"America/Chicago","480":"America/Phoenix","484":"America/New_York","501":"America/Chicago",
  "502":"America/Kentucky/Louisville","503":"America/Los_Angeles","504":"America/Chicago",
  "505":"America/Denver","507":"America/Chicago","508":"America/New_York","509":"America/Los_Angeles",
  "510":"America/Los_Angeles","512":"America/Chicago","513":"America/New_York","515":"America/Chicago",
  "516":"America/New_York","517":"America/Detroit","518":"America/New_York","520":"America/Phoenix",
  "530":"America/Los_Angeles","531":"America/Chicago","539":"America/Chicago","540":"America/New_York",
  "541":"America/Los_Angeles","551":"America/New_York","559":"America/Los_Angeles","561":"America/New_York",
  "562":"America/Los_Angeles","563":"America/Chicago","564":"America/Los_Angeles","567":"America/New_York",
  "570":"America/New_York","571":"America/New_York","573":"America/Chicago","574":"America/Indiana/Indianapolis",
  "575":"America/Denver","580":"America/Chicago","582":"America/New_York","585":"America/New_York",
  "586":"America/Detroit","601":"America/Chicago","602":"America/Phoenix","603":"America/New_York",
  "605":"America/Chicago","606":"America/New_York","607":"America/New_York","608":"America/Chicago",
  "609":"America/New_York","610":"America/New_York","612":"America/Chicago","614":"America/New_York",
  "615":"America/Chicago","616":"America/Detroit","617":"America/New_York","618":"America/Chicago",
  "619":"America/Los_Angeles","620":"America/Chicago","623":"America/Phoenix","626":"America/Los_Angeles",
  "628":"America/Los_Angeles","629":"America/Chicago","630":"America/Chicago","631":"America/New_York",
  "636":"America/Chicago","641":"America/Chicago","646":"America/New_York","650":"America/Los_Angeles",
  "651":"America/Chicago","657":"America/Los_Angeles","659":"America/Chicago","660":"America/Chicago",
  "661":"America/Los_Angeles","662":"America/Chicago","667":"America/New_York","669":"America/Los_Angeles",
  "670":"America/Guam","671":"America/Guam","678":"America/New_York","680":"America/New_York",
  "681":"America/New_York","682":"America/Chicago","689":"America/New_York","701":"America/Chicago",
  "702":"America/Los_Angeles","703":"America/New_York","704":"America/New_York","706":"America/New_York",
  "707":"America/Los_Angeles","708":"America/Chicago","712":"America/Chicago","713":"America/Chicago",
  "714":"America/Los_Angeles","715":"America/Chicago","716":"America/New_York","717":"America/New_York",
  "718":"America/New_York","719":"America/Denver","720":"America/Denver","724":"America/New_York",
  "725":"America/Los_Angeles","726":"America/Chicago","727":"America/New_York","731":"America/Chicago",
  "732":"America/New_York","734":"America/Detroit","737":"America/Chicago","740":"America/New_York",
  "743":"America/New_York","747":"America/Los_Angeles","754":"America/New_York","757":"America/New_York",
  "760":"America/Los_Angeles","762":"America/New_York","763":"America/Chicago","764":"America/Los_Angeles",
  "765":"America/Indiana/Indianapolis","769":"America/Chicago","770":"America/New_York",
  "771":"America/New_York","772":"America/New_York","773":"America/Chicago","774":"America/New_York",
  "775":"America/Los_Angeles","779":"America/Chicago","781":"America/New_York","785":"America/Chicago",
  "786":"America/New_York","787":"America/Puerto_Rico","800":"America/New_York","801":"America/Denver",
  "802":"America/New_York","803":"America/New_York","804":"America/New_York","805":"America/Los_Angeles",
  "806":"America/Chicago","808":"Pacific/Honolulu","810":"America/Detroit","812":"America/Indiana/Indianapolis",
  "813":"America/New_York","814":"America/New_York","815":"America/Chicago","816":"America/Chicago",
  "817":"America/Chicago","818":"America/Los_Angeles","820":"America/Los_Angeles","825":"America/Denver",
  "828":"America/New_York","830":"America/Chicago","831":"America/Los_Angeles","832":"America/Chicago",
  "835":"America/New_York","843":"America/New_York","845":"America/New_York","847":"America/Chicago",
  "848":"America/New_York","850":"America/Chicago","854":"America/New_York","856":"America/New_York",
  "857":"America/New_York","858":"America/Los_Angeles","859":"America/Kentucky/Louisville",
  "860":"America/New_York","862":"America/New_York","863":"America/New_York","864":"America/New_York",
  "865":"America/New_York","870":"America/Chicago","872":"America/Chicago","878":"America/New_York",
  "901":"America/Chicago","903":"America/Chicago","904":"America/New_York","906":"America/Detroit",
  "907":"America/Anchorage","908":"America/New_York","909":"America/Los_Angeles","910":"America/New_York",
  "912":"America/New_York","913":"America/Chicago","914":"America/New_York","915":"America/Denver",
  "916":"America/Los_Angeles","917":"America/New_York","918":"America/Chicago","919":"America/New_York",
  "920":"America/Chicago","925":"America/Los_Angeles","928":"America/Phoenix","929":"America/New_York",
  "930":"America/Indiana/Indianapolis","931":"America/Chicago","934":"America/New_York",
  "936":"America/Chicago","937":"America/New_York","938":"America/Chicago","939":"America/Puerto_Rico",
  "940":"America/Chicago","941":"America/New_York","947":"America/Detroit","949":"America/Los_Angeles",
  "951":"America/Los_Angeles","952":"America/Chicago","954":"America/New_York","956":"America/Chicago",
  "959":"America/New_York","970":"America/Denver","971":"America/Los_Angeles","972":"America/Chicago",
  "973":"America/New_York","975":"America/Chicago","978":"America/New_York","979":"America/Chicago",
  "980":"America/New_York","984":"America/New_York","985":"America/Chicago","986":"America/Denver",
  "989":"America/Detroit"
};

function getTimezoneFromPhone(phone) {
  if (!phone) return "America/New_York";
  const digits = phone.replace(/\D/g, "");
  const areaCode = digits.startsWith("1") ? digits.slice(1, 4) : digits.slice(0, 3);
  return AREA_CODE_TIMEZONES[areaCode] || "America/New_York";
}

function getTimezoneAbbr(tz) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" });
  const parts = formatter.formatToParts(now);
  return parts.find(p => p.type === "timeZoneName")?.value || "EST";
}

async function getAvailableSlots() {
  try {
    // Get event type URI
    const userRes = await axios.get("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${process.env.CALENDLY_API_KEY}` }
    });

    const userUri = userRes.data.resource.uri;

    // Get event types
    const eventTypesRes = await axios.get(`https://api.calendly.com/event_types?user=${userUri}`, {
      headers: { Authorization: `Bearer ${process.env.CALENDLY_API_KEY}` }
    });

    const eventType = eventTypesRes.data.collection[0];
    const eventTypeUri = eventType.uri;

    // Get available times for next 7 days
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 2); // at least 2 hours from now
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + 7);

    const availRes = await axios.get(
      `https://api.calendly.com/event_type_available_times?event_type=${eventTypeUri}&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}`,
      { headers: { Authorization: `Bearer ${process.env.CALENDLY_API_KEY}` } }
    );

    return {
      eventTypeUri,
      slots: availRes.data.collection.slice(0, 10) // top 10 slots
    };
  } catch (err) {
    console.error("[CALENDLY ERROR]", err.response?.data || err.message);
    return null;
  }
}

async function bookMeeting(eventTypeUri, startTime, inviteeName, inviteeEmail, inviteeTimezone) {
  try {
    const res = await axios.post(
      "https://api.calendly.com/one_off_event_types",
      {
        name: `Discovery Call - ${inviteeName}`,
        host: process.env.CALENDLY_USER_URI,
        co_hosts: [],
        duration: 15,
        timezone: inviteeTimezone,
        date_setting: {
          type: "date_range",
          start_date: startTime.split("T")[0],
          end_date: startTime.split("T")[0],
        },
        location: { kind: "google_conference" }
      },
      { headers: { Authorization: `Bearer ${process.env.CALENDLY_API_KEY}`, "Content-Type": "application/json" } }
    );

    // Create scheduling link
    const linkRes = await axios.post(
      "https://api.calendly.com/scheduling_links",
      {
        max_event_count: 1,
        owner: res.data.resource.uri,
        owner_type: "EventType"
      },
      { headers: { Authorization: `Bearer ${process.env.CALENDLY_API_KEY}`, "Content-Type": "application/json" } }
    );

    return linkRes.data.resource.booking_url;
  } catch (err) {
    console.error("[BOOKING ERROR]", err.response?.data || err.message);
    return null;
  }
}

async function getRelevantExamples(message) {
  try {
    const { data, error } = await supabase
      .from("conversation_examples")
      .select("summary, exchange, outcome")
      .textSearch("exchange", message, { type: "plain", config: "english" })
      .limit(3);

    if (error || !data || data.length === 0) {
      const { data: all } = await supabase
        .from("conversation_examples")
        .select("summary, exchange, outcome")
        .limit(5);
      return all || [];
    }
    return data;
  } catch (err) {
    console.error("[DB ERROR]", err.message);
    return [];
  }
}

function getSystemPrompt(examples, availableSlots, leadTimezone, tzAbbr) {
  const slotsText = availableSlots && availableSlots.slots.length > 0
    ? `\n\nYour available meeting slots (already converted to ${tzAbbr} for this lead):\n${availableSlots.slots.slice(0, 6).map(slot => {
        const date = new Date(slot.start_time);
        return date.toLocaleString("en-US", {
          timeZone: leadTimezone,
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true
        });
      }).join("\n")}`
    : "";

  const exampleText = examples.length > 0
    ? `\n\nReal conversation examples to learn from:\n\n${examples.map((e, i) =>
        `Example ${i + 1} (${e.outcome}):\n${e.exchange}`
      ).join("\n\n---\n\n")}`
    : "";

  return `You are Patrick from HEADDMEDIA. You are texting loan officers to book a 15-minute demo call.

About HEADDMEDIA:
- We have an automated AI system that books mortgage borrowers directly as appointments for loan officers
- We do NOT sell leads — we deliver booked appointments
- The system is tailored to the states the loan officer is licensed in and loan types they do (FHA, VA, Conventional, DSCR, Jumbo, etc.)
- Pricing: depends on states and loan types, ballpark $500-$650/month — do not discuss in detail over text, get them on a call

Your conversation flow:
1. Respond to their question naturally
2. Qualify them: how many states licensed in, what loan types
3. Once interested → suggest a meeting time from your available slots
4. Say something like: "How about [Day] at [Time] ${tzAbbr}?"
5. If they confirm → tell them you'll send a calendar invite and ask for their email
6. Once you have their email → confirm: "Perfect, booking you in for [time] ${tzAbbr}, sending the invite to [email] now"
7. DO NOT send any Calendly links — just book it directly

Your style:
- Sound exactly like a real human texting — casual, natural, short messages
- 1-3 sentences max per message
- Use "lol", "...lol" naturally like the real Patrick does
- No emojis unless they use them first
- No formal sign-offs
- Never mention you are AI
${slotsText}
${exampleText}`;
}

async function sendSMS(contactId, message) {
  try {
    await axios.post(
      "https://services.leadconnectorhq.com/conversations/messages",
      {
        type: "SMS",
        contactId: contactId,
        locationId: process.env.GHL_LOCATION_ID,
        message: message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_KEY}`,
          "Content-Type": "application/json",
          Version: "2021-04-15",
        },
      }
    );
    console.log(`[SMS SENT] contactId=${contactId} | message=${message}`);
  } catch (err) {
    console.error("[SMS ERROR] Status:", err.response?.status);
    console.error("[SMS ERROR] Data:", JSON.stringify(err.response?.data));
    console.error("[SMS ERROR] Message:", err.message);
  }
}

async function getAIReply(contactId, contactName, incomingMessage, phone) {
  if (!conversationHistory[contactId]) {
    conversationHistory[contactId] = [];
  }

  conversationHistory[contactId].push({ role: "user", content: incomingMessage });

  const history = conversationHistory[contactId].slice(-10);
  const examples = await getRelevantExamples(incomingMessage);
  const leadTimezone = getTimezoneFromPhone(phone);
  const tzAbbr = getTimezoneAbbr(leadTimezone);
  const availableSlots = await getAvailableSlots();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 300,
    system: getSystemPrompt(examples, availableSlots, leadTimezone, tzAbbr),
    messages: history,
  });

  const reply = response.content[0].text.trim();
  conversationHistory[contactId].push({ role: "assistant", content: reply });

  // Check if reply confirms a booking and we have an email
  const emailMatch = incomingMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && pendingBookings[contactId]) {
    const { slot, name } = pendingBookings[contactId];
    console.log(`[BOOKING] Attempting to book for ${name} at ${slot.start_time}`);
    const bookingUrl = await bookMeeting(
      slot.event_type,
      slot.start_time,
      name,
      emailMatch[0],
      leadTimezone
    );
    if (bookingUrl) {
      console.log(`[BOOKING SUCCESS] ${bookingUrl}`);
    }
    delete pendingBookings[contactId];
  }

  // Store pending booking if a slot was proposed
  if (availableSlots && availableSlots.slots.length > 0) {
    pendingBookings[contactId] = {
      slot: availableSlots.slots[0],
      name: contactName
    };
  }

  return reply;
}

app.post("/webhook/ghl", async (req, res) => {
  res.sendStatus(200);

  console.log("[WEBHOOK RAW]", JSON.stringify(req.body));

  const contactId = req.body.contact_id || req.body.contactId || req.body.id;
  const contactName = req.body.full_name || req.body.contactName || req.body.first_name || req.body.name || "Friend";
  const phone = req.body.phone || req.body.contact_phone || "";
  const rawMessage = req.body.message;
  const message = (rawMessage && typeof rawMessage === "object" ? rawMessage.body : rawMessage)
    || req.body.body || req.body.text || req.body.messageBody || req.body.message_body
    || (req.body.customData && req.body.customData.Message);

  if (!contactId || !message) {
    console.log("[WEBHOOK] Missing contactId or message. Body:", JSON.stringify(req.body));
    return;
  }

  const lowerMsg = message.toLowerCase().trim();
  if (STOP_WORDS.some((word) => lowerMsg.includes(word))) {
    console.log(`[STOP WORD] contactId=${contactId} — not replying.`);
    return;
  }

  console.log(`[INCOMING] ${contactName} (${phone}): ${message}`);

  try {
    const delay = Math.floor(Math.random() * 6000) + 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const reply = await getAIReply(contactId, contactName, message, phone);
    await sendSMS(contactId, reply);
  } catch (err) {
    console.error("[ERROR]", err.message);
  }
});

app.post("/test", async (req, res) => {
  const { name, message, phone } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    const testContactId = "test-" + Date.now();
    const reply = await getAIReply(testContactId, name || "Tester", message, phone || "+12125551234");
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "running", message: "GHL Claude Bot is active" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GHL Claude Bot running on port ${PORT}`);
});
