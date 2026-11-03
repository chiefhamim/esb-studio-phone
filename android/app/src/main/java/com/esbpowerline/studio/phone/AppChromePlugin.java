package com.esbpowerline.studio.phone;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keeps the native window in step with the IN-APP theme (which may differ from the system one):
 * the colour behind the transparent system bars and the WebView, and light or dark bar icons.
 * The choice is stored so the next cold start paints the right colour at once.
 */
@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {
    private static final String PREFS = "app_chrome";

    @PluginMethod
    public void apply(PluginCall call) {
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        final String color = call.getString("color", dark ? "#0D0D0F" : "#E9E9EB");
        final int c;
        try {
            c = Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            call.reject("Bad colour", "bad-color");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("set", true).putBoolean("dark", dark).putInt("color", c).apply();
        final Activity a = getActivity();
        a.runOnUiThread(() -> {
            paint(a, dark, c);
            if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(c);
            call.resolve();
        });
    }

    /** Re-apply the stored choice (cold start, and after a system uiMode change that the SystemBars plugin resets). */
    static void applyStored(Activity a, WebView web) {
        SharedPreferences p = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean("set", false)) return;
        int c = p.getInt("color", Color.WHITE);
        paint(a, p.getBoolean("dark", false), c);
        if (web != null) web.setBackgroundColor(c);
    }

    private static void paint(Activity a, boolean dark, int color) {
        Window w = a.getWindow();
        View decor = w.getDecorView();
        decor.setBackgroundColor(color);
        WindowInsetsControllerCompat ic = new WindowInsetsControllerCompat(w, decor);
        ic.setAppearanceLightStatusBars(!dark);
        ic.setAppearanceLightNavigationBars(!dark);
    }
}
