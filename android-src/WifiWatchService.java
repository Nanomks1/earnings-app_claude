package com.pd.earnings;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.Icon;
import android.net.ConnectivityManager;
import android.net.Network;
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
    private static final long GRACE_MS = 90L * 1000; // مدة بقاء الإشعار بعد الانقطاع (90 ثانية)
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

    private static Icon iconCache;

    // أيقونة التطبيق أحادية اللون (هاتف ومفتاح ربط) تُرسم برمجيًا على شبكة 24×24
    private static synchronized Icon appIcon() {
        if (iconCache == null) {
            Bitmap bm = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bm);
            c.scale(4f, 4f);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setColor(0xFFFFFFFF);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            // الهاتف: مفتوح من الجهة العليا اليمنى ليمرّ منه المفتاح
            p.setStrokeWidth(1.8f);
            Path ph = new Path();
            ph.moveTo(13.5f, 13f);
            ph.lineTo(13.5f, 19f);
            ph.arcTo(new RectF(9.5f, 17f, 13.5f, 21f), 0f, 90f);
            ph.lineTo(5.5f, 21f);
            ph.arcTo(new RectF(3.5f, 17f, 7.5f, 21f), 90f, 90f);
            ph.lineTo(3.5f, 4.5f);
            ph.arcTo(new RectF(3.5f, 2.5f, 7.5f, 6.5f), 180f, 90f);
            ph.lineTo(11f, 2.5f);
            c.drawPath(ph, p);
            // ذراع المفتاح
            p.setStrokeWidth(2.4f);
            c.drawLine(15.38f, 8.62f, 7.2f, 16.8f, p);
            // رأس المفتاح: قوس مفتوح نحو الأعلى واليمين
            p.setStrokeWidth(2.2f);
            c.drawArc(new RectF(14.5f, 3.5f, 20.5f, 9.5f), -5f, 280f, false, p);
            iconCache = Icon.createWithBitmap(bm);
        }
        return iconCache;
    }

    private Notification buildNote() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(this, CH);
        else b = new Notification.Builder(this);
        b.setContentTitle("تتبع الواي فاي").setContentText(noteText).setSmallIcon(appIcon()).setOngoing(true).setOnlyAlertOnce(true);
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
        return WifiTracker.isOtherNetwork(this, name);
    }

    private boolean inWork(String name) {
        if (name == null) return false;
        ArrayList<String> w = WifiTrackPlugin.workList(WifiTracker.prefs(this));
        return w.contains(name.trim());
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
            cm.registerNetworkCallback(WifiTracker.buildWifiRequest(), cb);
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
                        scheduleStop(15000);
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
            long since = p.getLong("conn_t", ct);
            note((r != null && inWork(r[0]) ? "متصل بشبكة العمل" : "متصل بالواي فاي") + " منذ " + hm(since));
            if (r == null && root) retryName(since, 1);
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
                    if (r != null) {
                        if (other(r[0])) {
                            active.clear();
                            WifiTracker.onDisconnected(WifiWatchService.this, System.currentTimeMillis(), 1);
                            scheduleStop(1000);
                            return;
                        }
                        WifiTracker.onConnected(WifiWatchService.this, t, r[0], r[1], 0);
                        note((inWork(r[0]) ? "متصل بشبكة العمل" : "متصل بالواي فاي") + " منذ " + hm(t));
                    } else {
                        retryName(t, attempt + 1);
                    }
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
