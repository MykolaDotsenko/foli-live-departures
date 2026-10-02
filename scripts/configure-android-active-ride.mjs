import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_PATH = "io/github/mykoladotsenko/turkudepartures";
const PACKAGE_NAME = "io.github.mykoladotsenko.turkudepartures";
const SERVICE_CLASS = ".ActiveRideForegroundService";
const REQUIRED_PERMISSIONS = [
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
];

const serviceSource = `package ${PACKAGE_NAME};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

public final class ActiveRideForegroundService extends Service {
    static final String EXTRA_RIDE_ID = "rideId";
    static final String EXTRA_EXPIRES_AT = "expiresAt";
    static final int NOTIFICATION_ID = 41027;
    static final String CHANNEL_ID = "active-ride";
    static final long MAX_LIFETIME_MS = 6L * 60L * 60L * 1000L;

    private static volatile ActiveRideForegroundService instance;
    private static volatile String activeRideId = "";
    private static volatile long activeExpiresAt = 0L;
    private static volatile String lastFailure = "";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable expiryStop = () -> stopSelf();

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String rideId = bounded(intent == null ? null : intent.getStringExtra(EXTRA_RIDE_ID), 128);
        long expiresAt = intent == null ? 0L : intent.getLongExtra(EXTRA_EXPIRES_AT, 0L);
        long now = System.currentTimeMillis();

        if (rideId.isEmpty() || expiresAt <= now || expiresAt > now + MAX_LIFETIME_MS) {
            lastFailure = "invalid-ride-lifetime";
            stopSelf();
            return START_NOT_STICKY;
        }

        activeRideId = rideId;
        activeExpiresAt = expiresAt;
        lastFailure = "";

        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException error) {
            lastFailure = error.getClass().getSimpleName();
            clearActiveState();
            stopSelf();
            return START_NOT_STICKY;
        }

        handler.removeCallbacks(expiryStop);
        handler.postDelayed(expiryStop, Math.max(1L, expiresAt - now));
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(expiryStop);
        clearActiveState();
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static boolean isActive() {
        return instance != null && !activeRideId.isEmpty();
    }

    static String rideId() {
        return activeRideId;
    }

    static long expiresAt() {
        return activeExpiresAt;
    }

    static String lastFailure() {
        return lastFailure;
    }

    private static void clearActiveState() {
        activeRideId = "";
        activeExpiresAt = 0L;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Active Ride Mode",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows when Ride Mode has an active foreground companion.");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = null;
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            contentIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        int icon = getApplicationInfo().icon;
        if (icon == 0) {
            icon = android.R.drawable.ic_dialog_map;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(icon)
            .setContentTitle("Ride Mode active")
            .setContentText("Open Turku Departures for current stop guidance.")
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);

        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }
        return builder.build();
    }

    private static String bounded(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() <= maxLength
            ? normalized
            : normalized.substring(0, maxLength);
    }
}
`;

