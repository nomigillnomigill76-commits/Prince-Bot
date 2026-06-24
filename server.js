const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const CryptoJS = require('crypto-js');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MEXC Credentials
const apiKey = process.env.MEXC_API_KEY;
const secretKey = process.env.MEXC_SECRET_KEY;
const baseUrl = 'https://contract.mexc.com';

let latestSignal = null;

// Bot Configuration
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "prince-bot-session" }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('--- SCAN THIS LINK FOR QR CODE ---');
    console.log('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr));
});

client.on('ready', () => {
    console.log('WhatsApp Bot is successfully activated!');
});

// Keep-Alive Function to prevent Render from sleeping
setInterval(() => {
    console.log("Keep-Alive: Bot is active...");
}, 300000);

function signRequest(params, secret) {
    return CryptoJS.HmacSHA256(params, secret).toString(CryptoJS.enc.Hex);
}

async function executeMexcOrder(symbol, side, openType) {
    try {
        const timestamp = Date.now();
        const mexcSymbol = "USOIL_USDT";
        let contractPath = '/api/v1/contract/order/submit';
      
        let type = openType === 1 ? (side === 'BUY' ? 1 : 2) : (side === 'BUY' ? 3 : 4);
      
        let bodyParams = {
            symbol: mexcSymbol,
            price: 0,
            vol: 1,
            leverage: 200,
            side: type,
            type: 5,
            openType: 1
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

app.post('/webhook', async (req, res) => {
    const payload = req.body;
    console.log("New Signal Received:", payload);

    latestSignal = {
        symbol: "USOIL_USDT",
        action: payload.action ? payload.action.toUpperCase() : 'BUY',
        price: payload.price || 'Market Price'
    };

    const targetNumber = process.env.WHATSAPP_NUMBER + "@c.us";
  
    const messageText = `*🚨 OIL TRADING ALERT (USOIL) 🚨*\n\n` +
                        `🛢️ *Symbol:* ${latestSignal.symbol}\n` +
                        `⚡ *Action:* ${latestSignal.action}\n` +
                        `💵 *Price:* ${latestSignal.price}\n\n` +
                        `👉 *Reply "1"* to OPEN Oil Trade\n` +
                        `👉 *Reply "2"* to CLOSE Oil Position`;

    try {
        await client.sendMessage(targetNumber, messageText);
        res.status(200).send({ status: 'Success', message: 'Alert sent.' });
    } catch (error) {
        res.status(500).send({ status: 'Error', error: error.message });
    }
});

client.on('message', async (msg) => {
    const targetNumber = process.env.WHATSAPP_NUMBER + "@c.us";
    if (msg.from !== targetNumber) return;

    const replyText = msg.body.trim();

    if (replyText === '1') {
        if (!latestSignal) {
            await msg.reply("❌ No active signal found.");
            return;
        }
        await msg.reply(`⏳ Opening ${latestSignal.action} order on MEXC (200x)...`);
        const result = await executeMexcOrder(latestSignal.symbol, latestSignal.action, 1);
        await msg.reply(result.success ? "✅ Trade opened successfully!" : `❌ Failed: ${result.error}`);
    }
    else if (replyText === '2') {
        if (!latestSignal) {
            await msg.reply("❌ No active position found.");
            return;
        }
        await msg.reply(`⏳ Closing position on MEXC...`);
        const result = await executeMexcOrder(latestSignal.symbol, latestSignal.action, 2);
        await msg.reply(result.success ? "✅ Position closed successfully!" : `❌ Failed: ${result.error}`);
    }
});

client.initialize();
app.listen(PORT, () => console.log(`Server running on port ${PORT}...`));

 
