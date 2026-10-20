package com.pd.earnings;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

// خدمة أمامية قصيرة العمر: يوقظها النظام عند اتصال الواي فاي، وتسجّل الاتصال والانقطاع، ثم تبقى بعد الانقطاع مدة قصيرة وتُغلق
public class WifiWatchService extends Service {
    private static final String CH = "wifi_watch";
    private static final int NID = 4107;
    private static final long GRACE_MS = 10L * 60 * 1000; // مدة بقاء الإشعار بعد الانقطاع
    static volatile boolean running = false;
    private NotificationManager nm;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback cb;
    private HandlerThread ht;
    private Handler h;
    private final Set<Network> active = new HashSet<Network>(); // يُستعمل من خيط المعالجة فقط
    private Runnable stopTask; // يُستعمل من خيط المعالجة فقط
    private volatile String noteText = "جارٍ فحص الشبكة…";
    private long regT;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
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

    private Notification buildNote() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, CH);
        else b = new Notification.Builder(this);
        b.setContentTitle("تتبع الواي فاي").setContentText(noteText).setSmallIcon(android.R.drawable.stat_notify_sync_noanim).setOngoing(true).setOnlyAlertOnce(true);
        Intent li = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (li != null) {
            b.setContentIntent(PendingIntent.getActivity(this, 0, li, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return b.build();
    }

    private void startFg() {
        nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CH, "تتبع الواي فاي", NotificationManager.IMPORTANCE_MIN));
        }
        Notification n = buildNote();
        if (Build.VERSION.SDK_INT >= 34) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NID, n);
    }

    // تحديث نص الإشعار
    private void note(String s) {
        noteText = s;
        try {
            nm.notify(NID, buildNote());
        } catch (Exception e) {
            // تجاهل
        }
    }

    private static String hm(long t) {
        return new SimpleDateFormat("HH:mm", Locale.US).format(new Date(t));
    }

    private void scheduleStop(long ms) {
        cancelStop();
        stopTask = new Runnable() {
            @Override
            public void run() {
                stopTask = null;
                stopSelf();
            }
        };
        h.postDelayed(stopTask, ms);
    }

    private void cancelStop() {
        if (stopTask != null) {
            h.removeCallbacks(stopTask);
            stopTask = null;
        }
    }

    // شبكة معروفة الاسم وليست من شبكات العمل (تُتجاهل). إن كانت قائمة العمل فارغة فكل شبكة تُتتبَّع
    private boolean other(String name) {
        if (name == null || name.trim().isEmpty()) return false;
        ArrayList<String> w = WifiTrackPlugin.workList(WifiTracker.prefs(this));
        return !w.isEmpty() && !w.contains(name.trim());
    }

    private boolean inWork(String name) {
        if (name == null) return false;
        return WifiTrackPlugin.workList(WifiTracker.prefs(this)).contains(name.trim());
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
                    if (!active.isEmpty()) return;
                    if ("c".equals(WifiTracker.state(WifiWatchService.this))) {
                        long t = System.currentTimeMillis();
                        WifiTracker.onDisconnected(WifiWatchService.this, t, 1);
                        note("انقطع الاتصال · يختفي هذا الإشعار قريبًا");
                        scheduleStop(GRACE_MS);
                    } else if (stopTask == null) {
                        note("غير متصل بالواي فاي");
                        scheduleStop(30000);
                    }
                } catch (Exception e) {
                    // تجاهل
                }
            }
        }, 4000);
    }

    private void available(Network n, long t) {
        try {
            WifiTracker.count(this, t);
            boolean root = WifiTracker.useRoot(this);
            String[] r = root ? WifiTracker.readWifiRoot() : null;
            SharedPreferences p = WifiTracker.prefs(this);
            int flag = t - regT < 4000 ? 1 : 0;
            long ct = t;
            // وقت الاتصال الحقيقي الذي سجّله مستقبل الاستيقاظ قبل بدء الخدمة
            long pt = p.getLong("pend_t", 0);
            if (pt > 0) {
                p.edit().remove("pend_t").commit();
                if (t - pt < 60000) {
                    ct = pt;
                    flag = 0;
                } else if (t - regT < 4000 && t - pt < 16L * 3600 * 1000) {
                    ct = pt;
                    flag = 1;
                }
            }
            if (r != null && other(r[0])) {
                // شبكة ليست للعمل: لا تسجيل ولا إشعار، وتُغلق الخدمة بعد لحظات إن لم يكن هناك اتصال عمل
                if (active.isEmpty() && stopTask == null) scheduleStop(3000);
                return;
            }
            active.add(n);
            cancelStop();
            WifiTracker.onConnected(this, ct, r == null ? null : r[0], r == null ? null : r[1], flag);
            note((r != null && inWork(r[0]) ? "متصل بشبكة العمل" : "متصل بالواي فاي") + " منذ " + hm(ct));
            if (r == null && root) retryName(ct, 1);
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
            boolean had = active.remove(n);
            WifiTracker.count(this, t);
            if (active.isEmpty()) {
                WifiTracker.onDisconnected(this, t, 0);
                if (had) {
                    note("انقطع الاتصال الساعة " + hm(t) + " · يختفي هذا الإشعار قريبًا");
                    scheduleStop(GRACE_MS);
                } else if (stopTask == null) {
                    scheduleStop(3000);
                }
            }
        } catch (Exception e) {
            // تجاهل
        }
    }

    @Override
    public void onDestroy() {
        running = false;
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
