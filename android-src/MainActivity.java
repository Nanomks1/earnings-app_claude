package com.pd.earnings;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafBackupPlugin.class);
        registerPlugin(BioPlugin.class);
        registerPlugin(WorkWidgetPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(WifiProbePlugin.class);
        registerPlugin(WifiTrackPlugin.class);
        super.onCreate(savedInstanceState);
        WifiTracker.register(this);
    }
}
