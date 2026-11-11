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

// ودجت «إضافة عنصر»: يفتح التطبيق مباشرة على نافذة عنصر جديد. يتبع خلفية ولون وتسمية ودجت الدخول
public class ItemWidgetProvider extends AppWidgetProvider {

    static void draw(Context c, AppWidgetManager m, int id) {
        SharedPreferences p = WorkWidgetProvider.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.work_item_widget);
        int bg = p.getInt("wBg2", 0);
        int fg = p.getInt("wFg2", 0);
        boolean label = p.getBoolean("wLabel", true);
        int[] bgs = {R.drawable.work_widget_bg, R.drawable.work_widget_bg_glass, R.drawable.work_widget_bg_none, R.drawable.work_widget_bg_dark};
        v.setInt(R.id.work_i_root, "setBackgroundResource", bgs[bg < 0 || bg > 3 ? 0 : bg]);
        int[] icons = {R.id.work_i_icon_a, R.id.work_i_icon_w, R.id.work_i_icon_k};
        int[] titles = {R.id.work_i_title_a, R.id.work_i_title_w, R.id.work_i_title_k};
        for (int k = 0; k < 3; k++) {
            boolean on = k == (fg < 0 || fg > 2 ? 0 : fg);
            v.setViewVisibility(icons[k], on ? View.VISIBLE : View.GONE);
            v.setViewVisibility(titles[k], on && label ? View.VISIBLE : View.GONE);
        }
        v.setOnClickPendingIntent(R.id.work_i_root, PendingIntent.getActivity(c, 3, openItem(c), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        m.updateAppWidget(id, v);
    }

    static Intent openItem(Context c) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction(Shortcuts.ITEM);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, ItemWidgetProvider.class));
        for (int id : ids) draw(c, m, id);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) draw(c, m, id);
    }
}
