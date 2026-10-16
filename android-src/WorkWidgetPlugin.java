package com.pd.earnings;

import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

@CapacitorPlugin(name = "WorkWidget")
public class WorkWidgetPlugin extends Plugin {

    @PluginMethod
    public void takeEvents(PluginCall call) {
        synchronized (WorkWidgetProvider.class) {
            SharedPreferences p = WorkWidgetProvider.prefs(getContext());
            JSArray arr;
            try {
                arr = new JSArray(p.getString("events", "[]"));
            } catch (JSONException e) {
                arr = new JSArray();
            }
            p.edit().putString("events", "[]").commit();
            JSObject o = new JSObject();
            o.put("events", arr);
            call.resolve(o);
        }
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        SharedPreferences.Editor e = WorkWidgetProvider.prefs(getContext()).edit();
        e.putInt("wBg2", call.getInt("bg", 0));
        e.putInt("wFg2", call.getInt("fg", 0));
        e.putInt("wIc", call.getInt("ic", 0));
        e.putBoolean("wLabel", Boolean.TRUE.equals(call.getBoolean("label", true)));
        e.commit();
        WorkWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setOpen(PluginCall call) {
        synchronized (WorkWidgetProvider.class) {
            SharedPreferences.Editor e = WorkWidgetProvider.prefs(getContext()).edit();
            boolean open = Boolean.TRUE.equals(call.getBoolean("open", false));
            e.putBoolean("open", open);
            e.putLong("armedAt", 0);
            if (open) {
                Double ts = call.getDouble("ts");
                e.putString("date", call.getString("date", ""));
                e.putString("start", call.getString("start", ""));
                e.putLong("startTs", ts == null ? System.currentTimeMillis() : ts.longValue());
            }
            e.commit();
        }
        WorkWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}
