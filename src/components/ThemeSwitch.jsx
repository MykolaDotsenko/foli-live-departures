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
      onClick={toggleTheme}
    >
      <span aria-hidden="true">{nextTheme === "dark" ? "☾" : "☀"}</span>
      <span>{label}</span>
    </button>
  );
}
