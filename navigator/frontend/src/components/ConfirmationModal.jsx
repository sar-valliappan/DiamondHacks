import { useEffect, useRef } from "react";

// Button + hint labels per language
const UI_LABELS = {
  "en": { yes: "✓ Yes, go ahead",  no: "✕ No, stop",    hint: 'You can also say "Yes" or "No"' },
  "es": { yes: "✓ Sí, adelante",   no: "✕ No, parar",   hint: 'También puedes decir "Sí" o "No"' },
  "zh": { yes: "✓ 是的，继续",      no: "✕ 不，停止",    hint: '你也可以说"是"或"不"' },
  "fr": { yes: "✓ Oui, continuer", no: "✕ Non, arrêter", hint: 'Vous pouvez aussi dire "Oui" ou "Non"' },
  "de": { yes: "✓ Ja, weiter",     no: "✕ Nein, stopp", hint: 'Sie können auch "Ja" oder "Nein" sagen' },
  "ja": { yes: "✓ はい、続けて",    no: "✕ いいえ、止めて", hint: '「はい」か「いいえ」と言うこともできます' },
  "ko": { yes: "✓ 네, 계속하세요",  no: "✕ 아니요, 멈춰요", hint: '"네" 또는 "아니요"라고 말할 수도 있어요' },
  "pt": { yes: "✓ Sim, continuar", no: "✕ Não, parar",  hint: 'Você também pode dizer "Sim" ou "Não"' },
  "ar": { yes: "✓ نعم، تابع",      no: "✕ لا، توقف",    hint: 'يمكنك أيضاً قول "نعم" أو "لا"' },
  "hi": { yes: "✓ हाँ, आगे बढ़ें",  no: "✕ नहीं, रुकें",  hint: '"हाँ" या "नहीं" भी कह सकते हैं' },
  "vi": { yes: "✓ Có, tiếp tục",   no: "✕ Không, dừng", hint: 'Bạn cũng có thể nói "Có" hoặc "Không"' },
  "tl": { yes: "✓ Oo, tuloy",      no: "✕ Hindi, itigil", hint: 'Maaari ka ring magsabi ng "Oo" o "Hindi"' },
};

function getLabels(langCode) {
  const base = (langCode || "en").split("-")[0].toLowerCase();
  return UI_LABELS[base] || UI_LABELS["en"];
}

// Language-aware yes/no word lists
const YES_WORDS = {
  "en": ["yes", "yeah", "yep", "go ahead", "sure", "okay", "ok", "do it", "confirm", "proceed"],
  "es": ["sí", "si", "dale", "adelante", "claro", "por favor", "confirmar", "acepto"],
  "zh": ["是", "好", "确认", "继续", "好的", "可以"],
  "fr": ["oui", "vas-y", "d'accord", "confirmer", "continuer", "allons-y"],
  "de": ["ja", "okay", "weiter", "bestätigen", "los", "mach das"],
  "ja": ["はい", "yes", "続ける", "確認", "お願い"],
  "ko": ["네", "예", "yes", "확인", "계속", "진행"],
  "pt": ["sim", "pode", "confirmar", "prosseguir", "claro", "ok"],
  "ar": ["نعم", "أجل", "تأكيد", "استمر"],
  "hi": ["हाँ", "हां", "हा", "ठीक है", "हो", "जारी"],
  "vi": ["có", "vâng", "đồng ý", "tiếp tục", "xác nhận"],
  "tl": ["oo", "sige", "opo", "yes", "tuloy"],
};

const NO_WORDS = {
  "en": ["no", "nope", "stop", "cancel", "don't", "abort", "halt", "quit"],
  "es": ["no", "para", "cancela", "detener", "abortar", "cancelo"],
  "zh": ["不", "停", "取消", "不要", "停止"],
  "fr": ["non", "arrête", "annuler", "stop", "non merci"],
  "de": ["nein", "stopp", "abbrechen", "halt", "nee"],
  "ja": ["いいえ", "no", "中止", "やめて", "キャンセル"],
  "ko": ["아니요", "아니", "no", "취소", "멈춰", "중지"],
  "pt": ["não", "para", "cancelar", "parar", "não obrigado"],
  "ar": ["لا", "إلغاء", "توقف"],
  "hi": ["नहीं", "रुको", "रद्द", "बंद"],
  "vi": ["không", "dừng", "hủy", "thôi"],
  "tl": ["hindi", "huwag", "itigil", "no", "cancel"],
};

function getWords(map, langCode) {
  const base = (langCode || "en").split("-")[0].toLowerCase();
  return map[base] || map["en"];
}

export default function ConfirmationModal({ message, onConfirm, onReject, langCode = "en-US" }) {
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous     = false;
    rec.interimResults = false;
    rec.lang           = langCode;

    rec.onresult = (e) => {
      const word = e.results[0][0].transcript.toLowerCase().trim();
      const yesWords = getWords(YES_WORDS, langCode);
      const noWords  = getWords(NO_WORDS, langCode);
      if (yesWords.some(w => word.includes(w))) {
        onConfirm();
      } else if (noWords.some(w => word.includes(w))) {
        onReject();
      } else {
        // Didn't catch it — try again
        try { rec.start(); } catch {}
      }
    };

    rec.onend = () => {};

    // Wait for TTS to finish before listening for the answer
    const timer = setTimeout(() => {
      try { rec.start(); } catch {}
    }, 2800);

    recognitionRef.current = rec;
    return () => {
      clearTimeout(timer);
      try { rec.stop(); } catch {}
    };
  }, [onConfirm, onReject, langCode]);

  const labels = getLabels(langCode);

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-icon">🤔</div>
        <p className="modal-question">{message}</p>
        <p className="modal-voice-hint">{labels.hint}</p>
        <div className="modal-actions">
          <button className="modal-btn yes" onClick={onConfirm}>
            {labels.yes}
          </button>
          <button className="modal-btn no" onClick={onReject}>
            {labels.no}
          </button>
        </div>
      </div>
    </div>
  );
}