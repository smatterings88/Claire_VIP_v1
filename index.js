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

// Instantiate Twilio client once for reuse
tconst twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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
    
    // Fallback to localhost
    return `http://localhost:${port}`;
};

// Phone number formatter\ nfunction formatPhoneNumber(phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length === 10) {
        return `+1${digits}`;
    }
    if (digits.length >= 11) {
        return `+${digits}`;
    }
    return null;
}

// New function to send SMS via Twilio
async function sendSMS(phoneNumber, message) {
    // Guard against overly long SMS
    if (message.length > 1600) {
        throw new Error('Message exceeds 1600 character SMS limit');
    }

    // Format & validate number
    const formattedNumber = formatPhoneNumber(phoneNumber);
    if (!formattedNumber) {
        throw new Error('Invalid phone number format');
    }

    try {
        const smsResult = await twilioClient.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: formattedNumber
        });

        console.log(`SMS sent successfully. SID: ${smsResult.sid}`);
        return smsResult.sid;
    } catch (error) {
        // Handle Twilio-specific errors
        if (error.code === 21211) {
            console.error('Invalid "to" phone number:', formattedNumber);
        }
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
    // ... existing createUltravoxCall implementation unchanged ...
}

async function initiateCall(clientName, phoneNumber, userType) {
    // ... existing initiateCall implementation unchanged ...
}

// New endpoint to send SMS directly
app.post('/send-sms', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        if (!phoneNumber || !message) {
            return res.status(400).json({ error: 'Missing required parameters: phoneNumber and message' });
        }
        const messageSid = await sendSMS(phoneNumber, message);
        res.json({ success: true, message: 'SMS sent successfully', messageSid });
    } catch (error) {
        console.error('Error sending SMS:', error);
        res.status(500).json({ error: 'Failed to send SMS', message: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Initiate-call routes
app.route('/initiate-call')
   .get(handleCall)
   .post(handleCall);

async function handleCall(req, res) {
    try {
        const clientName = req.query.clientName || req.body.clientName;
        const phoneNumber = req.query.phoneNumber || req.body.phoneNumber;
        const userType   = req.query.userType   || req.body.userType || 'non-VIP';

        if (!clientName || !phoneNumber) {
            return res.status(400).json({ error: 'Missing required parameters: clientName and phoneNumber' });
        }
        const formattedNumber = formatPhoneNumber(phoneNumber);
        if (!formattedNumber) {
            return res.status(400).json({ error: 'Invalid phone number format.' });
        }
        const callSid = await initiateCall(clientName, formattedNumber, userType);
        res.json({ success: true, message: 'Call initiated successfully', callSid });
    } catch (error) {
        console.error('Error in handleCall:', error);
        res.status(500).json({ error: 'Failed to initiate call', message: error.message });
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
