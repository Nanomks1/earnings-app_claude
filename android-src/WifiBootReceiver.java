package com.pd.earnings;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WifiBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)) {
            WifiTracker.closeAtBoot(context);
            WifiTracker.start(context);
        } else if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            WifiTracker.start(context);
        }
    }
}
