package com.pd.earnings;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class WorkWidgetProvider extends AppWidgetProvider {
    static final String ACT = "com.pd.earnings.WIDGET_TOGGLE";
    static final String REVERT = "com.pd.earnings.WIDGET_REVERT";
    static final long ARM_MS = 10000;
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static Runnable revertTask;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("work_widget", Context.MODE_PRIVATE);
    }

    // رمز سرّي ثابت يُرفق بنيّة الضغط، فلا يستطيع تطبيق آخر قلب الدخول/الخروج
    static String tok(Context c) {
        SharedPreferences p = prefs(c);
        String t = p.getString("tok", "");
        if (t.isEmpty()) {
            t = java.util.UUID.randomUUID().toString();
            p.edit().putString("tok", t).commit();
        }
        return t;
    }

    static String fmt(String pattern, long t) {
        return new SimpleDateFormat(pattern, Locale.US).format(new Date(t));
    }

    private static int hmToMin(String hm) {
        if (hm == null) return -1;
        String[] parts = hm.split(":");
        if (parts.length != 2) return -1;
        try {
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (Exception e) {
            return -1;
        }
    }

    private static String fmtMoney(double v, String cur) {
        NumberFormat nf = NumberFormat.getNumberInstance(Locale.US);
        nf.setMaximumFractionDigits(2);
        nf.setMinimumFractionDigits(0);
        String s = (v < 0 ? "\u2212" : "") + nf.format(Math.abs(v));
        if (cur != null && !cur.trim().isEmpty()) s += " " + cur.trim();
        return s;
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
                    String startStr = p.getString("start", "");
                    String endStr = fmt("HH:mm", now);
                    long startTs = p.getLong("startTs", now);
                    o.put("t", "out");
                    o.put("date", p.getString("date", ""));
                    o.put("start", startStr);
                    o.put("startTs", startTs);
                    o.put("end", endStr);
                    o.put("endTs", now);
                    ed.putBoolean("open", false);

                    // تحديث ودجت المجموع مباشرة عند تسجيل الخروج من الودجت
                    int sMin = hmToMin(startStr);
                    int eMin = hmToMin(endStr);
                    int mins = (sMin >= 0 && eMin >= 0)
                            ? (eMin >= sMin ? (eMin - sMin) : (eMin + 1440 - sMin))
                            : (int) Math.round((now - startTs) / 60000.0);
                    int brk = p.getInt("openBrk", 0);
                    if (brk >= mins || brk < 0) brk = 0;
                    int netMins = mins - brk;
                    if (netMins > 0 && mins <= 16 * 60 && p.getBoolean("hasTotVal", false)) {
                        float rate = p.getFloat("rate", 10f);
                        double newTot = p.getFloat("totVal", 0f) + (netMins / 60.0) * rate;
                        ed.putFloat("totVal", (float) newTot);
                        ed.putString("totTxt", fmtMoney(newTot, p.getString("cur", "DH")));
                    }
                    ed.putInt("openBrk", 0);
                } else {
                    o.put("t", "in");
                    o.put("date", fmt("yyyy-MM-dd", now));
                    o.put("start", fmt("HH:mm", now));
                    o.put("startTs", now);
                    ed.putBoolean("open", true);
                    ed.putString("date", fmt("yyyy-MM-dd", now));
                    ed.putString("start", fmt("HH:mm", now));
                    ed.putLong("startTs", now);
                    ed.putInt("openBrk", 0);
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
        if (!p.getBoolean("wOn", true)) {
            // الودجت معطّل: رمادي بلا استجابة للمس؛ الدخول الجاري يبقى محفوظًا
            int[] oi = {R.id.work_w_icon_a, R.id.work_w_icon_w, R.id.work_w_icon_k};
            int[] ot = {R.id.work_w_title_a, R.id.work_w_title_w, R.id.work_w_title_k};
            for (int k = 0; k < 3; k++) {
                v.setViewVisibility(oi[k], View.GONE);
                v.setViewVisibility(ot[k], k == 0 ? View.VISIBLE : View.GONE);
            }
            v.setTextViewText(ot[0], "معطّل");
            v.setTextColor(ot[0], 0xFF9E9E9E);
            v.setInt(R.id.work_w_root, "setBackgroundResource", R.drawable.work_widget_bg_dark);
            m.updateAppWidget(id, v);
            return;
        }
        int bg = p.getInt("wBg2", 0);
        int fg = arm ? 1 : p.getInt("wFg2", 0);
        int set = p.getInt("wIc", 0);
        int kind = arm ? 2 : (open ? 1 : 0);
        int[][] glyphs = {
            {R.drawable.work_w_play, R.drawable.work_w_stop, R.drawable.work_w_check},
            {R.drawable.work_w_play_s, R.drawable.work_w_stop_s, R.drawable.work_w_check_s},
            {R.drawable.work_w_play_r, R.drawable.work_w_stop_r, R.drawable.work_w_check_r}
        };
        int icon = glyphs[set < 0 || set > 2 ? 0 : set][kind];
        int[] bgs = {R.drawable.work_widget_bg, R.drawable.work_widget_bg_glass, R.drawable.work_widget_bg_none, R.drawable.work_widget_bg_dark};
        int bgRes = arm ? R.drawable.work_widget_bg_on : bgs[bg < 0 || bg > 3 ? 0 : bg];
        int[] icons = {R.id.work_w_icon_a, R.id.work_w_icon_w, R.id.work_w_icon_k};
        int[] titles = {R.id.work_w_title_a, R.id.work_w_title_w, R.id.work_w_title_k};
        boolean label = p.getBoolean("wLabel", true);
        String txt = arm ? "تأكيد" : (open ? "خروج" : "دخول");
        for (int k = 0; k < 3; k++) {
            boolean on = k == (fg < 0 || fg > 2 ? 0 : fg);
            v.setImageViewResource(icons[k], icon);
            v.setViewVisibility(icons[k], on ? View.VISIBLE : View.GONE);
            v.setTextViewText(titles[k], txt);
            v.setViewVisibility(titles[k], on && label ? View.VISIBLE : View.GONE);
        }
        v.setInt(R.id.work_w_root, "setBackgroundResource", bgRes);
        Intent i = new Intent(c, WorkWidgetProvider.class);
        i.setAction(ACT);
        i.putExtra("tok", tok(c));
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
            if (ra > 0 && System.currentTimeMillis() - ra >= ARM_MS - 500) {
                rp.edit().putLong("armedAt", 0).commit();
            }
            refreshAll(c);
            return;
        }
        if (!ACT.equals(i.getAction())) return;
        if (!tok(c).equals(i.getStringExtra("tok"))) {
            refreshAll(c);
            return;
        }
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("wOn", true)) {
            refreshAll(c);
            return;
        }
        final long now = System.currentTimeMillis();
        long armed = p.getLong("armedAt", 0);
        if (armed > 0 && now - armed <= ARM_MS) {
            if (revertTask != null) {
                H.removeCallbacks(revertTask);
                revertTask = null;
            }
            p.edit().putLong("armedAt", 0).commit();
            toggle(c);
            refreshAll(c);
            TotalWidgetProvider.refreshAll(c);
        } else {
            p.edit().putLong("armedAt", now).commit();
            refreshAll(c);
            final Context app = c.getApplicationContext();
            if (revertTask != null) H.removeCallbacks(revertTask);
            revertTask = new Runnable() {
                @Override
                public void run() {
                    revertTask = null;
                    SharedPreferences sp = prefs(app);
                    if (sp.getLong("armedAt", 0) == now) {
                        sp.edit().putLong("armedAt", 0).commit();
                        refreshAll(app);
                    }
                }
            };
            H.postDelayed(revertTask, ARM_MS);
            try {
                AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                Intent ri = new Intent(c, WorkWidgetProvider.class);
                ri.setAction(REVERT);
                PendingIntent rpi = PendingIntent.getBroadcast(c, 1, ri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + ARM_MS + 1000, rpi);
            } catch (Exception e) {
                // لا شيء
            }
        }
    }
}
