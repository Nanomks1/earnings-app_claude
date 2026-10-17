package com.pd.earnings;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WifiEventReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pr = goAsync();
        WifiTracker.onChange(context, new Runnable() {
            @Override
            public void run() {
                pr.finish();
            }
        });
    }
}
