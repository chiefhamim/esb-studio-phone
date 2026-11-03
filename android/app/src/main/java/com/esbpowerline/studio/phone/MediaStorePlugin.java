package com.esbpowerline.studio.phone;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Saves an exported image into the shared Pictures/ESB Studio folder through MediaStore (Android 10+ scoped storage:
 * no storage permission is needed, and the Gallery lists the file at once). Resolves with the content uri only after
 * the bytes are written and the pending flag is cleared; anything else rejects with a plain message, so the page can
 * offer Share instead.
 */
@CapacitorPlugin(name = "MediaStore")
public class MediaStorePlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        String name = call.getString("name");
        String mime = call.getString("mime", "image/png");
        String data = call.getString("data");
        if (name == null || data == null) { call.reject("Missing file name or data."); return; }
        if (!mime.matches("image/(png|jpeg|webp)|application/zip")) { call.reject("Unsupported file type: " + mime); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("Direct save needs Android 10 or newer. Use Share."); return; }

        byte[] bytes;
        try { bytes = Base64.decode(data, Base64.DEFAULT); } catch (IllegalArgumentException e) { call.reject("The file data was damaged."); return; }
        if (bytes.length == 0) { call.reject("The file is empty."); return; }

        boolean isZip = mime.equals("application/zip");
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, (isZip ? "Download" : "Pictures") + "/ESB Studio");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri collection = isZip
            ? MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);

        Uri uri = null;
        try {
            uri = resolver.insert(collection, values);
            if (uri == null) { call.reject("The phone refused to create the file."); return; }
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new java.io.IOException("no output stream");
                out.write(bytes);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            ret.put("path", (isZip ? "Download" : "Pictures") + "/ESB Studio/" + name);
            ret.put("size", bytes.length);
            call.resolve(ret);
        } catch (Exception e) {
            if (uri != null) { try { resolver.delete(uri, null, null); } catch (Exception ignored) { } }
            call.reject("Could not save: " + e.getMessage());
        }
    }
}
