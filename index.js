import twilio from 'twilio';
import express from 'express';

// Create express app first
const app = express();

// Add request logging middleware BEFORE routes
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Parse JSON bodies BEFORE routes
app.use(express.json());

// Validate environment variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'ULTRAVOX_API_KEY',
  'GHL_API_KEY',
  'GHL_LOCATION_ID'
];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Twilio configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// GHL configuration
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_API_URL = 'https://rest.gohighlevel.com/v1';

// Ultravox configuration
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;

// Determine base URL for webhooks
const getServerBaseUrl = () => {
  if (process.env.SERVER_BASE_URL) {
    return process.env.SERVER_BASE_URL;
  }
  const port = process.env.PORT || 10000;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  return `http://localhost:${port}`;
};

function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  const digits = phoneNumber.toString().trim().replace(/\D/g, '');
  if (digits.startsWith('63')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length >= 11) {
    if (digits.startsWith('1')) {
      return `+${digits}`;
    }
    if (digits.startsWith('63')) {
      return `+${digits}`;
    }
  }
  return null;
}

async function sendSMS(phoneNumber, message) {
  console.log('\n=== SMS Send Attempt ===');
  console.log('Parameters:', { to: phoneNumber, messageLength: message.length, from: TWILIO_PHONE_NUMBER, timestamp: new Date().toISOString() });
  try {
    const formattedNumber = formatPhoneNumber(phoneNumber);
    if (!formattedNumber) {
      throw new Error('Invalid phone number format');
    }
    const clientOptions = { timeout: 30000, keepAlive: false };
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, clientOptions);
    const result = await client.messages.create({ body: message, from: TWILIO_PHONE_NUMBER, to: formattedNumber });
    console.log('SMS sent successfully:', { sid: result.sid, status: result.status, to: result.to });
    return result.sid;
  } catch (error) {
    console.error('Error in sendSMS:', error);
    throw new Error(`SMS send failed: ${error.message}`);
  }
}

