// Text-to-speech via the browser's built-in voices (free, offline on most devices).

export function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text));
  if (lang) u.lang = lang;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
