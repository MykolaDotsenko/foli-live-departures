import { t, useLanguage } from "../i18n";
import { toggleTheme, useTheme } from "../theme";

export default function ThemeSwitch() {
  useLanguage();
  const theme = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = nextTheme === "dark" ? t("Dark") : t("Light");
  const action =
    nextTheme === "dark" ? t("Use dark theme") : t("Use light theme");

  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={action}
      title={action}
      data-theme-target={nextTheme}
      onClick={toggleTheme}
    >
      <span className="theme-switch-icon" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
