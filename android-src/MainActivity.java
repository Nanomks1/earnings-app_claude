package com.pd.earnings;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafBackupPlugin.class);
        registerPlugin(BioPlugin.class);
        registerPlugin(WorkWidgetPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(WifiTrackPlugin.class);
        super.onCreate(savedInstanceState);
        WifiTracker.start(this);
        Shortcuts.publish(this);
        Shortcuts.capture(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Shortcuts.capture(this, intent);
    }
}
