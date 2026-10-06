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

class RadarLoadBoundary extends Component {
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
      <p role="alert">
        {t("Stop radar couldn’t open. Check your connection, then try again.")}
      </p>
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
  const [Radar, setRadar] = useState(lazyStopRadar);
  const [compassPermission, setCompassPermission] = useState("pending");

  useEffect(() => {
    setCompassPermission("pending");
    void requestCompassPermission().then(setCompassPermission);
  }, []);

  return (
    <RadarLoadBoundary onFailed={() => setRadar(lazyStopRadar)}>
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
