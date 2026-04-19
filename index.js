const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());

app.post('/tts', async (req, res) => {
  const { message } = req.body;

  if (!message || message.type !== 'voice-request' || !message.text) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const text    = message.text;
  const speaker = message.voiceId || 'dev';

  const detectLang = (t) => {
    if (/[\u0A80-\u0AFF]/.test(t)) return 'gu-IN';
    if (/[\u0A00-\u0A7F]/.test(t)) return 'pa-IN';
    if (/[\u0900-\u097F]/.test(t)) return 'hi-IN';
    return 'en-IN';
  };

  try {
    console.log(`TTS request: "${text.substring(0, 50)}" | speaker: ${speaker} | lang: ${detectLang(text)}`);

    const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech/stream', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        target_language_code: detectLang(text),
        speaker: speaker,
        model: 'bulbul:v3',
        pace: 1.0,
        speech_sample_rate: 16000,
        output_audio_codec: 'linear16',
        enable_preprocessing: true
      })
    });

    console.log(`Sarvam response status: ${sarvamRes.status}`);

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text();
      console.error('Sarvam error body:', errText);
      return res.status(502).json({ 
        error: 'Sarvam TTS failed', 
        status: sarvamRes.status,
        detail: errText 
      });
    }

    res.setHeader('Content-Type', 'audio/raw');
    res.setHeader('X-Sample-Rate', '16000');
    res.setHeader('X-Channels', '1');
    res.setHeader('X-Bit-Depth', '16');

    sarvamRes.body.pipe(res);

  } catch (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal proxy error',
        detail: err.message
      });
    }
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Sarvam TTS proxy running on port', process.env.PORT || 3000);
});
