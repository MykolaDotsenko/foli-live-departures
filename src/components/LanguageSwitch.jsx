import { useState } from "react";
import { setLanguage, t, useLanguage } from "../i18n";
import { LOCALES, localeDefinition } from "../i18n/locales";

// Every language the app speaks, each in its own name, in one list. A button
// naming only the next language in turn made a Ukrainian on an English phone
// go through Finnish to reach Ukrainian, and never said which languages there
// were. The phone's own picker opens anywhere on the pill: the select covers
// it, unseen, and the pill shows what it holds.
export default function LanguageSwitch() {
  const language = useLanguage();
  const [pending, setPending] = useState("");
  const shown = localeDefinition(pending || language);

  /** @param {import("react").ChangeEvent<HTMLSelectElement>} event */
  const changeLanguage = (event) => {
    const code = event.target.value;
    if (pending || code === language) return;
    setPending(code);
    void setLanguage(code).finally(() => setPending(""));
  };

  return (
    <span className="language-switch">
      <svg className="language-switch-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0h13M8 1.5c-3.6 3.6-3.6 9.4 0 13M8 1.5c3.6 3.6 3.6 9.4 0 13" />
      </svg>
      <span aria-hidden="true" lang={shown.code}>
        {shown.nativeLabel}
      </span>
      <span className="language-switch-chevron" aria-hidden="true" />
      <select
        aria-label={t("Language")}
        aria-busy={pending ? true : undefined}
        value={shown.code}
        onChange={changeLanguage}
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code} lang={locale.code}>
            {locale.nativeLabel}
          </option>
        ))}
      </select>
    </span>
  );
}
