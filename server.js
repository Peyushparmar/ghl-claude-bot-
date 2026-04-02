require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory conversation history per contact
const conversations = {};

const STOP_WORDS = ["stop", "unsubscribe", "quit", "cancel", "optout", "opt out", "opt-out"];

function getSystemPrompt() {
  return `You are Patrick, a friendly and professional mortgage advisor. Your goal is to have a natural SMS conversation with leads and get them to book a discovery call.

Your booking link is: ${process.env.BOOKING_LINK}

Guidelines:
- Keep messages SHORT — 1-3 sentences max. This is SMS, not email.
- Sound human and conversational, never robotic or salesy.
- Your main goal is to qualify interest and book a call.
- If they show any interest, guide them to book: "${process.env.BOOKING_LINK}"
- If they ask about rates, costs, or how it works, give a brief honest answer then invite them to book a call for details.
- If they say they already have someone, acknowledge it warmly and leave the door open.
- If they say they're not interested, respect it and say something like "No worries at all! If anything changes, feel free to reach out."
- Never pressure or push too hard. Be helpful first.
- Do not use hashtags, emojis, or formal sign-offs.
- Do not mention you are an AI.`;
}

async function sendSMS(contactId, message) {
  try {
    const res = await axios.post(
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
  // Build conversation history
  if (!conversations[contactId]) {
    conversations[contactId] = [];
  }

  conversations[contactId].push({
    role: "user",
    content: incomingMessage,
  });

  // Keep last 10 messages to avoid token bloat
  const history = conversations[contactId].slice(-10);

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 300,
    system: getSystemPrompt(),
    messages: history,
  });

  const reply = response.content[0].text.trim();

  conversations[contactId].push({
    role: "assistant",
    content: reply,
  });

  return reply;
}

// GHL Webhook — fires when a contact replies via SMS
app.post("/webhook/ghl", async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately

  console.log("[WEBHOOK RAW]", JSON.stringify(req.body));

  const contactId = req.body.contactId || req.body.contact_id || req.body.id;
  const contactName = req.body.contactName || req.body.contact_name || req.body.first_name || req.body.name || "Friend";
  const rawMessage = req.body.message;
  const message = (rawMessage && typeof rawMessage === "object" ? rawMessage.body : rawMessage) || req.body.body || req.body.text || req.body.messageBody || req.body.message_body || (req.body.customData && req.body.customData.Message);

  if (!contactId || !message) {
    console.log("[WEBHOOK] Missing contactId or message, skipping. Body:", JSON.stringify(req.body));
    return;
  }

  const lowerMsg = message.toLowerCase().trim();

  // Do not reply to stop/unsubscribe messages
  if (STOP_WORDS.some((word) => lowerMsg.includes(word))) {
    console.log(`[STOP WORD] contactId=${contactId} — not replying.`);
    return;
  }

  console.log(`[INCOMING] ${contactName || contactId}: ${message}`);

  try {
    // Random delay 2-8 seconds to feel natural
    const delay = Math.floor(Math.random() * 6000) + 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const reply = await getAIReply(contactId, contactName, message);
    await sendSMS(contactId, reply);
  } catch (err) {
    console.error("[ERROR]", err.message);
  }
});

// Test endpoint — send a message without GHL
app.post("/test", async (req, res) => {
  const { name, message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const testContactId = "test-" + Date.now();
    const reply = await getAIReply(testContactId, name || "Tester", message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "running", message: "GHL Claude Bot is active" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GHL Claude Bot running on port ${PORT}`);
});
