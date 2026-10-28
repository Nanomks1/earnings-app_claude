package com.pd.earnings;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WifiTrack")
public class WifiTrackPlugin extends Plugin {

    // قائمة شبكات العمل (حتى 6)؛ الشبكة المعتمدة قديمًا تنتقل تلقائيًا إلى القائمة
    static java.util.ArrayList<String> workList(SharedPreferences s) {
        java.util.ArrayList<String> l = new java.util.ArrayList<String>();
        try {
            org.json.JSONArray a = new org.json.JSONArray(s.getString("work_list", "[]"));
            for (int i = 0; i < a.length(); i++) {
                String v = a.optString(i, "").trim();
                if (!v.isEmpty() && !l.contains(v)) l.add(v);
            }
        } catch (Exception e) {
        }
        if (l.isEmpty()) {
            String w = s.getString("work_ssid", "").trim();
            if (!w.isEmpty()) l.add(w);
        }
        return l;
    }

    static String listJson(java.util.ArrayList<String> l) {
        return new org.json.JSONArray(l).toString();
    }

    @PluginMethod
    public void getConfig(PluginCall call) {
        SharedPreferences s = WifiTracker.prefs(getContext());
        JSObject o = new JSObject();
        o.put("on", s.getBoolean("on", false));
        o.put("root", s.getBoolean("root", false));
        o.put("workSsid", s.getString("work_ssid", ""));
        o.put("workBssid", s.getString("work_bssid", ""));
        o.put("workList", listJson(workList(s)));
        o.put("state", s.getString("state", "d"));
        o.put("cbN", s.getInt("cb_n", 0));
        o.put("cbT", (double) s.getLong("cb_t", 0));
        call.resolve(o);
    }

    @PluginMethod
    public void setConfig(final PluginCall call) {
        final Context c = getContext();
        final Boolean on = call.getBoolean("on", null);
        final Boolean root = call.getBoolean("root", null);
        new Thread(new Runnable() {
            @Override
            public void run() {
                SharedPreferences s = WifiTracker.prefs(c);
                if (root != null) {
                    if (root.booleanValue()) {
                        String r = WifiTracker.su("id", 8000);
                        if (r == null || !r.contains("uid=0")) {
                            call.reject("no-root");
                            return;
                        }
                    }
                    s.edit().putBoolean("root", root.booleanValue()).commit();
                }
                if (on != null) {
                    s.edit().putBoolean("on", on.booleanValue()).putString("state", "d").putString("ssid", "").commit();
                    if (on.booleanValue()) {
                        askNotif();
                        WifiTracker.restart(c);
                    } else {
                        WifiTracker.stop(c);
                    }
                }
                call.resolve();
            }
        }).start();
    }

    // إذن الإشعارات (أندرويد 13+) كي يظهر إشعار الخدمة
    private void askNotif() {
        try {
            if (Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                getActivity().runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        getActivity().requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 77);
                    }
                });
            }
        } catch (Exception e) {
            // تجاهل
        }
    }

    // يستثني التطبيق من توفير البطارية وقيود الخلفية بالروت (أوامر ثابتة)
    @PluginMethod
    public void batteryExempt(final PluginCall call) {
        final Context c = getContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (!WifiTracker.useRoot(c)) {
                    call.reject("root-off");
                    return;
                }
                String a = WifiTracker.exemptBatteryNow(c);
                if (a != null && a.contains(c.getPackageName())) call.resolve();
                else call.reject("failed");
            }
        }).start();
    }

    @PluginMethod
    public void markWork(final PluginCall call) {
        final Context c = getContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                if (!WifiTracker.useRoot(c)) {
                    call.reject("root-off");
                    return;
                }
                String[] r = WifiTracker.readWifiRoot();
                if (r == null) {
                    call.reject("no-wifi");
                    return;
                }
                String name = r[0] == null ? "" : r[0].trim();
                if (name.isEmpty()) {
                    call.reject("no-wifi");
                    return;
                }
                SharedPreferences ws = WifiTracker.prefs(c);
                java.util.ArrayList<String> wl = workList(ws);
                if (!wl.contains(name)) {
                    if (wl.size() >= 6) {
                        call.reject("full");
                        return;
                    }
                    wl.add(name);
                }
                ws.edit().putString("work_list", listJson(wl)).putString("work_ssid", name).putString("work_bssid", r[1]).commit();
                JSObject o = new JSObject();
                o.put("ssid", r[0]);
                o.put("bssid", r[1]);
                call.resolve(o);
            }
        }).start();
    }

    @PluginMethod
    public void removeWork(PluginCall call) {
        String ssid = call.getString("ssid");
        if (ssid == null) {
            call.reject("bad");
            return;
        }
        SharedPreferences ws = WifiTracker.prefs(getContext());
        java.util.ArrayList<String> wl = workList(ws);
        wl.remove(ssid.trim());
        SharedPreferences.Editor ed = ws.edit().putString("work_list", listJson(wl));
        if (wl.isEmpty()) ed.putString("work_ssid", "").putString("work_bssid", "");
        ed.commit();
        call.resolve();
    }

    @PluginMethod
    public void getEvents(PluginCall call) {
        JSObject o = new JSObject();
        o.put("json", WifiTracker.prefs(getContext()).getString("events", "[]"));
        call.resolve(o);
    }

    @PluginMethod
    public void clearEvents(PluginCall call) {
        WifiTracker.prefs(getContext()).edit().remove("events").commit();
        WifiTracker.reset(getContext());
        call.resolve();
    }
}
