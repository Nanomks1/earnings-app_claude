package com.pd.earnings;

import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "WorkWidget")
public class WorkWidgetPlugin extends Plugin {

    // يُرجع الأحداث دون مسحها؛ يمسحها التطبيق لاحقًا بـ ackEvents بعد التأكد من حفظها
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
            JSObject o = new JSObject();
            o.put("events", arr);
            call.resolve(o);
        }
    }

    @PluginMethod
    public void ackEvents(PluginCall call) {
        synchronized (WorkWidgetProvider.class) {
            SharedPreferences p = WorkWidgetProvider.prefs(getContext());
            HashSet<String> ks = new HashSet<String>();
            JSArray ka = call.getArray("keys");
            if (ka != null) {
                for (int i = 0; i < ka.length(); i++) ks.add(ka.optString(i));
            }
            try {
                JSONArray cur = new JSONArray(p.getString("events", "[]"));
                JSONArray keep = new JSONArray();
                for (int i = 0; i < cur.length(); i++) {
                    JSONObject o = cur.getJSONObject(i);
                    String t = o.optString("t");
                    String k = t + ":" + ("out".equals(t) ? o.optLong("endTs") : o.optLong("startTs"));
                    if (!ks.contains(k)) keep.put(o);
                }
                p.edit().putString("events", keep.toString()).commit();
            } catch (JSONException e) {
                // لا شيء
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        SharedPreferences.Editor e = WorkWidgetProvider.prefs(getContext()).edit();
        e.putInt("wBg2", call.getInt("bg", 0));
        e.putInt("wFg2", call.getInt("fg", 0));
        e.putInt("wIc", call.getInt("ic", 0));
        e.putBoolean("wLabel", Boolean.TRUE.equals(call.getBoolean("label", true)));
        e.putBoolean("wOn", !Boolean.FALSE.equals(call.getBoolean("on", true)));
        e.putBoolean("totShow", !Boolean.FALSE.equals(call.getBoolean("total", true)));
        e.commit();
        WorkWidgetProvider.refreshAll(getContext());
        TotalWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeShortcut(PluginCall call) {
        SharedPreferences p = WorkWidgetProvider.prefs(getContext());
        String a = p.getString("sc", "");
        if (!a.isEmpty()) p.edit().remove("sc").commit();
        JSObject r = new JSObject();
        r.put("act", a);
        call.resolve(r);
    }

    @PluginMethod
    public void setTotal(PluginCall call) {
        SharedPreferences.Editor e = WorkWidgetProvider.prefs(getContext()).edit();
        e.putString("totTxt", call.getString("text", ""));
        e.commit();
        TotalWidgetProvider.refreshAll(getContext());
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
                long ts = call.getData().optLong("ts", 0L); // getDouble يُرجع null للأرقام الكبيرة (Long)
                e.putString("date", call.getString("date", ""));
                e.putString("start", call.getString("start", ""));
                e.putLong("startTs", ts > 0 ? ts : System.currentTimeMillis());
            }
            e.commit();
        }
        WorkWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
}
