package com.pd.earnings;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        try {
            String id = call.getString("id");
            if (id == null || !id.matches("[ab][0-7]")) {
                call.reject("bad id");
                return;
            }
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            pm.setComponentEnabledSetting(new ComponentName(pkg, "com.pd.earnings.Ic_" + id),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            String[] styles = {"a", "b"};
            for (String s : styles) {
                for (int i = 0; i < 8; i++) {
                    String o = s + i;
                    if (o.equals(id)) continue;
                    pm.setComponentEnabledSetting(new ComponentName(pkg, "com.pd.earnings.Ic_" + o),
                            PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
