package com.esbpowerline.studio.phone;

import android.os.Build;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Fingerprint, face or screen-lock prompt (AndroidX BiometricPrompt). Holds no secrets: it only says yes or no. */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
    private int authenticators(boolean allowDeviceCredential) {
        // Strong biometrics, plus the screen lock where Android supports that combination (API 30 and up).
        if (allowDeviceCredential && Build.VERSION.SDK_INT >= 30) {
            return BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        return BiometricManager.Authenticators.BIOMETRIC_STRONG;
    }

    private static String reason(int code) {
        switch (code) {
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "none-enrolled";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "no-hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "hardware-unavailable";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "update-required";
            default:
                return "unavailable";
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean cred = Boolean.TRUE.equals(call.getBoolean("allowDeviceCredential", true));
        int r = BiometricManager.from(getContext()).canAuthenticate(authenticators(cred));
        JSObject o = new JSObject();
        o.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        if (r != BiometricManager.BIOMETRIC_SUCCESS) o.put("reason", reason(r));
        call.resolve(o);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        final boolean cred = Boolean.TRUE.equals(call.getBoolean("allowDeviceCredential", true));
        final String title = call.getString("title", "Unlock ESB Studio");
        final String subtitle = call.getString("subtitle", null);
        final String cancel = call.getString("cancelLabel", "Cancel");
        final int auth = authenticators(cred);
        int can = BiometricManager.from(getContext()).canAuthenticate(auth);
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("Biometrics unavailable: " + reason(can), reason(can));
            return;
        }
        final FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo.Builder b = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setAllowedAuthenticators(auth)
                .setConfirmationRequired(false);
            if (subtitle != null) b.setSubtitle(subtitle);
            if ((auth & BiometricManager.Authenticators.DEVICE_CREDENTIAL) == 0) b.setNegativeButtonText(cancel);
            BiometricPrompt prompt = new BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject o = new JSObject();
                        o.put("success", true);
                        call.resolve(o);
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                        String c;
                        switch (code) {
                            case BiometricPrompt.ERROR_USER_CANCELED:
                            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
                            case BiometricPrompt.ERROR_CANCELED:
                                c = "cancelled";
                                break;
                            case BiometricPrompt.ERROR_LOCKOUT:
                            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                                c = "lockout";
                                break;
                            case BiometricPrompt.ERROR_TIMEOUT:
                                c = "timeout";
                                break;
                            default:
                                c = "failed";
                        }
                        call.reject(msg.toString(), c);
                    }
                    // A wrong finger keeps the prompt open: nothing to do.
                }
            );
            prompt.authenticate(b.build());
        });
    }
}
