package com.pd.earnings;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

// تتبع اتصال/انقطاع الواي فاي في خانة منفصلة عن السجل. الأحداث تُخزَّن في SharedPreferences.
final class WifiTracker {
    static final String ACTION_WAKE = "com.pd.earnings.WIFI_WAKE";
    static final String ACTION_POLL = "com.pd.earnings.WIFI_POLL";
    private static final long POLL_MS = 5L * 60 * 1000;
    private static final String PREFS = "wifi_track";
    private static final int MAX_EVENTS = 400;
    private static final Pattern INFO = Pattern.compile("SSID:\\s*\"(.*?)\",\\s*BSSID:\\s*([0-9a-fA-F:]{17})");
    private static final Pattern INFO_UNQUOTED = Pattern.compile("SSID:\\s*([^\",\\s]+),\\s*BSSID:\\s*([0-9a-fA-F:]{17})");
    private static final Pattern CMD_SSID = Pattern.compile("Wifi is connected to \"(.*?)\"");
    private static final Pattern CMD_BSSID = Pattern.compile("BSSID:\\s*([0-9a-fA-F:]{17})");
    private static final Object LOCK = new Object();

    private WifiTracker() {
    }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isOn(Context c) {
        return prefs(c).getBoolean("on", false);
    }

    static boolean useRoot(Context c) {
        return prefs(c).getBoolean("root", false);
    }

