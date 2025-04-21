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
  'ULTRAVOX_API_KEY'
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

// Ultravox configuration
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;

// Determine base URL for webhooks
const getServerBaseUrl = () => {
    if (process.env.SERVER_BASE_URL) {
        return process.env.SERVER_BASE_URL;
    }
    
    // For local development
    const port = process.env.PORT || 10000;
    
    // If running in a cloud environment, try to detect the public URL
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    
    // Fallback to localhost (note: this won't work for production as Ultravox needs a public URL)
    return `http://localhost:${port}`;
};

function formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // For US numbers (assuming US if no country code provided)
    if (digits.length === 10) {
        return `+1${digits}`;
    }
    
    // If number already includes country code (11+ digits)
    if (digits.length >= 11) {
        return `+${digits}`;
    }
    
    return null;
}

// New function to send SMS via Twilio
async function sendSMS(phoneNumber, message) {
    try {
        const formattedNumber = formatPhoneNumber(phoneNumber);
        if (!formattedNumber) {
            throw new Error('Invalid phone number format');
        }

        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const smsResult = await client.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: formattedNumber
        });

        console.log(`SMS sent successfully. SID: ${smsResult.sid}`);
        return smsResult.sid;
    } catch (error) {
        console.error('Error sending SMS:', error);
        throw error;
    }
}

