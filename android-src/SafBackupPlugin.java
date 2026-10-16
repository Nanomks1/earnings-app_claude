package com.pd.earnings;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SafBackup")
public class SafBackupPlugin extends Plugin {

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        try {
            Uri uri = result.getData().getData();
            getContext().getContentResolver().takePersistableUriPermission(uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), uri);
            String name = (dir != null && dir.getName() != null) ? dir.getName() : "";
            JSObject o = new JSObject();
            o.put("uri", uri.toString());
            o.put("name", name);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        try {
            String tree = call.getString("tree");
            String name = call.getString("name");
            String data = call.getString("data");
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(tree));
            if (dir == null || !dir.canWrite()) {
                call.reject("no access");
                return;
            }
            DocumentFile f = dir.findFile(name);
            if (f == null) f = dir.createFile("application/json", name);
            if (f == null) {
                call.reject("create failed");
                return;
            }
            OutputStream os = getContext().getContentResolver().openOutputStream(f.getUri(), "wt");
            if (os == null) {
                call.reject("open failed");
                return;
            }
            try {
                os.write(data.getBytes(StandardCharsets.UTF_8));
            } finally {
                os.close();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(call.getString("tree")));
            if (dir == null || !dir.canWrite()) {
                call.reject("no access");
                return;
            }
            JSArray arr = new JSArray();
            DocumentFile[] files = dir.listFiles();
            for (DocumentFile f : files) {
                String n = f.getName();
                if (f.isFile() && n != null && n.toLowerCase().endsWith(".json")) {
                    JSObject o = new JSObject();
                    o.put("name", n);
                    o.put("uri", f.getUri().toString());
                    o.put("modified", f.lastModified());
                    arr.put(o);
                }
            }
            JSObject res = new JSObject();
            res.put("files", arr);
            call.resolve(res);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        try {
            String uri = call.getString("uri");
            if (uri == null) {
                DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(call.getString("tree")));
                DocumentFile f = dir == null ? null : dir.findFile(call.getString("name"));
                if (f == null) {
                    call.reject("not found");
                    return;
                }
                uri = f.getUri().toString();
            }
            InputStream is = getContext().getContentResolver().openInputStream(Uri.parse(uri));
            if (is == null) {
                call.reject("open failed");
                return;
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            } finally {
                is.close();
            }
            JSObject res = new JSObject();
            res.put("data", new String(bos.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(res);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
