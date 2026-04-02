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
         36 +    // Step 1: Find the conversation for this contact                                                                                                                           
      37 +    const searchRes = await axios.get(                                                                                                                                          
      38 +      `https://services.leadconnectorhq.com/conversations/search?contactId=${contactId}`,                                                                                       
      39 +      {                                                                                                                                                                         
      40 +        headers: {                                                                                                                                                              
      41 +          Authorization: `Bearer ${process.env.GHL_API_KEY}`,                                                                                                                   
      42 +          "Content-Type": "application/json",                                                                                                                                   
      43 +          Version: "2021-04-15",                                                                                                                                                
      44 +        },                                                                                                                                                                      
      45 +      }                                                                                                                                                                         
      46 +    );                                                                                                                                                                          
      47 +                                                                                                                                                                                
      48 +    const conversations = searchRes.data.conversations;                                                                                                                         
      49 +    if (!conversations || conversations.length === 0) {                                                                                                                         
      50 +      console.error("[SMS ERROR] No conversation found for contactId:", contactId);                                                                                             
      51 +      return;                                                                                                                                                                   
      52 +    }                                                                                                                                                                           
      53 +                                                                                                                                                                                
      54 +    const conversationId = conversations[0].id;                                                                                                                                 
      55 +                                                                                                                                                                                
      56 +    // Step 2: Send SMS to that conversation                                                                                                                                    
      57      await axios.post(
      58        "https://services.leadconnectorhq.com/conversations/messages",
      59        {
      60          type: "SMS",
      40 -        contactId: contactId,                                                                                                                                                   
      61 +        conversationId: conversationId,                                                                                                                                         
      62          message: message,
      63        },
      64        {
     ...
      71      );
      72      console.log(`[SMS SENT] contactId=${contactId} | message=${message}`);
      73    } catch (err) {
      53 -    console.error("[SMS ERROR]", err.response?.data || err.message);                                                                                                            
      74 +    console.error("[SMS ERROR] Status:", err.response?.status);                                                                                                                 
      75 +    console.error("[SMS ERROR] Data:", JSON.stringify(err.response?.data));                                                                                                     
      76 +    console.error("[SMS ERROR] Message:", err.message);                                                                                                                         
      77    }
      78  }
      79  


    conversations[contactId].push({
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

  app.get("/", (req, res) => {
    res.json({ status: "running", message: "GHL Claude Bot is active" });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`GHL Claude Bot running on port ${PORT}`);
  });
