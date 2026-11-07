package com.pd.earnings;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

// مجلد النسخ الاحتياطي ثابت (المسار لا يأتي من الواجهة أبدًا) ويتطلب صلاحية «الوصول لكل الملفات»
@CapacitorPlugin(name = "AllFiles")
public class AllFilesPlugin extends Plugin {
    static final String DIR = "_All/All Backups/My work app";

    static boolean granted() {
        return Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager();
    }

    static File dir() {
        return new File(Environment.getExternalStorageDirectory(), DIR);
    }

    private static boolean badName(String n) {
        return n == null || n.isEmpty() || n.contains("/") || n.contains("\\") || n.contains("..");
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        JSObject o = new JSObject();
        o.put("ok", granted());
        call.resolve(o);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < 30) {
            call.reject("unsupported");
            return;
        }
        try {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e) { // بعض الأنظمة لا تملك صفحة خاصة بالتطبيق: نفتح القائمة العامة
                Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        try {
            String name = call.getString("name");
            String data = call.getString("data");
            if (badName(name) || data == null) {
                call.reject("bad args");
                return;
            }
            if (!granted()) {
                call.reject("no access");
                return;
            }
            File d = dir();
            if (!d.isDirectory() && !d.mkdirs() && !d.isDirectory()) {
                call.reject("mkdir failed");
                return;
            }
            File f = new File(d, name);
            File tmp = new File(d, name + ".tmp");
            byte[] b = data.getBytes(StandardCharsets.UTF_8);
            try (FileOutputStream os = new FileOutputStream(tmp)) {
                os.write(b);
                os.getFD().sync();
            }
            if (!tmp.renameTo(f)) { // احتياط: كتابة مباشرة إن رفض النظام إعادة التسمية
                try (FileOutputStream o2 = new FileOutputStream(f)) {
                    o2.write(b);
                    o2.getFD().sync();
                }
                tmp.delete();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        try {
            String name = call.getString("name");
            if (badName(name)) {
                call.reject("bad args");
                return;
            }
            if (!granted()) {
                call.reject("no access");
                return;
            }
            File f = new File(dir(), name);
            if (!f.isFile()) {
                call.reject("not found");
                return;
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (InputStream is = new FileInputStream(f)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            }
            JSObject res = new JSObject();
            res.put("data", new String(bos.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(res);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            if (!granted()) {
                call.reject("no access");
                return;
            }
            JSArray arr = new JSArray();
            File[] fs = dir().listFiles();
            if (fs != null) {
                for (File f : fs) {
                    String n = f.getName();
                    if (f.isFile() && n.toLowerCase().endsWith(".json")) {
                        JSObject o = new JSObject();
                        o.put("name", n);
                        o.put("modified", (double) f.lastModified());
                        arr.put(o);
                    }
                }
            }
            JSObject res = new JSObject();
            res.put("files", arr);
            call.resolve(res);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
