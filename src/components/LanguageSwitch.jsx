import { useState } from "react";
import { setLanguage, useLanguage } from "../i18n";
import { nextLocaleDefinition } from "../i18n/locales";

export default function LanguageSwitch() {
  const language = useLanguage();
  const other = nextLocaleDefinition(language);
  const [loading, setLoading] = useState(false);

  const changeLanguage = () => {
    if (loading) return;
    setLoading(true);
    void setLanguage(other.code).finally(() => setLoading(false));
  };

  return (
    <button
      type="button"
      className="language-switch"
      lang={other.code}
      aria-busy={loading || undefined}
      disabled={loading}
      onClick={changeLanguage}
    >
      {other.switchLabel}
    </button>
  );
}