    static NetworkRequest buildWifiRequest() {
        NetworkRequest.Builder b = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI);
        try {
            b.removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            b.removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN);
        } catch (Throwable e) {
            // تجاهل
        }
        return b.build();
    }

    // تشغيل التتبع: تسجيل استيقاظ النظام عند اتصال الواي فاي، وبدء الخدمة إن كان الواي فاي متصلًا الآن
    static void start(final Context c) {
        if (!isOn(c)) return;
        registerWake(c);
        schedulePoll(c);
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (useRoot(c)) {
                    exemptBattery(c);
                }
                if (wifiUp(c)) {
                    onWake(c);
                } else if ("c".equals(state(c))) {
                    try {
                        onDisconnected(c, System.currentTimeMillis(), 1);
                    } catch (Exception e) {
                        // تجاهل
                    }
                }
            }
        }).start();
    }

    static void startSvc(Context c) {
        Context a = c.getApplicationContext();
        Intent i = new Intent(a, WifiWatchService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) a.startForegroundService(i);
            else a.startService(i);
            return;
        } catch (Throwable e) {
            // في أندرويد 17 قد يمنع النظام البدء من الخلفية؛ نستعمل الروت إن كان مفعّلًا
        }
        if (useRoot(a)) {
            try {
                exemptBatteryNow(a);
                if (Build.VERSION.SDK_INT >= 26) a.startForegroundService(i);
                else a.startService(i);
                return;
            } catch (Throwable e) {
                // محاولة التشغيل المباشر بأمر الروت
            }
            try {
                su("am start-foreground-service -n " + a.getPackageName() + "/.WifiWatchService", 5000);
            } catch (Throwable e) {
                // تجاهل
            }
        }
    }

    static void stop(Context c) {
        unregisterWake(c);
        cancelPoll(c);
        try {
            Context a = c.getApplicationContext();
            a.stopService(new Intent(a, WifiWatchService.class));
        } catch (Exception e) {
            // تجاهل
        }
    }

    private static PendingIntent pollPi(Context a) {
        Intent i = new Intent(a, WifiBootReceiver.class);
        i.setAction(ACTION_POLL);
        i.setPackage(a.getPackageName());
        return PendingIntent.getBroadcast(a, 12, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // شبكة أمان: منبّه خفيف كل ~5 دقائق يفحص الواي فاي حتى لو لم يوقظنا النظام
    static void schedulePoll(Context c) {
        try {
            Context a = c.getApplicationContext();
            AlarmManager am = (AlarmManager) a.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + POLL_MS, pollPi(a));
        } catch (Throwable e) {
            // تجاهل
        }
    }

    static void cancelPoll(Context c) {
        try {
            Context a = c.getApplicationContext();
            AlarmManager am = (AlarmManager) a.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pollPi(a));
        } catch (Throwable e) {
            // تجاهل
        }
    }

    static void onPoll(Context c) {
        try {
            if (!isOn(c)) return;
            SharedPreferences p = prefs(c);
            long t = System.currentTimeMillis();
            boolean up = wifiUp(c);
            if (up) {
                if (!"c".equals(state(c))) {
                    long dn = p.getLong("poll_dn", 0);
                    long est = (dn > 0 && t - dn <= POLL_MS * 3) ? (dn + t) / 2 : t;
                    p.edit().putLong("est_t", est).commit();
                }
            } else {
                p.edit().putLong("poll_dn", t).commit();
            }
            onWake(c, false);
            p.edit().remove("est_t").commit();
        } finally {
            if (isOn(c)) schedulePoll(c);
        }
    }

    private static int mut() {
        return Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
    }

    private static PendingIntent wakePi(Context a, int flags) {
        Intent i = new Intent(a, WifiBootReceiver.class);
        i.setAction(ACTION_WAKE);
        i.setPackage(a.getPackageName());
        i.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
        return PendingIntent.getBroadcast(a, 11, i, flags);
    }

    // يطلب من النظام إيقاظ التطبيق عند ظهور أو تغيّر شبكة واي فاي
    private static void registerWake(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            Context a = c.getApplicationContext();
            ConnectivityManager cm = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
            PendingIntent pi = wakePi(a, PendingIntent.FLAG_UPDATE_CURRENT | mut());
            try {
                cm.unregisterNetworkCallback(pi);
            } catch (Exception e) {
                // لم يكن مسجَّلًا
            }
            cm.registerNetworkCallback(buildWifiRequest(), pi);
        } catch (Exception e) {
            // تجاهل
        }
    }

    private static void unregisterWake(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            Context a = c.getApplicationContext();
            ConnectivityManager cm = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
            PendingIntent pi = wakePi(a, PendingIntent.FLAG_NO_CREATE | mut());
            if (pi != null) cm.unregisterNetworkCallback(pi);
        } catch (Exception e) {
            // تجاهل
        }
    }

    @SuppressWarnings("deprecation")
    static boolean wifiUp(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return true;
            }
        } catch (Exception e) {
            // تجاهل
        }
        return false;
    }

    static boolean isOtherNetwork(Context c, String name) {
        if (name == null || name.trim().isEmpty()) return false;
        ArrayList<String> w = WifiTrackPlugin.workList(prefs(c));
        return !w.isEmpty() && !w.contains(name.trim());
    }

    // يوقظنا النظام عند حدث واي فاي: نسجّل الدخول أو الخروج فورًا في الخلفية ثم نشغّل الخدمة الأمامية
    static void onWake(Context c) {
        onWake(c, true);
    }

    static void onWake(Context c, boolean cnt) {
        if (!isOn(c)) return;
        long t = System.currentTimeMillis();
        if (cnt) count(c, t);

        if (wifiUp(c)) {
            SharedPreferences p = prefs(c);
            if (!"c".equals(state(c)) && p.getLong("pend_t", 0) == 0) {
                p.edit().putLong("pend_t", t).commit();
            }
            boolean root = useRoot(c);
            String[] r = root ? readWifiRoot() : null;
            if (r != null && isOtherNetwork(c, r[0])) {
                // شبكة معروفة وليست من شبكات العمل: إن كان هناك اتصال عمل مفتوح نغلقه ولا نشغّل الخدمة
                p.edit().remove("pend_t").commit();
                if ("c".equals(state(c))) {
                    try {
                        onDisconnected(c, t, 1);
                    } catch (Exception e) {
                        // تجاهل
                    }
                }
                return;
            }
            try {
                long pt = p.getLong("pend_t", 0);
                long ct = (pt > 0 && t - pt < 60000) ? pt : t;
                int fl = 0;
                long est = p.getLong("est_t", 0);
                if (est > 0) {
                    ct = est;
                    fl = 1;
                }
                onConnected(c, ct, r == null ? null : r[0], r == null ? null : r[1], fl);
            } catch (Exception e) {
                // تجاهل
            }
            if (!WifiWatchService.running) {
                startSvc(c);
            }
        } else {
            // انقطع الواي فاي والخدمة غير شغالة: نتحقق بعد لحظة ثم نسجّل الخروج مباشرة
            if (!WifiWatchService.running && "c".equals(state(c))) {
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException e) {
                    return;
                }
                if (!wifiUp(c) && "c".equals(state(c))) {
                    try {
                        prefs(c).edit().remove("pend_t").commit();
                        onDisconnected(c, t, 0);
                    } catch (Exception e) {
                        // تجاهل
                    }
                }
            }
        }
    }

    // استثناء التطبيق من قيود الخلفية والبطارية في أندرويد 17 بالروت
    static String exemptBatteryNow(Context c) {
        String pkg = c.getPackageName();
        String cmd = "dumpsys deviceidle whitelist +" + pkg + "; "
                + "cmd appops set " + pkg + " RUN_ANY_IN_BACKGROUND allow; "
                + "cmd appops set " + pkg + " RUN_IN_BACKGROUND allow; "
                + "cmd appops set " + pkg + " START_FOREGROUND allow; "
                + "cmd appops set " + pkg + " WAKE_LOCK allow; "
                + "am set-standby-bucket " + pkg + " active";
        String a = su(cmd, 8000);
        if (a != null && a.contains(pkg)) {
            prefs(c).edit().putLong("bat_t", System.currentTimeMillis()).commit();
        }
        return a;
    }

    static void exemptBattery(Context c) {
        try {
            SharedPreferences p = prefs(c);
            long now = System.currentTimeMillis();
            if (now - p.getLong("bat_t", 0) < 12L * 3600 * 1000) return;
            exemptBatteryNow(c);
        } catch (Exception e) {
            // تجاهل
        }
    }

    static void restart(Context c) {
        stop(c);
        start(c);
    }

    // أمر ثابت فقط: لا يدخل أي نص من الواجهة في أمر الروت أبدًا
    static String su(String cmd, final long timeoutMs) {
        try {
            final Process p = new ProcessBuilder("su", "-c", cmd).redirectErrorStream(true).start();
            Thread k = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Thread.sleep(timeoutMs);
                    } catch (InterruptedException e) {
                        return;
                    }
                    p.destroy();
                }
            });
            k.setDaemon(true);
            k.start();
            StringBuilder sb = new StringBuilder();
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String line;
            while ((line = r.readLine()) != null && sb.length() < 4000) sb.append(line).append('\n');
            k.interrupt();
            p.destroy();
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean validSsid(String s) {
        if (s == null) return false;
        String t = s.trim();
        return !t.isEmpty() && !"<unknown ssid>".equalsIgnoreCase(t) && !"0x".equalsIgnoreCase(t);
    }

    // يرجع {الاسم, BSSID} للشبكة المتصلة الآن، متوافق مع أندرويد 16 و17
    static String[] readWifiRoot() {
        for (int i = 0; i < 4; i++) {
            String out = su("cmd wifi status 2>/dev/null; dumpsys wifi | grep -E -m2 'mWifiInfo|WifiInfo'", 3500);
            if (out != null) {
                Matcher m = INFO.matcher(out);
                while (m.find()) {
                    String ssid = m.group(1);
                    String bssid = m.group(2).toLowerCase();
                    if (validSsid(ssid) && !"02:00:00:00:00:00".equals(bssid)) {
                        return new String[]{ssid, bssid};
                    }
                }
                Matcher mc = CMD_SSID.matcher(out);
                if (mc.find() && validSsid(mc.group(1))) {
                    Matcher mb = CMD_BSSID.matcher(out);
                    String bssid = mb.find() ? mb.group(1).toLowerCase() : "";
                    return new String[]{mc.group(1), bssid};
                }
                Matcher mu = INFO_UNQUOTED.matcher(out);
                while (mu.find()) {
                    String ssid = mu.group(1);
                    String bssid = mu.group(2).toLowerCase();
                    if (validSsid(ssid) && !"02:00:00:00:00:00".equals(bssid)) {
                        return new String[]{ssid, bssid};
                    }
                }
            }
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                break;
            }
        }
        return null;
    }

    static void count(Context c, long t) {
        SharedPreferences s = prefs(c);
        s.edit().putInt("cb_n", s.getInt("cb_n", 0) + 1).putLong("cb_t", t).commit();
    }

    // يصفّر الحالة ويعيد تشغيل المراقبة ليلتقط الاتصال الحالي
    static void reset(Context c) {
        synchronized (LOCK) {
            prefs(c).edit().putString("state", "d").putString("ssid", "").remove("conn_t").remove("pend_t").commit();
        }
        restart(c);
    }

    static String state(Context c) {
        return prefs(c).getString("state", "d");
    }

    // اتصال بالواي فاي. flag=1 يعني أن الوقت تقريبي
    static void onConnected(Context c, long t, String ssid, String bssid, int flag) throws Exception {
        SharedPreferences s = prefs(c);
        synchronized (LOCK) {
            String st = s.getString("state", "d");
            String last = s.getString("ssid", "");
            if ("c".equals(st)) {
                if (ssid == null) return;
                if (last.isEmpty()) {
                    patchLast(s, ssid, bssid);
                    s.edit().putString("ssid", ssid).commit();
                    return;
                }
                if (ssid.equals(last)) return;
                add(s, t, "d", null, null, flag);
            }
            add(s, t, "c", ssid, bssid, flag);
            s.edit().putString("state", "c").putString("ssid", ssid == null ? "" : ssid).putLong("conn_t", t).commit();
        }
    }

    // انقطاع الواي فاي
    static void onDisconnected(Context c, long t, int flag) throws Exception {
        SharedPreferences s = prefs(c);
        synchronized (LOCK) {
            if (!"c".equals(s.getString("state", "d"))) return;
            add(s, t, "d", null, null, flag);
            s.edit().putString("state", "d").putString("ssid", "").remove("conn_t").remove("pend_t").commit();
        }
    }

    // يملأ اسم الشبكة في آخر حدث اتصال إن كان فارغًا
    private static void patchLast(SharedPreferences s, String ssid, String bssid) throws Exception {
        JSONArray a = new JSONArray(s.getString("events", "[]"));
        for (int i = a.length() - 1; i >= 0; i--) {
            JSONObject o = a.getJSONObject(i);
            if ("c".equals(o.optString("k"))) {
                if (!o.has("s")) {
                    o.put("s", ssid);
                    if (bssid != null) o.put("b", bssid);
                    s.edit().putString("events", a.toString()).commit();
                }
                return;
            }
        }
    }

    // يُستدعى عند إقلاع الجهاز: إن كان الاتصال مفتوحًا نغلقه بوقت الإقلاع (تقريبي)
    static void closeAtBoot(Context c) {
        try {
            SharedPreferences s = prefs(c);
            synchronized (LOCK) {
                if ("c".equals(s.getString("state", "d"))) {
                    add(s, System.currentTimeMillis(), "d", null, null, 2);
                    s.edit().putString("state", "d").putString("ssid", "").remove("conn_t").remove("pend_t").commit();
                }
            }
        } catch (Exception e) {
            // تجاهل
        }
    }

    private static void add(SharedPreferences s, long t, String k, String ssid, String bssid, int flag) throws Exception {
        JSONArray a = new JSONArray(s.getString("events", "[]"));
        JSONObject o = new JSONObject();
        o.put("t", t);
        o.put("k", k);
        if (ssid != null) o.put("s", ssid);
        if (bssid != null) o.put("b", bssid);
        if (flag != 0) o.put("l", flag);
        a.put(o);
        JSONArray out = a;
        if (a.length() > MAX_EVENTS) {
            out = new JSONArray();
            for (int i = a.length() - MAX_EVENTS; i < a.length(); i++) out.put(a.get(i));
        }
        s.edit().putString("events", out.toString()).commit();
    }
}
