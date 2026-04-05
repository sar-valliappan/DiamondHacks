/**
 * LanguageSelector.jsx
 * Dropdown to pick speech recognition + synthesis language.
 * Also exports LANGUAGES array used by App.jsx for idle hints.
 */

export const LANGUAGES = [
  { code: "en-US", label: "🇺🇸 English",    hint: "Tap the button and tell me what you need" },
  { code: "es-US", label: "🇲🇽 Español",    hint: "Toca el botón y dime lo que necesitas" },
  { code: "zh-CN", label: "🇨🇳 中文",        hint: "点击按钮，告诉我您需要什么" },
  { code: "fr-FR", label: "🇫🇷 Français",   hint: "Appuyez sur le bouton et dites-moi ce dont vous avez besoin" },
  { code: "de-DE", label: "🇩🇪 Deutsch",    hint: "Tippen Sie auf die Schaltfläche und sagen Sie mir, was Sie brauchen" },
  { code: "ja-JP", label: "🇯🇵 日本語",      hint: "ボタンをタップして、何が必要か教えてください" },
  { code: "ko-KR", label: "🇰🇷 한국어",      hint: "버튼을 탭하고 필요한 것을 말씀해 주세요" },
  { code: "pt-BR", label: "🇧🇷 Português",  hint: "Toque no botão e me diga o que você precisa" },
  { code: "ar-SA", label: "🇸🇦 العربية",    hint: "اضغط على الزر وأخبرني بما تحتاج" },
  { code: "hi-IN", label: "🇮🇳 हिन्दी",     hint: "बटन दबाएं और मुझे बताएं आपको क्या चाहिए" },
  { code: "vi-VN", label: "🇻🇳 Tiếng Việt", hint: "Nhấn nút và cho tôi biết bạn cần gì" },
  { code: "tl-PH", label: "🇵🇭 Filipino",   hint: "I-tap ang button at sabihin sa akin kung ano ang kailangan mo" },
];

export default function LanguageSelector({ value, onChange }) {
  return (
    <div className="lang-select-wrap" title="Choose your language">
      <span className="lang-icon">🌐</span>
      <select
        className="lang-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="Select language"
      >
        {LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}