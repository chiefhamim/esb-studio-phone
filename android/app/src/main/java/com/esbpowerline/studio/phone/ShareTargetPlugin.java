package com.esbpowerline.studio.phone;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Parcelable;
import android.provider.OpenableColumns;
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
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Everything that arrives in the app from outside:
 *  - text / links (Share to ESB Studio)                  -> getPending() (legacy, text only) or takeShare()
 *  - shared pictures, PDFs, text files (SEND / SEND_MULTIPLE) -> copied to the app cache, listed by takeShare()
 *  - selected text from any app (ACTION_PROCESS_TEXT)    -> text, source "process-text"
 *  - launcher shortcuts (New story, Paste link)          -> action "new-story" / "paste-link"
 * The page asks with takeShare(); the plugin also fires a "shared" event when something arrives while the app is open.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {
    static final String ACTION_NEW_STORY = "com.esbpowerline.studio.phone.action.NEW_STORY";
    static final String ACTION_PASTE_LINK = "com.esbpowerline.studio.phone.action.PASTE_LINK";
    private static final String HANDLED_EXTRA = "com.esbpowerline.studio.phone.HANDLED";
    private static final long MAX_FILE_BYTES = 25L * 1024 * 1024;
    private static final int MAX_FILES = 10;
    private static final int MAX_INLINE_TEXT_BYTES = 1024 * 1024;
    private static final long STALE_MS = 24L * 60 * 60 * 1000;

    private static final Object LOCK = new Object();
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static WeakReference<ShareTargetPlugin> instance = new WeakReference<>(null);

    private static String pending = null;
    private static String source = null;
    private static String action = null;
    private static final List<JSObject> files = new ArrayList<>();

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    /** Remember what this intent carries. Returns true when there is something for the page. Each intent is read once. */
    static boolean capture(Context ctx, Intent intent) {
        if (intent == null || intent.getBooleanExtra(HANDLED_EXTRA, false)) return false;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false;
        String a = intent.getAction();
        if (a == null) return false;
        boolean any = false;
        final Context app = ctx.getApplicationContext();

        if (ACTION_NEW_STORY.equals(a) || ACTION_PASTE_LINK.equals(a)) {
            synchronized (LOCK) {
                action = ACTION_NEW_STORY.equals(a) ? "new-story" : "paste-link";
            }
            any = true;
        } else if (Intent.ACTION_PROCESS_TEXT.equals(a)) {
            CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            if (t != null && t.toString().trim().length() > 0) {
                synchronized (LOCK) {
                    pending = t.toString();
                    source = "process-text";
                }
                any = true;
            }
        } else if (Intent.ACTION_SEND.equals(a) || Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            String type = intent.getType();
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.trim().length() > 0 && (type == null || type.startsWith("text/"))) {
                synchronized (LOCK) {
                    pending = text;
                    source = "send";
                }
                any = true;
            }
            final List<Uri> uris = streams(intent);
            if (!uris.isEmpty()) {
                final String fallbackType = type;
                IO.execute(() -> {
                    copyAll(app, uris, fallbackType);
                    announceLater();
                });
                any = true;
            }
        }
        if (any) intent.putExtra(HANDLED_EXTRA, true);
        return any;
    }

    @SuppressWarnings("deprecation")
    private static List<Uri> streams(Intent intent) {
        List<Uri> out = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri u = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) out.add(u);
        } else {
            ArrayList<Uri> l = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) for (Parcelable p : l) if (p instanceof Uri) out.add((Uri) p);
        }
        if (out.size() > MAX_FILES) return new ArrayList<>(out.subList(0, MAX_FILES));
        return out;
    }

    private static void copyAll(Context ctx, List<Uri> uris, String fallbackType) {
        File dir = new File(ctx.getCacheDir(), "shared");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File[] old = dir.listFiles();
        if (old != null) {
            long now = System.currentTimeMillis();
            for (File f : old) {
                //noinspection ResultOfMethodCallIgnored
                if (now - f.lastModified() > STALE_MS) f.delete();
            }
        }
        ContentResolver cr = ctx.getContentResolver();
        int n = 0;
        for (Uri u : uris) {
            // Only content:// grants are read; never a file:// path another app names.
            if (!ContentResolver.SCHEME_CONTENT.equals(u.getScheme())) continue;
            // Never this app's own provider: another app could name one of our private cache files and have it "shared" back in.
            String auth = u.getAuthority();
            if (auth == null || auth.startsWith(ctx.getPackageName())) continue;
            String mime = cr.getType(u);
            if (mime == null || mime.equals("application/octet-stream")) mime = fallbackType;
            if (mime == null) continue;
            mime = mime.toLowerCase(Locale.US);
            boolean ok = mime.startsWith("image/") || mime.equals("application/pdf") || mime.equals("text/plain");
            if (!ok) continue;
            String name = displayName(cr, u);
            File out = new File(dir, System.currentTimeMillis() + "-" + (n++) + "-" + safeName(name));
            long size = 0;
            boolean tooBig = false;
            try (InputStream in = cr.openInputStream(u); FileOutputStream os = new FileOutputStream(out)) {
                if (in == null) continue;
                byte[] buf = new byte[64 * 1024];
                int r;
                while ((r = in.read(buf)) > 0) {
                    size += r;
                    if (size > MAX_FILE_BYTES) {
                        tooBig = true;
                        break;
                    }
                    os.write(buf, 0, r);
                }
            } catch (IOException | SecurityException e) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                continue;
            }
            JSObject o = new JSObject();
            o.put("name", name);
            o.put("mime", mime);
            if (tooBig) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
                o.put("error", "too-large");
                synchronized (LOCK) {
                    files.add(o);
                }
                continue;
            }
            o.put("size", size);
            o.put("path", out.getAbsolutePath());
            o.put("uri", Uri.fromFile(out).toString());
            if (mime.equals("text/plain") && size <= MAX_INLINE_TEXT_BYTES) {
                try (InputStream in = new FileInputStream(out)) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[16 * 1024];
                    int r;
                    while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
                    o.put("text", new String(bo.toByteArray(), StandardCharsets.UTF_8));
                } catch (IOException ignored) {
                    // the page can still read it through uri
                }
            }
            synchronized (LOCK) {
                files.add(o);
            }
        }
    }

    private static String displayName(ContentResolver cr, Uri u) {
        try (Cursor c = cr.query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (RuntimeException ignored) {
            // provider without a name
        }
        return "shared";
    }

    private static String safeName(String n) {
        String s = n.replaceAll("[^A-Za-z0-9._-]", "_");
        if (s.length() > 80) s = s.substring(s.length() - 80);
        return s.isEmpty() ? "shared" : s;
    }

    private static void announceLater() {
        ShareTargetPlugin p = instance.get();
        if (p != null) p.announce();
    }

    void announce() {
        JSObject o = new JSObject();
        synchronized (LOCK) {
            o.put("text", pending);
            o.put("source", source);
            o.put("action", action);
            o.put("fileCount", files.size());
        }
        notifyListeners("shared", o, true);
    }

    /** Legacy text-only read used by src/shareIntent.ts. Clears the text only. */
    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject r = new JSObject();
        synchronized (LOCK) {
            r.put("text", pending);
            pending = null;
        }
        call.resolve(r);
    }

    /** Everything waiting: text, source, shortcut action and copied files. Clears all of it. Waits for file copies in progress. */
    @PluginMethod
    public void takeShare(PluginCall call) {
        IO.execute(() -> {
            JSObject r = new JSObject();
            JSArray arr = new JSArray();
            synchronized (LOCK) {
                r.put("text", pending);
                r.put("source", source);
                r.put("action", action);
                for (JSObject f : files) arr.put(f);
                pending = null;
                source = null;
                action = null;
                files.clear();
            }
            r.put("files", arr);
            call.resolve(r);
        });
    }

    /** Delete the cached copies of shared files (the page calls this when it has read them). */
    @PluginMethod
    public void clearCache(PluginCall call) {
        IO.execute(() -> {
            File dir = new File(getContext().getCacheDir(), "shared");
            File[] fs = dir.listFiles();
            if (fs != null) {
                for (File f : fs) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
            call.resolve();
        });
    }
}
