package com.pd.earnings;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

// ودجت «المجموع الكامل»: للقراءة فقط، يفتح التطبيق عند الضغط، ويتبع خلفية ولون ودجت الدخول
public class TotalWidgetProvider extends AppWidgetProvider {

    static void draw(Context c, AppWidgetManager m, int id) {
        SharedPreferences p = WorkWidgetProvider.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.work_total_widget);
        int bg = p.getInt("wBg2", 0);
        int fg = p.getInt("wFg2", 0);
        int[] bgs = {R.drawable.work_widget_bg, R.drawable.work_widget_bg_glass, R.drawable.work_widget_bg_none, R.drawable.work_widget_bg_dark};
        v.setInt(R.id.work_t_root, "setBackgroundResource", bgs[bg < 0 || bg > 3 ? 0 : bg]);
        int col = fg == 1 ? 0xFFFFFFFF : (fg == 2 ? 0xFF111111 : c.getColor(R.color.work_w_fg));
        String txt = p.getString("totTxt", "");
        boolean show = p.getBoolean("totShow", true);
        v.setTextViewText(R.id.work_t_value, !show ? "\u2022\u2022\u2022\u2022" : (txt.isEmpty() ? "\u2014" : txt));
        v.setTextColor(R.id.work_t_value, col);
        v.setTextColor(R.id.work_t_label, (col & 0x00FFFFFF) | 0xB3000000);
        Intent li = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (li != null) {
            v.setOnClickPendingIntent(R.id.work_t_root, PendingIntent.getActivity(c, 2, li, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        m.updateAppWidget(id, v);
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TotalWidgetProvider.class));
        for (int id : ids) draw(c, m, id);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) draw(c, m, id);
    }
}
