package com.pd.earnings;

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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

// تتبع اتصال/انقطاع الواي فاي في خانة منفصلة عن السجل. الأحداث تُخزَّن في SharedPreferences.
final class WifiTracker {
    static final String ACTION_WAKE = "com.pd.earnings.WIFI_WAKE";
    private static final String PREFS = "wifi_track";
    private static final int MAX_EVENTS = 400;
    private static final Pattern INFO = Pattern.compile("SSID: \"(.*?)\", BSSID: ([0-9a-fA-F:]{17})");
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

    // تشغيل التتبع: تسجيل استيقاظ النظام عند اتصال الواي فاي (يبقى حتى لو أُغلقت الخدمة)، وبدء الخدمة إن كان الواي فاي متصلًا الآن
    static void start(final Context c) {
        if (!isOn(c)) return;
        registerWake(c);
        if (useRoot(c)) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    exemptBattery(c);
                }
            }).start();
        }
        if (wifiUp(c)) startSvc(c);
    }

    private static void startSvc(Context c) {
        try {
            Context a = c.getApplicationContext();
            Intent i = new Intent(a, WifiWatchService.class);
            if (Build.VERSION.SDK_INT >= 26) a.startForegroundService(i);
            else a.startService(i);
        } catch (Exception e) {
            // قد يرفض النظام البدء من الخلفية؛ تبدأ عند فتح التطبيق
        }
    }

    static void stop(Context c) {
        unregisterWake(c);
        try {
            Context a = c.getApplicationContext();
            a.stopService(new Intent(a, WifiWatchService.class));
        } catch (Exception e) {
            // تجاهل
        }
    }

    private static int mut() {
        return Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
    }

    private static PendingIntent wakePi(Context a, int flags) {
        Intent i = new Intent(a, WifiBootReceiver.class);
        i.setAction(ACTION_WAKE);
        return PendingIntent.getBroadcast(a, 11, i, flags);
    }

    // يطلب من النظام إيقاظ التطبيق عند ظهور شبكة واي فاي (يبقى التسجيل عند النظام ما دام الجهاز يعمل)
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
            NetworkRequest rq = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            cm.registerNetworkCallback(rq, pi);
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

    // يوقظنا النظام عند حدث واي فاي: إن كان متصلًا ولا توجد خدمة تعمل نسجّل الوقت ونبدأ الخدمة
    static void onWake(Context c) {
        if (!isOn(c)) return;
        long t = System.currentTimeMillis();
        count(c, t);
        if (WifiWatchService.running || !wifiUp(c)) return;
        prefs(c).edit().putLong("pend_t", t).commit();
        startSvc(c);
    }

    // استثناء التطبيق من توفير البطارية بالروت (أوامر ثابتة)، مرة كل 12 ساعة كحد أقصى
    static void exemptBattery(Context c) {
        try {
            SharedPreferences p = prefs(c);
            long now = System.currentTimeMillis();
            if (now - p.getLong("bat_t", 0) < 12L * 3600 * 1000) return;
            String pkg = c.getPackageName();
            String a = su("dumpsys deviceidle whitelist +" + pkg, 8000);
            su("cmd appops set " + pkg + " RUN_ANY_IN_BACKGROUND allow", 8000);
            if (a != null && a.contains(pkg)) p.edit().putLong("bat_t", now).commit();
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

    // يرجع {الاسم, BSSID} للشبكة المتصلة الآن، أو null
    static String[] readWifiRoot() {
        for (int i = 0; i < 3; i++) {
            String out = su("dumpsys wifi | grep -m1 \"mWifiInfo.*Supplicant state: COMPLETED\"", 3000);
            if (out != null) {
                Matcher m = INFO.matcher(out);
                if (m.find()) return new String[]{m.group(1), m.group(2).toLowerCase()};
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
            prefs(c).edit().putString("state", "d").putString("ssid", "").commit();
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
            s.edit().putString("state", "c").putString("ssid", ssid == null ? "" : ssid).commit();
        }
    }

    // انقطاع الواي فاي
    static void onDisconnected(Context c, long t, int flag) throws Exception {
        SharedPreferences s = prefs(c);
        synchronized (LOCK) {
            if (!"c".equals(s.getString("state", "d"))) return;
            add(s, t, "d", null, null, flag);
            s.edit().putString("state", "d").putString("ssid", "").commit();
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
                    s.edit().putString("state", "d").putString("ssid", "").commit();
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
