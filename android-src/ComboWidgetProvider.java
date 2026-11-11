package com.pd.earnings;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

// ودجت «دخول + عنصر»: النصف الأيمن دخول/خروج (نفس منطق ودجت الدخول بالضبط)، والأيسر يفتح نافذة عنصر جديد
public class ComboWidgetProvider extends AppWidgetProvider {

    static void draw(Context c, AppWidgetManager m, int id) {
        SharedPreferences p = WorkWidgetProvider.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.work_combo_widget);
        boolean wOn = p.getBoolean("wOn", true);
        boolean open = p.getBoolean("open", false);
        long armed = p.getLong("armedAt", 0);
        boolean arm = wOn && armed > 0 && System.currentTimeMillis() - armed <= WorkWidgetProvider.ARM_MS;
        int bg = p.getInt("wBg2", 0);
        int fgPref = p.getInt("wFg2", 0);
        int set = p.getInt("wIc", 0);
        boolean label = p.getBoolean("wLabel", true);
        int[] bgs = {R.drawable.work_widget_bg, R.drawable.work_widget_bg_glass, R.drawable.work_widget_bg_none, R.drawable.work_widget_bg_dark};
        v.setInt(R.id.work_c_root, "setBackgroundResource", bgs[bg < 0 || bg > 3 ? 0 : bg]);

        int[] ci = {R.id.work_c_in_a, R.id.work_c_in_w, R.id.work_c_in_k};
        int[] ct = {R.id.work_c_in_ta, R.id.work_c_in_tw, R.id.work_c_in_tk};
        int[] ai = {R.id.work_c_add_a, R.id.work_c_add_w, R.id.work_c_add_k};
        int[] at = {R.id.work_c_add_ta, R.id.work_c_add_tw, R.id.work_c_add_tk};

        // نصف الدخول/الخروج
        if (!wOn) {
            // الودجت معطّل: هذا النصف رمادي بلا استجابة؛ نصف العنصر يبقى يعمل
            for (int k = 0; k < 3; k++) {
                v.setViewVisibility(ci[k], View.GONE);
                v.setViewVisibility(ct[k], k == 0 ? View.VISIBLE : View.GONE);
            }
            v.setTextViewText(ct[0], "معطّل");
            v.setTextColor(ct[0], 0xFF9E9E9E);
            v.setInt(R.id.work_c_in, "setBackgroundColor", 0);
        } else {
            boolean hot = arm || open;
            int fg = hot ? 1 : (fgPref < 0 || fgPref > 2 ? 0 : fgPref);
            int kind = arm ? 2 : (open ? 1 : 0);
            int[][] glyphs = {
                {R.drawable.work_w_play, R.drawable.work_w_stop, R.drawable.work_w_check},
                {R.drawable.work_w_play_s, R.drawable.work_w_stop_s, R.drawable.work_w_check_s},
                {R.drawable.work_w_play_r, R.drawable.work_w_stop_r, R.drawable.work_w_check_r}
            };
            int icon = glyphs[set < 0 || set > 2 ? 0 : set][kind];
            String txt = arm ? "تأكيد" : (open ? "خروج" : "دخول");
            for (int k = 0; k < 3; k++) {
                boolean on = k == fg;
                v.setImageViewResource(ci[k], icon);
                v.setViewVisibility(ci[k], on ? View.VISIBLE : View.GONE);
                v.setTextViewText(ct[k], txt);
                v.setViewVisibility(ct[k], on && label ? View.VISIBLE : View.GONE);
            }
            v.setTextColor(ct[0], c.getColor(R.color.work_w_fg));
            if (hot) v.setInt(R.id.work_c_in, "setBackgroundResource", R.drawable.work_c_half_on);
            else v.setInt(R.id.work_c_in, "setBackgroundColor", 0);
        }
        Intent ti = new Intent(c, WorkWidgetProvider.class);
        ti.setAction(WorkWidgetProvider.ACT);
        ti.putExtra("tok", WorkWidgetProvider.tok(c));
        v.setOnClickPendingIntent(R.id.work_c_in, PendingIntent.getBroadcast(c, 0, ti, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // نصف إضافة عنصر
        int afg = fgPref < 0 || fgPref > 2 ? 0 : fgPref;
        for (int k = 0; k < 3; k++) {
            v.setViewVisibility(ai[k], k == afg ? View.VISIBLE : View.GONE);
            v.setViewVisibility(at[k], k == afg && label ? View.VISIBLE : View.GONE);
        }
        v.setOnClickPendingIntent(R.id.work_c_add, PendingIntent.getActivity(c, 4, ItemWidgetProvider.openItem(c), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        m.updateAppWidget(id, v);
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, ComboWidgetProvider.class));
        for (int id : ids) draw(c, m, id);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) draw(c, m, id);
    }
}