// SMS Webhook endpoint
app.post('/api/sms-webhook', async (req, res) => {
  console.log('Webhook request:', req.body, req.query);
  const phoneNumber = req.body.phoneNumber || req.body.recipient || req.query.phoneNumber;
  const message = req.body.message || req.query.message;
  if (!phoneNumber || !message) {
    return res.status(400).json({ error: 'Missing phoneNumber/recipient or message' });
  }
  try {
    const sid = await sendSMS(phoneNumber, message);
    res.json({ success: true, messageSid: sid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GHL helpers
async function findOrCreateContact(phoneNumber) { /* ... */ }
async function addTagToContact(contactId, tag) { /* ... */ }

async function createUltravoxCall(clientName, phoneNumber, userType) {
  const systemPrompt = `### Agent Role
Name: Claire
Context: Voice-based conversation
Current time: ${new Date().toISOString()}
User's name: ${clientName}
User Type: ${userType}

🎤 Claire – VISIBILITY EVENT with Dannella Burnett team

Adaptive VIP Upsell & Congratulatory Script

⸻

🧠 Contextual Setup (for developer use only)
    •   Claire should check metadata or conversation cues to determine if the user has already purchased VIP.
    •   If the user has not not VIP → trigger Upsell Mode
    •   If the user is VIP → trigger Congratulation Mode

⸻

📣 Prompt Start (Universal)

"Hey ${clientName}! This is Claire, Danellas new AI Assistant, from the Visibility Event with Dannella Burnett and the Speakers Need fo Speak Team — I'm your event concierge here to make sure you're set for an incredible experience! Are you excited for the Visibility Event?"

⸻

🔼 If NOT VIP – VIP Upsell Mode

"Looks like you're currently holding a general admission ticket — which is awesome! But I wanted to let you know there's a limited-time flash offer on VIP tickets happening right now."

🎯 Flash Sale Pitch:

"For the next 30 minutes only, you can upgrade to VIP for just $72.75 — that's 25% off the regular upgrade price of $97. And trust me, VIP is where the magic happens. Want me to hook you up right now?"

🎁 VIP Perks Summary:

"As a VIP, you'll get a guaranteed 3-minute speaking spot at Speakapalooza to share your business, practice your message, and generate real leads. "


📲 Action CTA:

"Do you want to hear about who is speaking at the event or can I text you the link right now so you can lock in that discount. Would you like me to go ahead and send it?"

if they want to hear about the speakers -- 

🎙️  Notable Speakers on the Visibility Event with Danella Burnett:

"You'll also be hearing from speakers like Jay Sauder, Imana Guy, and James Lamb. This is your chance to stand out in powerful company."


(If they want the link, use the addContact tool with the following parameters:)
{
  phoneNumber: "${phoneNumber}",
  clientName: "${clientName}"
}

(Then say:)
"Awesome, I've just sent you an email with the link. Just tap it and complete your upgrade before the 30 minutes are up. You're gonna love VIP, and  it's even better when you're saving 25% right?"

⸻

🎉 If is VIP – Congratulation Mode

"First off — congratulations! You've already upgraded to VIP, and that means you're all set for the most high-impact version of Speakapalooza."

✨ Celebrate & Reinforce:

"You've secured your guaranteed 3-minute spotlight, plus you'll get priority coaching and access to the bonus mini-training before the big day. This is going to put you miles ahead."

🎙️ Notable Speakers Reminder:

"You'll also be hearing inspiring speakers like Jay Sauder, Imana Guy, James Lamb, Ann Hessian,  — what a lineup!"

📅 Reminders:

"The full event schedule is on visibilityticket.com, and if you need any help, our live help desk will be open on May 28 from 3 to 6 PM Eastern, and again at 9 AM Eastern on May 29. The event kicks off at 11 AM Eastern on May 30."

💬 Closing:

"If you have any last-minute questions or want help preparing your spotlight message, just reply to this call or message — we've got your back!"

⸻

When the user agrees to receive the VIP link, use the sendSMS tool to send them the upgrade link immediately.
`;

  const baseUrl = getServerBaseUrl();
  const selectedTools = [
    {
      temporaryTool: {
        modelToolName: 'sendSMS',
        description: 'Send an SMS message to the user with the provided content',
        dynamicParameters: [
          { name: 'recipient', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string' }, required: true },
          { name: 'message', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string' }, required: true }
        ],
        client: {
          implementation: async (params) => {
            return await sendSMS(params.recipient, params.message);
          }
        }
      }
    },
    {
      temporaryTool: {
        modelToolName: 'tagUser',
        description: 'Add a tag to the user in GHL',
        dynamicParameters: [
          { name: 'tag', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string' }, required: true }
        ],
        client: {
          implementation: async (params) => {
            const contact = await findOrCreateContact(phoneNumber);
            return await addTagToContact(contact.id, params.tag);
          }
        }
      }
    },
    {
      temporaryTool: {
        modelToolName: 'addContact',
        description: 'Add a contact via external CRM API',
        dynamicParameters: [
          { name: 'clientName', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Name of the client' }, required: true },
          { name: 'phoneNumber', location: 'PARAMETER_LOCATION_BODY', schema: { type: 'string', description: 'Phone number of the client' }, required: true }
        ],
        http: {
          baseUrlPattern: 'https://tag-ghl-danella.onrender.com/api/contacts?clientName={{clientName}}&phoneNumber={{phoneNumber}}',
          httpMethod: 'GET'
        }
      }
    }
  ];

  const config = { agentId: 'YOUR_AGENT_ID', systemPrompt, model: 'fixie-ai/ultravox-70B', voice: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae', temperature: 0.4, firstSpeaker: 'FIRST_SPEAKER_USER', selectedTools };
  const resp = await fetch('https://api.ultravox.ai/api/calls', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': ULTRAVOX_API_KEY }, body: JSON.stringify(config) });
  if (!resp.ok) throw new Error(await resp.text());
  return await resp.json();
}

async function initiateCall(clientName, phoneNumber, userType) {
  const call = await createUltravoxCall(clientName, phoneNumber, userType);
  const twClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return await twClient.calls.create({ twiml: `<Response><Connect><Stream url="${call.joinUrl}"/></Connect></Response>`, to: phoneNumber, from: TWILIO_PHONE_NUMBER });
}

app.post('/initiate-call', async (req, res) => {
  try {
    const { clientName, phoneNumber, userType } = req.body;
    const formatted = formatPhoneNumber(phoneNumber);
    if (!clientName || !formatted) return res.status(400).json({ error: 'Missing parameters' });
    const call = await initiateCall(clientName, formatted, userType || 'non-VIP');
    res.json({ success: true, callSid: call.sid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});N

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