const pluginSource = `package ${PACKAGE_NAME};

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "ActiveRide",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class ActiveRidePlugin extends Plugin {
    @PluginMethod
    public void prepare(PluginCall call) {
        Activity activity = getActivity();
        if (
            activity == null ||
            activity.isFinishing() ||
            activity.isDestroyed() ||
            !activity.hasWindowFocus()
        ) {
            call.resolve(preparation(false, "activity-not-visible"));
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(preparation(true, "ready"));
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(preparation(true, "ready"));
            return;
        }

        if (Boolean.TRUE.equals(call.getBoolean("request", false))) {
            requestPermissionForAlias(
                "notifications",
                call,
                "notificationPermissionCallback"
            );
            return;
        }

        call.resolve(preparation(false, "notification-permission-required"));
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        boolean ready =
            getPermissionState("notifications") == PermissionState.GRANTED;
        call.resolve(
            preparation(
                ready,
                ready ? "ready" : "notification-permission-denied"
            )
        );
    }

    @PluginMethod
    public void start(PluginCall call) {
        Activity activity = getActivity();
        if (
            activity == null ||
            activity.isFinishing() ||
            activity.isDestroyed() ||
            !activity.hasWindowFocus()
        ) {
            call.resolve(result(false, "activity-not-visible"));
            return;
        }

        Context context = activity.getApplicationContext();
        if (!hasForegroundLocationPermission(context)) {
            call.resolve(result(false, "location-permission-required"));
            return;
        }
        if (!hasVisibleNotificationPermission(context)) {
            call.resolve(result(false, "notification-permission-required"));
            return;
        }
        if (!locationEnabled(context)) {
            call.resolve(result(false, "location-services-disabled"));
            return;
        }

        String rideId = bounded(call.getString("rideId", ""), 128);
        long expiresAt = parseLong(call.getString("expiresAt", ""));
        long now = System.currentTimeMillis();
        if (
            rideId.isEmpty() ||
            expiresAt <= now ||
            expiresAt > now + ActiveRideForegroundService.MAX_LIFETIME_MS
        ) {
            call.resolve(result(false, "invalid-ride-lifetime"));
            return;
        }

        Intent intent = new Intent(context, ActiveRideForegroundService.class);
        intent.putExtra(ActiveRideForegroundService.EXTRA_RIDE_ID, rideId);
        intent.putExtra(ActiveRideForegroundService.EXTRA_EXPIRES_AT, expiresAt);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            JSObject response = result(false, "requested");
            response.put("rideId", rideId);
            call.resolve(response);
        } catch (RuntimeException error) {
            call.resolve(result(false, error.getClass().getSimpleName()));
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject response = result(ActiveRideForegroundService.isActive(), "");
        response.put("rideId", ActiveRideForegroundService.rideId());
        response.put("expiresAt", String.valueOf(ActiveRideForegroundService.expiresAt()));
        response.put("serviceType", "location");
        response.put("restartPolicy", "not-sticky");
        response.put("lastFailure", ActiveRideForegroundService.lastFailure());
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext().getApplicationContext();
        String requestedRideId = bounded(call.getString("rideId", ""), 128);
        String activeRideId = ActiveRideForegroundService.rideId();

        if (
            !requestedRideId.isEmpty() &&
            !activeRideId.isEmpty() &&
            !requestedRideId.equals(activeRideId)
        ) {
            JSObject response = result(true, "ride-mismatch");
            response.put("rideId", activeRideId);
            call.resolve(response);
            return;
        }

        context.stopService(new Intent(context, ActiveRideForegroundService.class));
        call.resolve(result(false, "stopping"));
    }

    private static JSObject result(boolean active, String reason) {
        JSObject response = new JSObject();
        response.put("active", active);
        response.put("reason", reason);
        return response;
    }

    private static JSObject preparation(boolean ready, String reason) {
        JSObject response = new JSObject();
        response.put("ready", ready);
        response.put("reason", reason);
        return response;
    }

    private static boolean hasForegroundLocationPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            || context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean hasVisibleNotificationPermission(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean locationEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return manager.isLocationEnabled();
        }
        return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    private static String bounded(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() <= maxLength
            ? normalized
            : normalized.substring(0, maxLength);
    }

    private static long parseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (RuntimeException ignored) {
            return 0L;
        }
    }
}
`;

function mainActivitySource(webViewDebug) {
  return `package ${PACKAGE_NAME};

import android.os.Bundle;
${webViewDebug ? "import android.webkit.WebView;\n" : ""}import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ActiveRidePlugin.class);
        super.onCreate(savedInstanceState);
${webViewDebug ? "        WebView.setWebContentsDebuggingEnabled(true);\n" : ""}    }
}
`;
}

function manifestPaths(root) {
  return {
    manifest: path.join(root, "android/app/src/main/AndroidManifest.xml"),
    javaDir: path.join(root, "android/app/src/main/java", PACKAGE_PATH),
  };
}

function addPermission(manifest, permission) {
  if (manifest.includes(`android:name="${permission}"`)) return manifest;
  const marker = "<application";
  if (!manifest.includes(marker)) {
    throw new Error("Android manifest has no <application> anchor.");
  }
  return manifest.replace(
    marker,
    `    <uses-permission android:name="${permission}" />\n\n    ${marker}`,
  );
}

