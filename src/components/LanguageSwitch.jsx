import { setLanguage, useLanguage } from "../i18n";
import { nextLocaleDefinition } from "../i18n/locales";

export default function LanguageSwitch() {
  const language = useLanguage();
  const other = nextLocaleDefinition(language);

  return (
    <button
      type="button"
      className="language-switch"
      lang={other.code}
      onClick={() => setLanguage(other.code)}
    >
      {other.switchLabel}
    </button>
  );
}
