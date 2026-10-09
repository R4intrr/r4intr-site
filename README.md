# R4in

R4in profil sitesi; `data/turkce_ai_soru_cevap_3000.json` içindeki 3.000 kayıtla çalışan Türkçe soru-cevap sistemi ve Pinterest kaynaklı anime GIF galerisi.

## Yerel çalıştırma

Node.js 20.12 veya üzeri gerekir.

```bash
npm install
```

Google AI Studio’dan API anahtarı oluşturun: https://aistudio.google.com/app/api-keys

Kurulum için `.env` dosyası gerekmez; soru-cevap sistemi yerel veri setinden çalışır. İsteğe bağlı Gemini bulut sesini kullanmak için Google AI Studio'dan anahtar oluşturup `.env` içindeki `GEMINI_API_KEY` değerine ekleyin. Anahtarı HTML/JavaScript dosyalarına veya `server.js` içine koymayın. Anahtar yoksa cihazın yerel Türkçe sesine düşer. Ardından:

```bash
npm start
```

Site `http://localhost:3000` adresinde açılır. Sohbet yanıtları yalnızca veri setinden seçilir; eşleşme bulunmazsa asistan bunu belirtir. Opsiyonel Gemini TTS kullanımının kotası/ücretlendirmesi Google hesabının koşullarına bağlıdır.

## İnternete yayınlama

`render.yaml` Render için web servisi ve health check tanımlar. Render hesabında repoyu Blueprint olarak bağlayıp dağıtım yapın; site herkese açık HTTPS adresi alır ve farklı ağlardan açılır. Ücretsiz plan uykuya geçebilir; sürekli açık kalma garantisi için ücretli plan gerekir. Ziyaretçi girişi yoktur. Ses üretim endpoint'i harici Gemini kotasını korumak için sınırlıdır.

Türkçe anime tarzı kadın sesi Gemini TTS ile üretilebilir. Anahtar/servis yoksa tarayıcının cihazda kurulu Türkçe sesine düşer; ses özellikleri cihaza göre değişebilir.

## API

- `GET /api/health`: servis ve AI yapılandırma durumu
- `POST /api/chat`: veri setinde Türkçe soru eşleştirme ve yanıt seçimi
- `POST /api/speech`: Gemini TTS’den Türkçe WAV ses yanıtı
