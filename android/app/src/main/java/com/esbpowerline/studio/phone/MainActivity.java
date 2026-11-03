package com.esbpowerline.studio.phone;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);
        ShareTargetPlugin.capture(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ShareTargetPlugin.capture(intent) && getBridge() != null) {
            PluginHandle h = getBridge().getPlugin("ShareTarget");
            if (h != null) ((ShareTargetPlugin) h.getInstance()).announce();
        }
    }
}
