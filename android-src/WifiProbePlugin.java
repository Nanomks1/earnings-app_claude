package com.pd.earnings;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetAddress;

// فحص مؤقت: ماذا يستطيع التطبيق قراءته عن شبكة الواي فاي بدون إذن الموقع
@CapacitorPlugin(name = "WifiProbe", permissions = {
        @Permission(strings = {"android.permission.NEARBY_WIFI_DEVICES"}, alias = "nearby")
})
public class WifiProbePlugin extends Plugin {

    @PluginMethod
    public void askNearby(PluginCall call) {
        if (getPermissionState("nearby") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("nearby", call, "nearbyDone");
    }

    @PermissionCallback
    private void nearbyDone(PluginCall call) {
        call.resolve();
    }

    private static boolean has(Context c, String p) {
        return c.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void probe(PluginCall call) {
        Context c = getContext();
        JSObject o = new JSObject();
        o.put("api", Build.VERSION.SDK_INT);
        o.put("nearbyGranted", has(c, "android.permission.NEARBY_WIFI_DEVICES"));
        o.put("fineLocationGranted", has(c, Manifest.permission.ACCESS_FINE_LOCATION));
        try {
            LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
            o.put("locationSwitchOn", lm != null && lm.isLocationEnabled());
        } catch (Exception e) {
            o.put("locationSwitchOn", "err " + e);
        }
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiInfo wi = wm.getConnectionInfo();
            o.put("wm_ssid", wi.getSSID());
            o.put("wm_bssid", wi.getBSSID());
        } catch (Exception e) {
            o.put("wm_err", e.toString());
        }
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
            o.put("activeIsWifi", nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
            if (nc != null) {
                Object ti = nc.getTransportInfo();
                if (ti instanceof WifiInfo) {
                    o.put("ti_ssid", ((WifiInfo) ti).getSSID());
                    o.put("ti_bssid", ((WifiInfo) ti).getBSSID());
                }
            }
            LinkProperties lp = n == null ? null : cm.getLinkProperties(n);
            if (lp != null) {
                StringBuilder g = new StringBuilder();
                for (RouteInfo r : lp.getRoutes()) {
                    if (r.isDefaultRoute() && r.hasGateway()) g.append(r.getGateway().getHostAddress()).append(' ');
                }
                o.put("gateway", g.toString().trim());
                StringBuilder d = new StringBuilder();
                for (InetAddress a : lp.getDnsServers()) d.append(a.getHostAddress()).append(' ');
                o.put("dns", d.toString().trim());
                o.put("domains", String.valueOf(lp.getDomains()));
                o.put("addresses", String.valueOf(lp.getLinkAddresses()));
            }
        } catch (Exception e) {
            o.put("cm_err", e.toString());
        }
        call.resolve(o);
    }

    @PluginMethod
    public void rootProbe(final PluginCall call) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                JSObject o = new JSObject();
                StringBuilder sb = new StringBuilder();
                try {
                    final Process p = new ProcessBuilder("su", "-c", "dumpsys wifi | grep -m4 -i mWifiInfo; ip neigh show")
                            .redirectErrorStream(true).start();
                    Thread killer = new Thread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                Thread.sleep(15000);
                            } catch (InterruptedException e) {
                                return;
                            }
                            p.destroy();
                        }
                    });
                    killer.setDaemon(true);
                    killer.start();
                    BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
                    String line;
                    while ((line = r.readLine()) != null && sb.length() < 1800) sb.append(line).append('\n');
                    killer.interrupt();
                    p.destroy();
                } catch (Exception e) {
                    sb.append("ERR ").append(e);
                }
                o.put("out", sb.toString());
                call.resolve(o);
            }
        }).start();
    }
}
