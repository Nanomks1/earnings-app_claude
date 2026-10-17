package com.pd.earnings;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

// تتبع اتصال/انقطاع الواي فاي في خانة منفصلة عن السجل. الأحداث تُخزَّن في SharedPreferences.
final class WifiTracker {
    private static final String PREFS = "wifi_track";
    private static final String ACTION = "com.pd.earnings.WIFI_CHANGE";
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

    private static PendingIntent pending(Context c) {
        Intent i = new Intent(c.getApplicationContext(), WifiEventReceiver.class).setAction(ACTION);
        return PendingIntent.getBroadcast(c.getApplicationContext(), 7, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    static void unregister(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            cm.unregisterNetworkCallback(pending(c));
        } catch (Exception e) {
            // لم يكن مسجَّلًا
        }
    }

    // يُسجَّل عند فتح التطبيق وعند إقلاع الجهاز وبعد التحديث، لأن النظام لا يحتفظ بالتسجيل بعد الإقلاع
    static void register(Context c) {
        unregister(c);
        if (!isOn(c)) return;
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkRequest rq = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            prefs(c).edit().putLong("reg_t", System.currentTimeMillis()).commit();
            cm.registerNetworkCallback(rq, pending(c));
        } catch (Exception e) {
            // يبقى التطبيق يعمل بدون تتبع
        }
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
        for (int i = 0; i < 2; i++) {
            String out = su("dumpsys wifi | grep -m1 \"mWifiInfo.*Supplicant state: COMPLETED\"", 6000);
            if (out != null) {
                Matcher m = INFO.matcher(out);
                if (m.find()) return new String[]{m.group(1), m.group(2).toLowerCase()};
            }
            try {
                Thread.sleep(1500);
            } catch (InterruptedException e) {
                break;
            }
        }
        return null;
    }

    private static boolean wifiConnected(Context c) {
        ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities nc = cm.getNetworkCapabilities(n);
            if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return true;
        }
        return false;
    }

    static void onChange(final Context c, final Runnable done) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    handle(c.getApplicationContext());
                } catch (Throwable t) {
                    // لا نُسقط التطبيق من مستقبِل في الخلفية
                } finally {
                    if (done != null) done.run();
                }
            }
        }).start();
    }

    private static void handle(Context c) throws Exception {
        if (!isOn(c)) return;
        long now = System.currentTimeMillis();
        SharedPreferences s = prefs(c);
        boolean wifi = wifiConnected(c);
        int flag = now - s.getLong("reg_t", 0) < 5000 ? 1 : 0;
        String ssid = null;
        String bssid = null;
        if (wifi && useRoot(c)) {
            String[] r = readWifiRoot();
            if (r != null) {
                ssid = r[0];
                bssid = r[1];
            }
        } else if (wifi && "c".equals(s.getString("state", "d"))) {
            return;
        }
        synchronized (LOCK) {
            String st = s.getString("state", "d");
            String last = s.getString("ssid", "");
            if (wifi) {
                boolean changed = "c".equals(st) && ssid != null && !last.isEmpty() && !ssid.equals(last);
                if ("c".equals(st) && !changed) return;
                if (changed) add(s, now, "d", null, null, flag);
                add(s, now, "c", ssid, bssid, flag);
                s.edit().putString("state", "c").putString("ssid", ssid == null ? "" : ssid).commit();
            } else if ("c".equals(st)) {
                add(s, now, "d", null, null, flag);
                s.edit().putString("state", "d").putString("ssid", "").commit();
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
