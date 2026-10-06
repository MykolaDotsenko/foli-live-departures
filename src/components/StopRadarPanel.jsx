import { useEffect, useState } from "react";
import { t } from "../i18n";
import { requestCompassPermission } from "../utils/stopRadar";

export default function StopRadarPanel({
  stops,
  initialTargetStopId = "",
  recommendedTargetStopId = "",
  activeStopId = "",
  onPosition,
  onOpenStop,
  onClose,
  showFallbackClose = true,
}) {
  const [Radar, setRadar] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [compassPermission, setCompassPermission] = useState("pending");

  useEffect(() => {
    let active = true;
    setRadar(null);
    setFailed(false);
    import("./StopRadar")
      .then((module) => {
        if (active) setRadar(() => module.default);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    void requestCompassPermission().then(setCompassPermission);
  }, []);

  if (failed) {
    return (
      <div>
        <p role="alert">
          {t("Stop radar couldn’t open. Check your connection, then try again.")}
        </p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          {t("Open stop radar")}
        </button>
        {showFallbackClose && (
          <button type="button" onClick={onClose}>
            {t("Close stop radar")}
          </button>
        )}
      </div>
    );
  }

  if (!Radar) return <p role="status">{t("Opening stop radar…")}</p>;

  return (
    <Radar
      stops={stops}
      initialTargetStopId={initialTargetStopId}
      recommendedTargetStopId={recommendedTargetStopId}
      activeStopId={activeStopId}
      compassPermission={compassPermission}
      onPosition={onPosition}
      onOpenStop={onOpenStop}
      onClose={onClose}
    />
  );
}
