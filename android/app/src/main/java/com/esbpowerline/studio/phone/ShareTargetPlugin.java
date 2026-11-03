package com.esbpowerline.studio.phone;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives text/links shared from other apps (Share > ESB Studio). The page asks for it with getPending(). */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {
    private static String pending = null;

    /** Remember the shared text if this intent is a plain-text share. Returns true when it was one. */
    static boolean capture(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return false;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return false;
        pending = text;
        return true;
    }

    void announce() {
        JSObject o = new JSObject();
        o.put("text", pending);
        notifyListeners("shared", o, true);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("text", pending);
        pending = null;
        call.resolve(r);
    }
}
