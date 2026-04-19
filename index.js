const express = require('express');
const app = express();
app.use(express.json());

app.post('/tts', async (req, res) => {
  const { message } = req.body;

  // Validate Vapi's request format
  if (!message || message.type !== 'voice-request' || !message.text) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const text    = message.text;
  const speaker = message.voiceId || 'dev'; // "dev" comes from Vapi Voice ID field

  // Detect language from Unicode script blocks
  const detectLang = (t) => {
    if (/[\u0A80-\u0AFF]/.test(t)) return 'gu-IN'; // Gujarati script
    if (/[\u0A00-\u0A7F]/.test(t)) return 'pa-IN'; // Gurmukhi (Punjabi)
    if (/[\u0900-\u097F]/.test(t)) return 'hi-IN'; // Devanagari (Hindi)
    return 'en-IN';                                 // Default English
  };

  try {
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
        speech_sample_rate: 16000,      // Vapi requires 16000 Hz
        output_audio_codec: 'linear16', // 'linear16' = PCM — what Vapi requires
                                        // NOT 'pcm' — that's the wrong value per Sarvam docs
        enable_preprocessing: true
      })
    });

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text();
      console.error('Sarvam error:', sarvamRes.status, errText);
      return res.status(502).json({ error: 'Sarvam TTS failed', detail: errText });
    }

    // Vapi requires these exact response headers for PCM audio
    res.setHeader('Content-Type', 'audio/raw');
    res.setHeader('X-Sample-Rate', '16000');
    res.setHeader('X-Channels', '1');
    res.setHeader('X-Bit-Depth', '16');

    // Pipe raw binary stream directly — no buffering, no base64 decoding needed
    // Sarvam HTTP stream returns raw binary, not JSON/base64 like the REST endpoint
    sarvamRes.body.pipe(res);

  } catch (err) {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal proxy error' });
    }
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Sarvam TTS proxy running on port', process.env.PORT || 3000);
});