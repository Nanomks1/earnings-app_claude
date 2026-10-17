package com.pd.earnings;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WifiBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) WifiTracker.closeAtBoot(context);
        WifiTracker.start(context);
    }
}
