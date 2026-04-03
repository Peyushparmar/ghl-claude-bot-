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

const STOP_WORDS = ["stop", "unsubscribe", "quit", "cancel", "optout", "opt out", "opt-out"];

async function getRelevantExamples(message) {
  try {
    const { data, error } = await supabase
      .from("conversation_examples")
      .select("summary, exchange, outcome")
      .textSearch("exchange", message, { type: "plain", config: "english" })
      .limit(3);

    if (error || !data || data.length === 0) {
      // Fallback: return all examples if search fails
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

function getSystemPrompt(examples) {
  const exampleText = examples.length > 0
    ? `\n\nHere are real examples of successful conversations to learn from:\n\n${examples.map((e, i) =>
        `Example ${i + 1} (${e.outcome}):\n${e.exchange}`
      ).join("\n\n---\n\n")}`
    : "";

  return `You are Patrick from HEADDMEDIA. You are texting loan officers to get them to book a 15-minute demo call.

Your goal: Book a meeting on this calendar link: ${process.env.BOOKING_LINK}

About HEADDMEDIA:
- We have an automated AI system that gets loan officers borrowers directly booked as appointments
- We do NOT sell leads
- The system works based on the states the loan officer is licensed in and the loan types they do (FHA, VA, Conventional, DSCR, Jumbo, etc.)
- Pricing depends on loan types, states licensed in, and other factors — ballpark is $500 to $650/month
- Do not discuss pricing in detail over text — get them on a call first

Your conversation style:
- Sound exactly like a real human texting, casual and natural
- Short messages — 1-3 sentences max
- Never robotic, never salesy
- Use "lol", "...lol", natural punctuation like real texts
- Do not use emojis unless they use them first
- Do not sign off formally
- Do not mention you are an AI

Conversation flow:
1. They respond to your opening → acknowledge warmly, handle their question, then ask qualifying questions (how many states licensed in, what loan types)
2. Once qualified → push to book a 15-min demo call
3. If they want to know pricing → say it depends on their states and loan types, ballpark $500-$650/month, best to hop on a quick call to give exact numbers
4. If they just want leads sent → explain we don't sell leads, we book appointments directly through the AI system
5. If they ask what company → say HEADDMEDIA
6. If not interested → respect it, leave door open: "No worries at all, feel free to reach out if anything changes"
7. If they give availability → confirm a time and ask for their email to send the invite
8. Booking link if they want to self-book: ${process.env.BOOKING_LINK}
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

async function getAIReply(contactId, contactName, incomingMessage) {
  if (!conversationHistory[contactId]) {
    conversationHistory[contactId] = [];
  }

  conversationHistory[contactId].push({
    role: "user",
    content: incomingMessage,
  });

  const history = conversationHistory[contactId].slice(-10);
  const examples = await getRelevantExamples(incomingMessage);

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 300,
    system: getSystemPrompt(examples),
    messages: history,
  });

  const reply = response.content[0].text.trim();

  conversationHistory[contactId].push({
    role: "assistant",
    content: reply,
  });

  return reply;
}

app.post("/webhook/ghl", async (req, res) => {
  res.sendStatus(200);

  console.log("[WEBHOOK RAW]", JSON.stringify(req.body));

  const contactId = req.body.contact_id || req.body.contactId || req.body.id;
  const contactName = req.body.full_name || req.body.contactName || req.body.first_name || req.body.name || "Friend";
  const rawMessage = req.body.message;
  const message = (rawMessage && typeof rawMessage === "object" ? rawMessage.body : rawMessage)
    || req.body.body
    || req.body.text
    || req.body.messageBody
    || req.body.message_body
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

  console.log(`[INCOMING] ${contactName}: ${message}`);

  try {
    const delay = Math.floor(Math.random() * 6000) + 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const reply = await getAIReply(contactId, contactName, message);
    await sendSMS(contactId, reply);
  } catch (err) {
    console.error("[ERROR]", err.message);
  }
});

app.post("/test", async (req, res) => {
  const { name, message } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    const testContactId = "test-" + Date.now();
    const reply = await getAIReply(testContactId, name || "Tester", message);
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
