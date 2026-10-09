const musicToggle = document.getElementById('musicToggle');
const bgMusic = document.getElementById('bgMusic');
const volumeSlider = document.getElementById('volumeSlider');
const assistantLauncher = document.getElementById('assistantLauncher');
const assistantWindow = document.getElementById('assistantWindow');
const assistantClose = document.getElementById('assistantClose');
const aiStatus = document.getElementById('aiStatus');
const voiceToggle = document.getElementById('voiceToggle');
const assistantForm = document.getElementById('assistantForm');
const assistantInput = document.getElementById('assistantInput');
const chatBox = document.getElementById('chatBox');
const assistantGreeting = document.getElementById('assistantGreeting');
const suggestedQuestions = document.querySelectorAll('[data-question]');

let isPlaying = false;
let voiceEnabled = true;
let isSending = false;
let activeVoiceAudio = null;
let activeVoiceUrl = null;

function setMusicState(play) {
  isPlaying = play;
  musicToggle.textContent = play ? '🔊 Müzik açık' : '🔇 Müzik kapalı';

  if (play) {
    bgMusic.volume = Number(volumeSlider.value || 0.18);
    bgMusic.play().catch(() => {
      isPlaying = false;
      musicToggle.textContent = '🔇 Müzik kapalı';
    });
  } else {
    bgMusic.pause();
  }
}

function addMessage(role, text) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  message.textContent = text;
  chatBox.appendChild(message);
  chatBox.scrollTop = chatBox.scrollHeight;
  return message;
}

function findTurkishFemaleVoice() {
  if (!('speechSynthesis' in window)) return null;
  const turkishVoices = window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith('tr'));

  return turkishVoices.find((voice) =>
    /emel|filiz|elif|selin|female|zira|melek|zehra|nehir|aylin|ayse/i.test(voice.name)
  ) || null;
}

function updateVoiceButton() {
  const cloudVoiceAvailable = aiStatus.dataset.speechReady === 'true';
  const localFemaleVoiceAvailable = Boolean(findTurkishFemaleVoice());
  const voiceAvailable = cloudVoiceAvailable || localFemaleVoiceAvailable;

  voiceToggle.disabled = !voiceAvailable;
  voiceToggle.textContent = !voiceAvailable
    ? 'Kadın ses yok'
    : voiceEnabled ? 'Ses açık' : 'Ses kapalı';
  voiceToggle.title = voiceAvailable
    ? 'Türkçe anime tarzı sesi aç veya kapat'
    : 'Bu cihazda Türkçe kadın sesi yok; Gemini Leda için sunucu anahtarı gerekli.';
  voiceToggle.setAttribute('aria-pressed', String(voiceEnabled && voiceAvailable));
}

function speakWithDeviceVoice(text) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
  const preferredVoice = findTurkishFemaleVoice();
  if (!preferredVoice) return false;

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = 'tr-TR';
  utterance.rate = 0.9;
  utterance.pitch = 1.65;

  if (preferredVoice) utterance.voice = preferredVoice;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

async function speakReply(text) {
  if (!voiceEnabled) return;

  if (aiStatus.dataset.speechReady === 'true') {
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error('Cloud TTS unavailable');

      if (activeVoiceAudio) activeVoiceAudio.pause();
      if (activeVoiceUrl) URL.revokeObjectURL(activeVoiceUrl);

      activeVoiceUrl = URL.createObjectURL(await response.blob());
      activeVoiceAudio = new Audio(activeVoiceUrl);
      await activeVoiceAudio.play();
      return;
    } catch {
      if (activeVoiceUrl) URL.revokeObjectURL(activeVoiceUrl);
      activeVoiceUrl = null;
    }
  }

  if (!speakWithDeviceVoice(text)) updateVoiceButton();
}

async function updateAiStatus() {
  try {
    const response = await fetch('/api/health');
    const status = await response.json();
    aiStatus.textContent = status.aiConfigured ? 'Soru-cevap hazır' : 'Veri seti bulunamadı';
    aiStatus.dataset.ready = String(status.aiConfigured);
    aiStatus.dataset.speechReady = String(status.speechConfigured);
    assistantGreeting.textContent = !status.speechConfigured && !findTurkishFemaleVoice()
      ? 'Sorularını veri setinden yanıtlıyorum. Bu cihazda Türkçe kadın sesi yok; çevrimiçi anime sesi için Gemini anahtarı gerekli.'
      : 'Merhaba! Ben R4in’in soru-cevap asistanıyım. Türkçe sorularını yazabilirsin.';
    updateVoiceButton();
  } catch {
    aiStatus.textContent = 'Sunucuya ulaşılamıyor';
    aiStatus.dataset.ready = 'false';
    aiStatus.dataset.speechReady = 'false';
    updateVoiceButton();
  }
}

function closeAssistant() {
  assistantWindow.hidden = true;
  assistantLauncher.setAttribute('aria-expanded', 'false');

  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (activeVoiceAudio) activeVoiceAudio.pause();

  assistantLauncher.focus({ preventScroll: true });
}

musicToggle.addEventListener('click', () => {
  setMusicState(!isPlaying);
});

assistantLauncher.addEventListener('click', () => {
  assistantWindow.hidden = !assistantWindow.hidden;
  assistantLauncher.setAttribute('aria-expanded', String(!assistantWindow.hidden));

  if (!assistantWindow.hidden) {
    assistantInput.focus();
  }
});

assistantClose.addEventListener('click', () => {
  closeAssistant();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !assistantWindow.hidden) {
    closeAssistant();
  }
});

voiceToggle.addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return;
  voiceEnabled = !voiceEnabled;
  updateVoiceButton();
  if (!voiceEnabled) window.speechSynthesis.cancel();
  if (!voiceEnabled && activeVoiceAudio) activeVoiceAudio.pause();
});

volumeSlider.addEventListener('input', (event) => {
  const nextVolume = Number(event.target.value);
  bgMusic.volume = nextVolume;

  if (nextVolume <= 0 && isPlaying) {
    setMusicState(false);
    return;
  }

  if (nextVolume > 0 && !isPlaying) {
    setMusicState(true);
  }
});

assistantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = assistantInput.value.trim();

  if (!value || isSending) return;

  addMessage('user', value);
  assistantInput.value = '';
  isSending = true;
  const submitButton = assistantForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = '...';
  const pendingMessage = addMessage('bot', 'Yanıt hazırlanıyor...');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: value }),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'AI yanıt veremedi. Tekrar deneyebilirsin.');

    pendingMessage.remove();
    addMessage('bot', data.reply);
    speakReply(data.reply);
  } catch (error) {
    pendingMessage.remove();
    addMessage('bot', error.message || 'Bağlantı kurulamadı. Biraz sonra tekrar dene.');
  } finally {
    isSending = false;
    submitButton.disabled = false;
    submitButton.innerHTML = 'Sor <span aria-hidden="true">↗</span>';
    assistantInput.focus();
  }
});

suggestedQuestions.forEach((button) => {
  button.addEventListener('click', () => {
    assistantInput.value = button.dataset.question;
    assistantForm.requestSubmit();
  });
});

window.addEventListener('load', () => {
  updateVoiceButton();
  updateAiStatus();
  setMusicState(false);
});

if ('speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', updateVoiceButton);
}
