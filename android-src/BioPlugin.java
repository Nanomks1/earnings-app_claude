package com.pd.earnings;

import androidx.appcompat.app.AppCompatActivity;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Bio")
public class BioPlugin extends Plugin {
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_STRONG
            | BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void available(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTH);
        JSObject o = new JSObject();
        o.put("ok", r == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(o);
    }

    @PluginMethod
    public void authenticate(final PluginCall call) {
        final AppCompatActivity a = getActivity();
        if (a == null) {
            call.reject("no activity");
            return;
        }
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                            .setTitle("العمل")
                            .setSubtitle("افتح التطبيق بالبصمة")
                            .setNegativeButtonText("استعمال الرمز")
                            .setAllowedAuthenticators(AUTH)
                            .build();
                    BiometricPrompt bp = new BiometricPrompt(a, ContextCompat.getMainExecutor(a),
                            new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                    call.resolve();
                                }

                                @Override
                                public void onAuthenticationError(int code, CharSequence msg) {
                                    call.reject(String.valueOf(msg));
                                }
                            });
                    bp.authenticate(info);
                } catch (Exception e) {
                    call.reject(String.valueOf(e.getMessage()));
                }
            }
        });
    }
}
