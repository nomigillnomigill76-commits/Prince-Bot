const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MEXC Credentials
const apiKey = process.env.MEXC_API_KEY;
const secretKey = process.env.MEXC_SECRET_KEY;
const baseUrl = 'https://contract.mexc.com'; // Futures Endpoint

// Global variables to store the latest signal details temporarily
let latestSignal = null;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE TO CONNECT WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Bot is successfully activated!');
});

// Helper function to sign MEXC API requests
function signRequest(params, secret) {
    return CryptoJS.HmacSHA256(params, secret).toString(CryptoJS.enc.Hex);
}

// MEXC Order Executor (Configured for USOIL Futures)
async function executeMexcOrder(symbol, side, openType) {
    try {
        const timestamp = Date.now();
       
        // Force symbol to MEXC Crude Oil Futures format (USOIL_USDT)
        const mexcSymbol = "USOIL_USDT";
       
        let contractPath = '/api/v1/contract/order/submit';
       
        // 1 = Open Long/Short, 2 = Close Long/Short
        let type = openType === 1 ? (side === 'BUY' ? 1 : 2) : (side === 'BUY' ? 3 : 4);
       
        let bodyParams = {
            symbol: mexcSymbol,
            price: 0, // 0 means Market Price Order (????? ?????? ?? ???)
            vol: 1,   // 1 Contract (???????? ?? ??? ??????? ????)
            leverage: 200, // 200x Leverage
            side: type,
            type: 5, // 5 = Market Order
            openType: 1 // 1 = Isolated Margin
        };

        const jsonStr = JSON.stringify(bodyParams);
        const signStr = `${timestamp}${jsonStr}`;
        const signature = signRequest(signStr, secretKey);

        const response = await axios.post(`${baseUrl}${contractPath}`, bodyParams, {
            headers: {
                'ApiKey': apiKey,
                'Request-Time': timestamp,
                'Signature': signature,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.code === 0) {
            return { success: true, data: response.data };
        } else {
            return { success: false, error: response.data.msg || 'MEXC error' };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Receive Signal from TradingView
app.post('/webhook', async (req, res) => {
    const payload = req.body;
    console.log("New Signal Received:", payload);

    // Default to USOIL if symbol not sent properly
    latestSignal = {
        symbol: "USOIL_USDT",
        action: payload.action ? payload.action.toUpperCase() : 'BUY',
        price: payload.price || 'Market Price'
    };

    const targetNumber = process.env.WHATSAPP_NUMBER + "@c.us";
   
    const messageText = `*?? OIL TRADING ALERT (USOIL) ??*\n\n` +
                        `??? *Symbol:* ${latestSignal.symbol}\n` +
                        `? *Action:* ${latestSignal.action}\n` +
                        `?? *Price:* ${latestSignal.price}\n\n` +
                        `?? *Reply "1"* to OPEN Oil Trade ($1 Margin, 200x)\n` +
                        `?? *Reply "2"* to CLOSE Oil Position`;

    try {
        await client.sendMessage(targetNumber, messageText);
        res.status(200).send({ status: 'Success', message: 'Oil alert sent to WhatsApp.' });
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).send({ status: 'Error', error: error.message });
    }
});

// Handle User Replied Commands (1 or 2)
client.on('message', async (msg) => {
    const targetNumber = process.env.WHATSAPP_NUMBER + "@c.us";
   
    if (msg.from !== targetNumber) return;

    const replyText = msg.body.trim();

    if (replyText === '1') {
        if (!latestSignal) {
            await msg.reply("? ??? ?????? ??? ?????? ???? ???? ?????");
            return;
        }
        await msg.reply(`? MEXC ?? USOIL ?? *${latestSignal.action}* ????? (200x) ????? ?? ??? ??...`);
       
        const result = await executeMexcOrder(latestSignal.symbol, latestSignal.action, 1);
        if (result.success) {
            await msg.reply(`? *Oil Trade Success!* MEXC ?? USOIL ?? ????? ??? ?? ?? ???`);
        } else {
            await msg.reply(`? *Order Failed!* ???: ${result.error}`);
        }
    }
    else if (replyText === '2') {
        if (!latestSignal) {
            await msg.reply("? ??? ?????? ??? ?????? ???? ???? ?????");
            return;
        }
        await msg.reply(`? MEXC ?? USOIL ?? ?????? ????? ?? ?? ??? ??...`);
       
        const result = await executeMexcOrder(latestSignal.symbol, latestSignal.action, 2);
        if (result.success) {
            await msg.reply(`? *Position Closed!* MEXC ?? ??? ?? ????? ??????????? ??? ?? ?? ?? ???`);
        } else {
            await msg.reply(`? *Close Failed!* ???: ${result.error}`);
        }
    }
});

client.initialize();
app.listen(PORT, () => console.log(`Oil Trading Server is running on port ${PORT}...`));

 
