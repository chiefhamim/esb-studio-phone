package com.esbpowerline.studio.phone;

import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareTargetPlugin.class);
        registerPlugin(AppChromePlugin.class);
        registerPlugin(BiometricPlugin.class);
        super.onCreate(savedInstanceState); // BridgeActivity.load() calls onNewIntent(getIntent()) once
        AppChromePlugin.applyStored(this, getBridge() != null ? getBridge().getWebView() : null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ShareTargetPlugin.capture(this, intent) && getBridge() != null) {
            PluginHandle h = getBridge().getPlugin("ShareTarget");
            if (h != null) ((ShareTargetPlugin) h.getInstance()).announce();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The SystemBars plugin resets bar icons to the SYSTEM theme on a uiMode change; put the in-app choice back.
        AppChromePlugin.applyStored(this, getBridge() != null ? getBridge().getWebView() : null);
    }
}
