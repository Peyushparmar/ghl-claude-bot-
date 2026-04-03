// Run this ONCE to set up Supabase table and upload conversation examples
// Usage: node setup-db.js

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const conversations = [
  {
    summary: "Loan officer asks if it is paid leads, gets qualified, books a call",
    exchange: `Patrick: Hey Brian it's Patrick. I know it's random...lol. But I was looking at your profile & thought to drop a text. I can bring you 30 more borrowers every month for FHA/VA/Conventional loans... Are you available to meet sometime this week?
Brian: hi, whats the catch? Is it like a paid leads option?
Patrick: Hey Brian, we don't sell leads at all, we have an automated AI system which gets you these borrowers directly depending on the states you're licensed in and type of the loans you do. Just curious how many states are you licensed in?
Brian: all 50, I work for a bank. All types, conventional fha VA but certainly can use more.
Patrick: Awesome! How about we hop on a quick 15 mins zoom call where I can give you a demo of how this system works? Does 10AM Friday work for you?
Brian: sure, how about 11? have a meeting at 10 on friday.
Patrick: We can do 11 on Friday. What's your email address? I'll send you a meeting invite right away. Also would want to know what type of loans do you majorly do?
Brian: brian.ficarra@usbank.com, conventional is the major one, mostly California purchases.
Patrick: Perfect! Sent you a meeting invite link, you can accept that and I will see you on Friday.`,
    outcome: "booked"
  },
  {
    summary: "Loan officer asks if selling leads, only licensed in CA",
    exchange: `Patrick: Hey Sandra it's Patrick. I know it's random...lol. But I was looking at your profile & thought to drop a text. I can bring you 30 more borrowers every month for FHA/VA/Conventional loans... Are you available to meet sometime this week?
Sandra: Hi. Are you selling leads?
Patrick: Hey Sandra, we don't sell leads at all. We have an automated AI system which gets you these borrowers directly depending on the states you're licensed in and the type of loan you do. Just curious how many states are you licensed in?
Sandra: Just CA.
Patrick: And what kind of loans do you normally do?`,
    outcome: "qualifying"
  },
  {
    summary: "Loan officer asks what company Patrick is with",
    exchange: `Patrick: Hey Danica it's Patrick. I know it's random...lol. But I was looking at your profile & thought to drop a text. I can bring you 30 more borrowers every month for FHA/VA/Conventional loans... Are you available to meet sometime this week?
Danica: What company are you with?
Patrick: Hey I run a company called HEADDMEDIA.`,
    outcome: "qualifying"
  },
  {
    summary: "Loan officer refuses to meet, just wants leads sent directly",
    exchange: `Patrick: Hey Guy it's Patrick. I know it's random...lol. But I was looking at your profile & thought to drop a text. I can bring you 30 more borrowers every month for FHA/VA/Conventional loans... Are you available to meet sometime this week?
Guy: Meet?
Patrick: We can do a quick Google meet where I can give you a demo of our system as well.
Guy: No need to meet man just send the leads.
Patrick: Hey we don't sell leads at all. We have an automated AI system which gets you appointments directly booked.`,
    outcome: "objection-no-meeting"
  },
  {
    summary: "Loan officer is immediately open and gives availability and email",
    exchange: `Patrick: Hey Joe it's Patrick. I know it's random...lol. But I was looking at your profile & thought to drop a text. I can bring you 30 more borrowers every month for FHA/VA/Conventional loans... Are you available to meet sometime this week?
Joe: Lets hear what you have. I am available Friday 1pm EST. Joe.vultaggio@cardinalfinancial.com
Patrick: Hey Joe, Friday morning is pretty booked. Let me know if Thursday works for you, or Friday 4pm EST?`,
    outcome: "scheduling"
  }
];

async function setup() {
  console.log("Setting up Supabase table...");

  // Create the table using SQL via Supabase
  const { error: tableError } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_examples (
        id SERIAL PRIMARY KEY,
        summary TEXT NOT NULL,
        exchange TEXT NOT NULL,
        outcome TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_conv_fts
        ON conversation_examples
        USING GIN(to_tsvector('english', exchange || ' ' || summary));
    `
  });

  if (tableError) {
    console.log("Note:", tableError.message);
    console.log("If table already exists, that is fine. Continuing...");
  }

  console.log(`Uploading ${conversations.length} conversations...`);

  for (const convo of conversations) {
    const { error } = await supabase.from("conversation_examples").insert({
      summary: convo.summary,
      exchange: convo.exchange,
      outcome: convo.outcome,
    });

    if (error) {
      console.error("Error inserting:", convo.summary, "->", error.message);
    } else {
      console.log("Uploaded:", convo.summary);
    }
  }

  console.log("Done! Knowledge base is ready.");
}

setup().catch(console.error);
