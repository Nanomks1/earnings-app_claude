package com.pd.earnings;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WifiTrack")
public class WifiTrackPlugin extends Plugin {

    @PluginMethod
    public void getConfig(PluginCall call) {
        SharedPreferences s = WifiTracker.prefs(getContext());
        JSObject o = new JSObject();
        o.put("on", s.getBoolean("on", false));
        o.put("root", s.getBoolean("root", false));
        o.put("workSsid", s.getString("work_ssid", ""));
        o.put("workBssid", s.getString("work_bssid", ""));
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
                    s.edit().putBoolean("on", on.booleanValue()).putString("state", "d").putString("ssid", "").remove("net").commit();
                    WifiTracker.register(c);
                }
                call.resolve();
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
                WifiTracker.prefs(c).edit().putString("work_ssid", r[0]).putString("work_bssid", r[1]).commit();
                JSObject o = new JSObject();
                o.put("ssid", r[0]);
                o.put("bssid", r[1]);
                call.resolve(o);
            }
        }).start();
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
