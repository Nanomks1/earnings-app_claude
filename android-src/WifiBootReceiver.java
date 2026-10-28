package com.pd.earnings;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

public class WifiBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        final String a = intent.getAction();
        if (a == null) return;

        final Context app = context.getApplicationContext();
        final PendingResult pr = goAsync();

        new Thread(new Runnable() {
            @Override
            public void run() {
                PowerManager.WakeLock wl = null;
                try {
                    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "earnings:wifi_wake");
                        wl.setReferenceCounted(false);
                        wl.acquire(15000L);
                    }
                    if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(a)) {
                        WifiTracker.closeAtBoot(app);
                        WifiTracker.start(app);
                    } else if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
                        WifiTracker.start(app);
                    } else if (WifiTracker.ACTION_POLL.equals(a)) {
                        WifiTracker.onPoll(app);
                    } else if (WifiTracker.ACTION_WAKE.equals(a)
                            || "android.net.wifi.STATE_CHANGE".equals(a)
                            || "android.net.conn.CONNECTIVITY_CHANGE".equals(a)) {
                        WifiTracker.onWake(app);
                    }
                } catch (Throwable e) {
                    // تجاهل
                } finally {
                    try {
                        if (wl != null && wl.isHeld()) wl.release();
                    } catch (Throwable e) {
                        // تجاهل
                    }
                    try {
                        pr.finish();
                    } catch (Throwable e) {
                        // تجاهل
                    }
                }
            }
        }).start();
    }
}
