const express = require('express');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// API Credentials
const apiKey = "mx0vglqRy0IVPDxL6V";
const secretKey = "3771092327b14900869de2a8d2007126 ";
const baseUrl = 'https://contract.mexc.com';

function signRequest(params, secret) {
    return CryptoJS.HmacSHA256(params, secret).toString(CryptoJS.enc.Hex);
}

async function executeMexcOrder(side, orderType) {
    try {
        const timestamp = Date.now();
        const mexcSymbol = "USOIL_USDT";
        const contractPath = '/api/v1/contract/order/submit';
       
        // 1 = Open, 2 = Close
        let type = orderType === 1 ? (side === 'BUY' ? 1 : 2) : (side === 'BUY' ? 3 : 4);
     
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
        return { success: response.data.code === 0, data: response.data };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

app.post('/webhook', async (req, res) => {
    const payload = req.body;
    if (!payload.action) return res.status(400).send("No action found");

    let orderType = (payload.action === 'BUY' || payload.action === 'SELL') ? 1 : 2;
    let side = payload.action.replace('CLOSE ', '');

    const result = await executeMexcOrder(side, orderType);
    res.status(result.success ? 200 : 500).send(result);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

 
