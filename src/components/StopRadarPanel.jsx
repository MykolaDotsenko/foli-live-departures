import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import { t } from "../i18n";
import { requestCompassPermission } from "../utils/stopRadar";

const lazyStopRadar = () => lazy(() => import("./StopRadar"));

export class RadarLoadBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailed?.();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div>
        <p role="alert">
          {t("Stop radar couldn’t open. Check your connection, then try again.")}
        </p>
        <button type="button" onClick={this.props.onRetry}>
          {t("Open stop radar")}
        </button>
      </div>
    );
  }
}

export default function StopRadarPanel({
  stops,
  initialTargetStopId = "",
  recommendedTargetStopId = "",
  activeStopId = "",
  onPosition,
  onOpenStop,
  onClose,
}) {
  const [Radar, setRadar] = useState(() => lazyStopRadar());
  const [attempt, setAttempt] = useState(0);
  const [compassPermission, setCompassPermission] = useState("pending");

  useEffect(() => {
    setCompassPermission("pending");
    void requestCompassPermission().then(setCompassPermission);
  }, []);

  const retry = () => {
    setRadar(() => lazyStopRadar());
    setAttempt((value) => value + 1);
  };

  return (
    <RadarLoadBoundary
      key={attempt}
      onRetry={retry}
      onClose={onClose}
    >
      <Suspense fallback={<p role="status">{t("Opening stop radar…")}</p>}>
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
      </Suspense>
    </RadarLoadBoundary>
  );
}
