package com.pd.earnings;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class WorkWidgetProvider extends AppWidgetProvider {
    static final String ACT = "com.pd.earnings.WIDGET_TOGGLE";
    static final String REVERT = "com.pd.earnings.WIDGET_REVERT";
    static final long ARM_MS = 60000;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("work_widget", Context.MODE_PRIVATE);
    }

    static String fmt(String pattern, long t) {
        return new SimpleDateFormat(pattern, Locale.US).format(new Date(t));
    }

    static void toggle(Context c) {
        synchronized (WorkWidgetProvider.class) {
            SharedPreferences p = prefs(c);
            long now = System.currentTimeMillis();
            JSONArray ev;
            try {
                ev = new JSONArray(p.getString("events", "[]"));
            } catch (JSONException e) {
                ev = new JSONArray();
            }
            try {
                JSONObject o = new JSONObject();
                SharedPreferences.Editor ed = p.edit();
                if (p.getBoolean("open", false)) {
                    o.put("t", "out");
                    o.put("date", p.getString("date", ""));
                    o.put("start", p.getString("start", ""));
                    o.put("startTs", p.getLong("startTs", now));
                    o.put("end", fmt("HH:mm", now));
                    o.put("endTs", now);
                    ed.putBoolean("open", false);
                } else {
                    o.put("t", "in");
                    o.put("date", fmt("yyyy-MM-dd", now));
                    o.put("start", fmt("HH:mm", now));
                    o.put("startTs", now);
                    ed.putBoolean("open", true);
                    ed.putString("date", fmt("yyyy-MM-dd", now));
                    ed.putString("start", fmt("HH:mm", now));
                    ed.putLong("startTs", now);
                }
                ev.put(o);
                ed.putString("events", ev.toString());
                ed.commit();
            } catch (JSONException e) {
                // لا شيء
            }
        }
    }

    static void draw(Context c, AppWidgetManager m, int id) {
        SharedPreferences p = prefs(c);
        boolean open = p.getBoolean("open", false);
        long armed = p.getLong("armedAt", 0);
        boolean arm = armed > 0 && System.currentTimeMillis() - armed <= ARM_MS;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.work_widget);
        v.setTextViewText(R.id.work_w_title, arm ? "تأكيد" : (open ? "خروج" : "دخول"));
        v.setImageViewResource(R.id.work_w_icon, arm ? R.drawable.work_w_check : (open ? R.drawable.work_w_stop : R.drawable.work_w_play));
        v.setInt(R.id.work_w_root, "setBackgroundResource", arm ? R.drawable.work_widget_bg_on : R.drawable.work_widget_bg);
        Intent i = new Intent(c, WorkWidgetProvider.class);
        i.setAction(ACT);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.work_w_root, pi);
        m.updateAppWidget(id, v);
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, WorkWidgetProvider.class));
        for (int id : ids) draw(c, m, id);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) draw(c, m, id);
    }

    @Override
    public void onReceive(final Context c, Intent i) {
        super.onReceive(c, i);
        if (i == null) return;
        if (REVERT.equals(i.getAction())) {
            SharedPreferences rp = prefs(c);
            long ra = rp.getLong("armedAt", 0);
            if (ra > 0 && System.currentTimeMillis() - ra > ARM_MS - 2000) {
                rp.edit().putLong("armedAt", 0).commit();
            }
            refreshAll(c);
            return;
        }
        if (!ACT.equals(i.getAction())) return;
        SharedPreferences p = prefs(c);
        final long now = System.currentTimeMillis();
        long armed = p.getLong("armedAt", 0);
        if (armed > 0 && now - armed <= ARM_MS) {
            p.edit().putLong("armedAt", 0).commit();
            toggle(c);
            refreshAll(c);
        } else {
            p.edit().putLong("armedAt", now).commit();
            refreshAll(c);
            try {
                AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                Intent ri = new Intent(c, WorkWidgetProvider.class);
                ri.setAction(REVERT);
                PendingIntent rpi = PendingIntent.getBroadcast(c, 1, ri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.set(AlarmManager.RTC, now + ARM_MS, rpi);
            } catch (Exception e) {
                // لا شيء
            }

        }
    }
}
