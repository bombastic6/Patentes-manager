package com.tupatente.app;

import android.os.Bundle;
import android.webkit.CookieManager; // Importante: importar esto
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Habilitar cookies de terceros (crucial para la persistencia de sesión)
        CookieManager.getInstance().setAcceptThirdPartyCookies(getWebView(), true);
    }
}