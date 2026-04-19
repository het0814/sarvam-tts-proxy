const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());

const detectLang = (t, hint) => {
  // Priority 1: language hint from request
  if (hint) {
    const hintMap = {
      'hi': 'hi-IN', 'hi-IN': 'hi-IN', 'hindi': 'hi-IN',
      'gu': 'gu-IN', 'gu-IN': 'gu-IN', 'gujarati': 'gu-IN',
      'pa': 'pa-IN', 'pa-IN': 'pa-IN', 'punjabi': 'pa-IN',
      'en': 'en-IN', 'en-IN': 'en-IN', 'english': 'en-IN',
    };
    if (hintMap[hint.toLowerCase()]) return hintMap[hint.toLowerCase()];
  }

  // Priority 2: Unicode script detection
  if (/[\u0A80-\u0AFF]/.test(t)) return 'gu-IN';
  if (/[\u0A00-\u0A7F]/.test(t)) return 'pa-IN';
  if (/[\u0900-\u097F]/.test(t)) return 'hi-IN';

  // Priority 3: Romanized keyword detection
  const gujaratiWords = /\b(chhe|tame|kem|shu|tamaro|ane|joie|apo|lejo|thi)\b/i;
  const punjabiWords  = /\b(tussi|tenu|saanu|chahida|lagda|kithey|kiven)\b/i;
  const hindiWords    = /\b(hai|hain|kya|mujhe|chahiye|nahi|theek|accha|bilkul|shukriya|namaste)\b/i;

  if (gujaratiWords.test(t)) return 'gu-IN';
  if (punjabiWords.test(t))  return 'pa-IN';
  if (hindiWords.test(t))    return 'hi-IN';

  return 'en-IN';
};

app.post('/tts', async (req, res) => {
  const { message } = req.body;

  if (!message || message.type !== 'voice-request' || !message.text) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const text    = message.text;
  const speaker = message.voiceId || 'dev';
  const hint    = message.language || null;
  const lang    = detectLang(text, hint);

  try {
    console.log(`TTS → text: "${text.substring(0, 60)}" | lang: ${lang} | speaker: ${speaker}`);

    const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech/stream', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text:                 text,
        target_language_code: lang,
        speaker:              speaker,
        model:                'bulbul:v3',
        pace:                 1.0,
        speech_sample_rate:   16000,
        output_audio_codec:   'linear16',
        enable_preprocessing: true
      })
    });

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text();
      console.error('Sarvam error:', sarvamRes.status, errText);
      return res.status(502).json({ error: 'Sarvam TTS failed', detail: errText });
    }

    res.setHeader('Content-Type', 'audio/raw');
    res.setHeader('X-Sample-Rate', '16000');
    res.setHeader('X-Channels', '1');
    res.setHeader('X-Bit-Depth', '16');

    sarvamRes.body.pipe(res);

  } catch (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal proxy error', detail: err.message });
    }
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Sarvam TTS proxy running on port', process.env.PORT || 3000);
});
