package com.pd.earnings;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.os.Build;
import java.util.Arrays;

// اختصارات الأيقونة (ضغطة مطولة): دخول / خروج. تفتح التطبيق، وهو ينفّذ الإجراء بعد تأكيدك
final class Shortcuts {
    static final String IN = "com.pd.earnings.SC_IN";
    static final String OUT = "com.pd.earnings.SC_OUT";

    private static Icon glyph(Context c, int res, int bg) {
        int s = 192;
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(bg);
        cv.drawCircle(s / 2f, s / 2f, s / 2f, p);
        Drawable d = c.getDrawable(res);
        if (d != null) {
            int pad = s / 4;
            d.setBounds(pad, pad, s - pad, s - pad);
            d.draw(cv);
        }
        return Icon.createWithBitmap(b);
    }

    private static ShortcutInfo make(Context c, String id, String action, String shortLabel, String longLabel, int res, int bg, int rank) {
        Intent i = new Intent(action);
        i.setClass(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return new ShortcutInfo.Builder(c, id)
                .setShortLabel(shortLabel)
                .setLongLabel(longLabel)
                .setIcon(glyph(c, res, bg))
                .setRank(rank)
                .setIntent(i)
                .build();
    }

    static void publish(Context c) {
        if (Build.VERSION.SDK_INT < 25) return;
        try {
            ShortcutManager sm = c.getSystemService(ShortcutManager.class);
            if (sm == null) return;
            sm.setDynamicShortcuts(Arrays.asList(
                    make(c, "sc_in", IN, "دخول", "تسجيل دخول العمل", R.drawable.work_w_play_s, 0xFF7CB342, 0),
                    make(c, "sc_out", OUT, "خروج", "تسجيل خروج العمل", R.drawable.work_w_stop_s, 0xFFD32F2F, 1)));
        } catch (Exception e) {
            // لا شيء
        }
    }

    // يحفظ الإجراء المطلوب ليأخذه التطبيق (JS) عند جاهزيته، ثم يُفرغ النيّة كي لا يتكرر
    static void capture(Context c, Intent i) {
        if (i == null || i.getAction() == null) return;
        String a = i.getAction();
        if (IN.equals(a) || OUT.equals(a)) {
            WorkWidgetProvider.prefs(c).edit().putString("sc", IN.equals(a) ? "in" : "out").commit();
            i.setAction(Intent.ACTION_MAIN);
        }
    }
}
