package com.pd.earnings;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import java.util.HashSet;
import java.util.Set;

// خدمة أمامية تستمع لاتصال/انقطاع الواي فاي لحظيًا وتسجّلها عبر WifiTracker
public class WifiWatchService extends Service {
    private static final String CH = "wifi_watch";
    private static final int NID = 4107;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback cb;
    private HandlerThread ht;
    private Handler h;
    private final Set<Network> active = new HashSet<Network>(); // يُستعمل من خيط المعالجة فقط
    private long regT;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startFg();
        if (!WifiTracker.isOn(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (cb == null) begin();
        return START_STICKY;
    }

    private void startFg() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH, "تتبع الواي فاي", NotificationManager.IMPORTANCE_MIN));
            b = new Notification.Builder(this, CH);
        } else {
            b = new Notification.Builder(this);
        }
        b.setContentTitle("تتبع الواي فاي يعمل").setSmallIcon(android.R.drawable.stat_notify_sync_noanim).setOngoing(true);
        Intent li = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (li != null) {
            b.setContentIntent(PendingIntent.getActivity(this, 0, li, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NID, n);
    }

    private void begin() {
        ht = new HandlerThread("wifi-watch");
        ht.start();
        h = new Handler(ht.getLooper());
        cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        regT = System.currentTimeMillis();
        cb = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(final Network n) {
                final long t = System.currentTimeMillis();
                h.post(new Runnable() {
                    @Override
                    public void run() {
                        available(n, t);
                    }
                });
            }

            @Override
            public void onLost(final Network n) {
                final long t = System.currentTimeMillis();
                h.post(new Runnable() {
                    @Override
                    public void run() {
                        lost(n, t);
                    }
                });
            }
        };
        try {
            NetworkRequest rq = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            cm.registerNetworkCallback(rq, cb);
        } catch (Exception e) {
            cb = null;
            stopSelf();
            return;
        }
        // إن كان الاتصال مسجَّلًا ثم لم تظهر أي شبكة بعد التسجيل، فقد انقطع أثناء توقف الخدمة
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    if (active.isEmpty() && "c".equals(WifiTracker.state(WifiWatchService.this))) {
                        WifiTracker.onDisconnected(WifiWatchService.this, System.currentTimeMillis(), 1);
                    }
                } catch (Exception e) {
                    // تجاهل
                }
            }
        }, 4000);
    }

    private void available(Network n, long t) {
        try {
            active.add(n);
            WifiTracker.count(this, t);
            String[] r = WifiTracker.useRoot(this) ? WifiTracker.readWifiRoot() : null;
            int flag = t - regT < 4000 ? 1 : 0;
            WifiTracker.onConnected(this, t, r == null ? null : r[0], r == null ? null : r[1], flag);
            if (r == null && WifiTracker.useRoot(this)) retryName(t, 1);
        } catch (Exception e) {
            // تجاهل
        }
    }

    // إن فشلت قراءة الاسم عند الاتصال نعيد المحاولة لاحقًا ما دامت الشبكة متصلة
    private void retryName(final long t, final int attempt) {
        if (attempt > 4) return;
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    if (active.isEmpty() || !WifiTracker.isOn(WifiWatchService.this)) return;
                    String[] r = WifiTracker.readWifiRoot();
                    if (r != null) WifiTracker.onConnected(WifiWatchService.this, t, r[0], r[1], 0);
                    else retryName(t, attempt + 1);
                } catch (Exception e) {
                    // تجاهل
                }
            }
        }, 5000);
    }

    private void lost(Network n, long t) {
        try {
            active.remove(n);
            WifiTracker.count(this, t);
            if (active.isEmpty()) WifiTracker.onDisconnected(this, t, 0);
        } catch (Exception e) {
            // تجاهل
        }
    }

    @Override
    public void onDestroy() {
        try {
            if (cm != null && cb != null) cm.unregisterNetworkCallback(cb);
        } catch (Exception e) {
            // تجاهل
        }
        cb = null;
        if (ht != null) ht.quitSafely();
        super.onDestroy();
    }
}