function addService(manifest) {
  if (manifest.includes(`android:name="${SERVICE_CLASS}"`)) return manifest;
  const marker = "</application>";
  if (!manifest.includes(marker)) {
    throw new Error("Android manifest has no </application> anchor.");
  }
  const service = `        <service
            android:name="${SERVICE_CLASS}"
            android:exported="false"
            android:foregroundServiceType="location"
            android:stopWithTask="true" />\n\n`;
  return manifest.replace(marker, service + "    " + marker);
}

export function configureAndroidActiveRide(
  root = process.cwd(),
  { webViewDebug = false } = {},
) {
  const { manifest, javaDir } = manifestPaths(root);
  if (!fs.existsSync(manifest)) {
    throw new Error(`Generated Android manifest not found: ${manifest}`);
  }

  let source = fs.readFileSync(manifest, "utf8");
  for (const permission of REQUIRED_PERMISSIONS) {
    source = addPermission(source, permission);
  }
  source = addService(source);
  fs.writeFileSync(manifest, source);

  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(path.join(javaDir, "ActiveRideForegroundService.java"), serviceSource);
  fs.writeFileSync(path.join(javaDir, "ActiveRidePlugin.java"), pluginSource);
  fs.writeFileSync(path.join(javaDir, "MainActivity.java"), mainActivitySource(webViewDebug));

  verifyAndroidActiveRide(root, { webViewDebug });
}

export function verifyAndroidActiveRide(
  root = process.cwd(),
  { webViewDebug = false } = {},
) {
  const { manifest, javaDir } = manifestPaths(root);
  const failures = [];
  const manifestSource = fs.readFileSync(manifest, "utf8");
  const main = fs.readFileSync(path.join(javaDir, "MainActivity.java"), "utf8");
  const service = fs.readFileSync(
    path.join(javaDir, "ActiveRideForegroundService.java"),
    "utf8",
  );
  const plugin = fs.readFileSync(path.join(javaDir, "ActiveRidePlugin.java"), "utf8");

  for (const permission of REQUIRED_PERMISSIONS) {
    if (!manifestSource.includes(`android:name="${permission}"`)) {
      failures.push(`missing permission ${permission}`);
    }
  }
  if (manifestSource.includes("android.permission.ACCESS_BACKGROUND_LOCATION")) {
    failures.push("background location permission must remain absent");
  }
  for (const token of [
    `android:name="${SERVICE_CLASS}"`,
    'android:foregroundServiceType="location"',
    'android:exported="false"',
    'android:stopWithTask="true"',
  ]) {
    if (!manifestSource.includes(token)) failures.push(`manifest missing ${token}`);
  }
  for (const token of [
    "registerPlugin(ActiveRidePlugin.class)",
    "super.onCreate(savedInstanceState)",
  ]) {
    if (!main.includes(token)) failures.push(`MainActivity missing ${token}`);
  }
  if (webViewDebug !== main.includes("setWebContentsDebuggingEnabled(true)")) {
    failures.push("MainActivity WebView debugging mode does not match requested configuration");
  }
  for (const token of [
    "START_NOT_STICKY",
    "FOREGROUND_SERVICE_TYPE_LOCATION",
    "MAX_LIFETIME_MS",
    "setOngoing(true)",
    "onTaskRemoved",
  ]) {
    if (!service.includes(token)) failures.push(`foreground service missing ${token}`);
  }
  for (const token of [
    '@CapacitorPlugin(name = "ActiveRide")',
    'name = "ActiveRide"',
    '@Permission(',
    'alias = "notifications"',
    "requestPermissionForAlias(",
    "@PermissionCallback",
    "activity.hasWindowFocus()",
    "location-permission-required",
    "notification-permission-required",
    "location-services-disabled",
    "context.startForegroundService(intent)",
    "ride-mismatch",
  ]) {
    if (!plugin.includes(token)) failures.push(`ActiveRide plugin missing ${token}`);
  }

  if (failures.length) {
    throw new Error(
      ["Android active-ride bridge verification failed:", ...failures.map((f) => `- ${f}`)].join("\n"),
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  configureAndroidActiveRide(process.cwd(), {
    webViewDebug: process.argv.includes("--webview-debug"),
  });
  console.log(
    "Android active-ride bridge configured: typed location foreground service, fail-closed foreground start, no background-location permission, non-sticky TTL-bounded native companion.",
  );
}