// Create a webhook endpoint for the SMS tool to call
app.post('/api/sms-webhook', async (req, res) => {
    try {
        const { recipient, message } = req.body;
        
        if (!recipient || !message) {
            return res.status(400).json({
                success: false,
                error: 'Missing recipient or message'
            });
        }
        
        try {
            const messageSid = await sendSMS(recipient, message);
            
            res.json({
                success: true,
                messageSid,
                message: 'SMS sent successfully'
            });
        } catch (smsError) {
            console.error('Error sending SMS in webhook:', smsError);
            res.status(500).json({
                success: false,
                error: `SMS send failed: ${smsError.message}`
            });
        }
    } catch (error) {
        console.error('Error in SMS webhook:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

async function createUltravoxCall(clientName, phoneNumber, userType) {
    const systemPrompt = `
## Agent Role
  - Name: Claire
  - Context: Voice-based conversation
  - Current time: ${new Date().toISOString()}
  - User's name: ${clientName}
  - User Type: ${userType}
  - User's phone number: ${phoneNumber}


🎤 Claire – Speakapalooza Voice Agent Prompt (v1.1)

Adaptive VIP Upsell & Congratulatory Script

⸻

🧠 Contextual Setup (for developer use only)
	•	Claire should check metadata or conversation cues to determine if the user has already purchased VIP.
	•	If the user has not not VIP → trigger Upsell Mode
	•	If the user is VIP → trigger Congratulation Mode

⸻

📣 Prompt Start (Universal)

"Hey there! This is Claire from the Speakapalooza team — I'm your event concierge here to make sure you're set for an incredible experience!"

⸻

🔼 If NOT VIP – VIP Upsell Mode

"Looks like you're currently holding a general admission ticket — which is awesome! But I wanted to let you know there's a limited-time flash offer on VIP tickets happening right now."

🎯 Flash Sale Pitch:

"For the next 30 minutes only, you can upgrade to VIP for just $75 — that's 25% off the regular upgrade price of $100. And trust me, VIP is where the magic happens."

🎁 VIP Perks Summary:

"As a VIP, you'll get a guaranteed 3-minute speaking spot at Speakapalooza to share your business, practice your message, and generate real leads. Plus, you'll receive priority coaching access and exclusive pre-event training to help you shine."

🎙️ Notable Speakers:

"You'll also be sharing the virtual stage with incredible speakers like Jay Souter, Imana Guy, James Lamb, Jason Hinke, Suzanne Evans, Ann Hessian, and Penelope Smith. This is your chance to stand out in powerful company."

📲 Action CTA:

"I can text you the link right now so you can lock in that discount. Would you like me to go ahead and send it?"

(If yes, use the sendSMS tool to send the following message:)
"Hi ${clientName}! Here's your exclusive VIP upgrade link for Speakapalooza: https://visibilityticket.com/vip-upgrade?promo=FLASH25 (Valid for 30 minutes) - Claire"

(Then say:)
"Awesome, I've just sent the link to your phone. Just tap it and complete your upgrade before the 30 minutes are up."

⸻

🎉 If is VIP – Congratulation Mode

"First off — congratulations! You've already upgraded to VIP, and that means you're all set for the most high-impact version of Speakapalooza."

✨ Celebrate & Reinforce:

"You've secured your guaranteed 3-minute spotlight, plus you'll get priority coaching and access to the bonus mini-training before the big day. This is going to put you miles ahead."

🎙️ Notable Speakers Reminder:

"You'll also be featured alongside inspiring speakers like Jay Souter, Imana Guy, James Lamb, Jason Hinke, Suzanne Evans, Ann Hessian, and Penelope Smith — what a lineup!"

📅 Reminders:

"The full event schedule is on visibilityticket.com, and if you need any help, our live help desk will be open on May 28 from 3 to 6 PM Eastern, and again at 9 AM Eastern on May 29. The event kicks off at 11 AM Eastern on May 30."

💬 Closing:

"If you have any last-minute questions or want help preparing your spotlight message, just reply to this call or message — we've got your back!"

⸻

When the user agrees to receive the VIP link, use the sendSMS tool to send them the upgrade link immediately.
`;

    // Get server base URL
    const baseUrl = getServerBaseUrl();
    
    // Define SMS tool according to the Ultravox API specification
    const smsTool = {
        "modelToolName": "sendSMS",
        "description": "Send an SMS message to the user with the provided content",
        "dynamicParameters": [
            {
                "name": "message",
                "location": "PARAMETER_LOCATION_JSON_BODY",
                "schema": {
                    "type": "string",
                    "description": "The SMS message text to send to the user"
                },
                "required": true
            }
        ],
        "http": {
            "baseUrlPattern": `${baseUrl}/api/sms-webhook`,
            "httpMethod": "POST",
            "bodyTemplate": {
                "recipient": phoneNumber,
                "message": "${message}"
            }
        }
    };
    
    const ULTRAVOX_CALL_CONFIG = {
        systemPrompt: systemPrompt,
        model: 'fixie-ai/ultravox',
        voice: 'b0e6b5c1-3100-44d5-8578-9015aa3023ae',
        temperature: 0.3,
        firstSpeaker: "FIRST_SPEAKER_USER",
        medium: { "twilio": {} },
        selectedTools: [smsTool]  // Use selectedTools instead of temporaryTool
    };

    try {
        console.log(`Creating Ultravox call with webhook URL: ${baseUrl}/api/sms-webhook`);
        
        const response = await fetch('https://api.ultravox.ai/api/calls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY
            },
            body: JSON.stringify(ULTRAVOX_CALL_CONFIG)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ultravox API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating Ultravox call:', error);
        throw error;
    }
}

async function initiateCall(clientName, phoneNumber, userType) {
    try {
        console.log(`Creating Ultravox call for ${clientName} (${userType}) at ${phoneNumber}...`);
        
        const ultravoxCall = await createUltravoxCall(clientName, phoneNumber, userType);
        const { joinUrl } = ultravoxCall;
        console.log('Got joinUrl:', joinUrl);

        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const call = await client.calls.create({
            twiml: `<Response><Connect><Stream url="${joinUrl}"/></Connect></Response>`,
            to: phoneNumber,
            from: TWILIO_PHONE_NUMBER
        });

        console.log('Call initiated:', call.sid);
        return call.sid;
    } catch (error) {
        console.error('Error initiating call:', error);
        throw error;
    }
}

// New endpoint to send SMS directly
app.post('/send-sms', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        
        if (!phoneNumber || !message) {
            return res.status(400).json({ 
                error: 'Missing required parameters: phoneNumber and message' 
            });
        }

        const messageSid = await sendSMS(phoneNumber, message);
        res.json({ 
            success: true, 
            message: 'SMS sent successfully',
            messageSid 
        });
    } catch (error) {
        console.error('Error sending SMS:', error);
        res.status(500).json({ 
            error: 'Failed to send SMS',
            message: error.message 
        });
    }
});

// Add basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Handle both GET and POST requests
app.route('/initiate-call')
    .get(handleCall)
    .post(handleCall);

async function handleCall(req, res) {
    try {
        const clientName = req.query.clientName || req.body.clientName;
        const phoneNumber = req.query.phoneNumber || req.body.phoneNumber;
        const userType = req.query.userType || req.body.userType || 'non-VIP';
        
        if (!clientName || !phoneNumber) {
            return res.status(400).json({ 
                error: 'Missing required parameters: clientName and phoneNumber' 
            });
        }

        // Format and validate phone number
        const formattedNumber = formatPhoneNumber(phoneNumber);
        if (!formattedNumber) {
            return res.status(400).json({
                error: 'Invalid phone number format. Please provide a valid phone number (e.g., 1234567890 or +1234567890)'
            });
        }

        const callSid = await initiateCall(clientName, formattedNumber, userType);
        res.json({ 
            success: true, 
            message: 'Call initiated successfully',
            callSid 
        });
    } catch (error) {
        console.error('Error in handleCall:', error);
        res.status(500).json({ 
            error: 'Failed to initiate call',
            message: error.message 
        });
    }
}

const PORT = process.env.PORT || 10000;

// Wrap server startup in a try-catch block
try {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
} catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
}
