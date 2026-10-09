const express = require('express');
const fs = require('fs');
const path = require('path');
const { rateLimit } = require('express-rate-limit');

const envPath = path.join(__dirname, '.env');
if (process.env.NODE_ENV !== 'production' && fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const qaDatasetPath = path.join(__dirname, 'data', 'turkce_ai_soru_cevap_3000.json');
const qaDataset = JSON.parse(fs.readFileSync(qaDatasetPath, 'utf8'));
const ignoredQuestionWords = new Set([
  'acaba', 'ama', 'bir', 'biri', 'bu', 'da', 'daha', 'de', 'diye', 'icin', 'ile',
  'mi', 'mı', 'mu', 'mü', 'ne', 'neden', 'niye', 'o', 'olarak', 'olan', 've',
  'ya', 'yani', 'yap', 'yapar', 'yapabilir', 'yapabilirim', 'yapmam', 'yapmak',
]);

function normalizeQuestion(value) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const qaExamples = qaDataset.records.flatMap((record) =>
  (record.examples || []).map((example) => {
    const normalized = normalizeQuestion(example);
    const tokens = new Set(normalized.split(' ').filter((token) =>
      token.length > 1 && !ignoredQuestionWords.has(token)
    ));

    return {
      normalized,
      tokens,
      category: record.category || 'Genel',
      responses: [...new Set((record.responses || []).filter(Boolean))],
    };
  })
).filter((entry) => entry.normalized && entry.responses.length);

function findAnswer(question) {
  const normalizedQuestion = normalizeQuestion(question);
  const questionTokens = new Set(normalizedQuestion.split(' ').filter((token) =>
    token.length > 1 && !ignoredQuestionWords.has(token)
  ));

  if (!normalizedQuestion || !questionTokens.size) return null;

  let bestMatch = null;
  for (const entry of qaExamples) {
    let score = 0;
    if (normalizedQuestion === entry.normalized) {
      score = 1;
    } else if (entry.normalized.length >= 5 && normalizedQuestion.includes(entry.normalized)) {
      score = 0.92;
    } else {
      let overlap = 0;
      for (const token of questionTokens) {
        if (entry.tokens.has(token)) overlap += 1;
      }
      if (overlap) {
        const dice = (2 * overlap) / (questionTokens.size + entry.tokens.size);
        const questionCoverage = overlap / questionTokens.size;
        score = 0.65 * dice + 0.35 * questionCoverage;
      }
    }

    if (!bestMatch || score > bestMatch.score) bestMatch = { ...entry, score };
    if (score === 1) break;
  }

  if (!bestMatch || bestMatch.score < 0.28) return null;
  return {
    category: bestMatch.category,
    reply: bestMatch.responses[Math.floor(Math.random() * bestMatch.responses.length)],
  };
}

const app = express();
const port = process.env.PORT || 3000;
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const speechLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 24,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Sesli yanıt sınırına ulaşıldı. Biraz bekleyip tekrar dene.' },
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Sunucu çalışıyor.',
    aiConfigured: qaExamples.length > 0,
    speechConfigured: Boolean(process.env.GEMINI_API_KEY),
    qaRecords: qaDataset.records.length,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/chat', (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 1200) : '';
  if (!question) return res.status(400).json({ error: 'Bir soru yazmalısın.' });

  const match = findAnswer(question);
  if (!match) {
    return res.json({
      matched: false,
      reply: 'Bu soru için veri setimde bir yanıt bulamadım. Başka kelimelerle sorabilir misin?',
    });
  }

  return res.json({ matched: true, category: match.category, reply: match.reply });
});

app.post('/api/speech', speechLimiter, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Çevrimiçi ses için Google AI Studio anahtarını GEMINI_API_KEY olarak ekle.',
      code: 'AI_NOT_CONFIGURED',
    });
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1200) : '';
  if (!text) return res.status(400).json({ error: 'Seslendirilecek metin gerekli.' });

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Akıcı Türkçe konuşan, ince, genç ve parlak anime tarzı kadın sesiyle oku. Tonu sevecen ve enerjik tut; tiz ama net olsun, yapay ve bağırır gibi olmasın. Metin: ${text}` }],
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } },
        },
      }),
    });

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : upstream.status === 400 || upstream.status === 403 ? 503 : 502;
      const error = upstream.status === 429
        ? 'Gemini ses servisi yoğun veya kota sınırına ulaşıldı. Biraz sonra tekrar dene.'
        : upstream.status === 400 || upstream.status === 403
          ? 'Gemini TTS modelini ve API anahtarını AI Studio’da kontrol et.'
          : 'Çevrimiçi ses şu anda üretilemedi.';
      return res.status(status).json({ error });
    }

    const data = await upstream.json();
    const audioPart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
    if (!audioPart) return res.status(502).json({ error: 'Gemini ses verisi döndürmedi.' });

    const pcm = Buffer.from(audioPart.inlineData.data, 'base64');
    const wav = Buffer.alloc(44 + pcm.length);
    const sampleRate = 24000;
    const channels = 1;
    const bitsPerSample = 16;
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + pcm.length, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
    wav.writeUInt16LE(channels * bitsPerSample / 8, 32);
    wav.writeUInt16LE(bitsPerSample, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44);

    res.set('Cache-Control', 'no-store');
    res.type('audio/wav').send(wav);
  } catch (error) {
    console.error('Speech service request failed:', error.message);
    return res.status(502).json({ error: 'Ses servisine bağlantı kurulamadı.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Uygulama http://localhost:${port} adresinde çalışıyor.`);
});
