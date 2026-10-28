package com.pd.earnings;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
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
            if (id == null || !id.matches("[abc]([0-9]|1[01])")) {
                call.reject("bad id");
                return;
            }
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            ComponentName target = new ComponentName(pkg, "com.pd.earnings.Ic_" + id);
            if (pm.getComponentEnabledSetting(target) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                pm.setComponentEnabledSetting(target,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            }
            String[] styles = {"a", "b", "c"};
            for (String s : styles) {
                for (int i = 0; i < 12; i++) {
                    String o = s + i;
                    if (o.equals(id)) continue;
                    ComponentName cn = new ComponentName(pkg, "com.pd.earnings.Ic_" + o);
                    int st = pm.getComponentEnabledSetting(cn);
                    if (st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            || ("a0".equals(o) && st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)) {
                        pm.setComponentEnabledSetting(cn,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                    }
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    // لون التمييز من ألوان النظام (Material You)، أندرويد 12 فما فوق
    @PluginMethod
    public void sysColor(PluginCall call) {
        try {
            JSObject o = new JSObject();
            String hex = "";
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                int c = getContext().getResources().getColor(android.R.color.system_accent1_600, getContext().getTheme());
                hex = String.format("#%06x", c & 0xFFFFFF);
            }
            o.put("hex", hex);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
