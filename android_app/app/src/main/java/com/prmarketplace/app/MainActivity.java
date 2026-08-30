package com.prmarketplace.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private WebChromeClient.FileChooserParams pendingFileChooserParams;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int PERMISSIONS_REQUEST_CODE = 1002;
    private long backPressedTime = 0;
    private Toast exitToast = null;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Fits system windows properly so content does not get cut off by status/navigation bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.white));
            getWindow().setNavigationBarColor(ContextCompat.getColor(this, R.color.white));
        }

        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(true);
            insetsController.setAppearanceLightNavigationBars(true);
        }

        setContentView(R.layout.activity_main);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleAppBackNavigation();
            }
        });

        webView = findViewById(R.id.webView);

        // On a debug build only, let chrome://inspect attach to this WebView.
        // Without it, a JavaScript error on the phone is invisible - you can
        // see that something is wrong but not what. Never enabled in release:
        // it would expose the page to anyone with adb access.
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            android.webkit.ServiceWorkerController swController = android.webkit.ServiceWorkerController.getInstance();
            swController.setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }
            });
        }

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setGeolocationEnabled(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        webSettings.setEnableSmoothTransition(true);
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(false);
        webSettings.setAllowUniversalAccessFromFileURLs(false);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        // Responsive Mobile Viewport settings
        webSettings.setUseWideViewPort(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setTextZoom(100); // Prevent device system font scale from breaking mobile layout
        webSettings.setSupportZoom(false); // Clean mobile app experience without accidental zoom glitches
        webSettings.setBuiltInZoomControls(false);
        webSettings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return launchExternally(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return url != null && launchExternally(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                // Mirror the page's console into logcat under a single tag,
                // so `adb logcat -s PRWebView` is enough to watch the app.
                android.util.Log.d("PRWebView", String.format("%s  [%s:%d]",
                        message.message(), message.sourceId(), message.lineNumber()));
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                if (checkAndRequestPermissions(fileChooserParams)) {
                    launchFileChooser(fileChooserParams);
                }
                return true;
            }
        });

        // A WebView cannot download a file by itself, so a link to the update
        // APK would simply do nothing. Hand downloads to the browser, which
        // fetches the file and lets Android's installer take it from there -
        // no install permission needed on our side.
        webView.setDownloadListener((url, userAgent, disposition, mimeType, size) -> openInBrowser(url));

        // Lets the page ask the app to step aside. A web page cannot close a
        // window it did not open, so the Exit button used to blank the document
        // and pretend the app had quit.
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        requestLocationPermissionIfNecessary();

        // Load local Android assets via HTTPS origin for Service Worker and modern Web API support
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    /**
     * Hand any non-web link to Android rather than trying to load it here.
     *
     * This used to be an allowlist of tel, mailto, whatsapp and intent, which
     * meant every new scheme the page started using broke silently: adding
     * upi:// payment links produced ERR_UNKNOWN_URL_SCHEME and a blank error
     * page, because the WebView tried to fetch a URL it cannot fetch. Asking
     * what the WebView can render, rather than listing what it cannot, does
     * not need editing the next time.
     *
     * @return true when the link has been dealt with and the WebView should
     *         not attempt it.
     */
    /**
     * Send a link to the browser rather than the WebView. Used for downloads:
     * launchExternally deliberately keeps http and https inside the app, which
     * is right for pages and wrong for a file the WebView cannot save.
     */
    private void openInBrowser(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "No app can open that download.", Toast.LENGTH_LONG).show();
        }
    }

    private boolean launchExternally(Uri uri) {
        if (uri == null) return false;

        String scheme = uri.getScheme();
        if (scheme == null) return false;

        // Pages stay in the WebView; everything else belongs to another app.
        if (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https")) {
            return false;
        }

        try {
            Intent intent;
            if (scheme.equalsIgnoreCase("intent")) {
                // intent:// carries its own target and fallback.
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (android.content.ActivityNotFoundException e) {
            // Nothing installed can open it. Say so: the alternative is the
            // WebView showing a browser error page for a link that was never
            // a web page, which explains nothing.
            Toast.makeText(this, messageForMissingApp(scheme), Toast.LENGTH_LONG).show();
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return true;
        }
    }

    private String messageForMissingApp(String scheme) {
        if (scheme.equalsIgnoreCase("upi")) {
            return "No UPI app found. Install GPay, PhonePe or Paytm, or scan the QR code with another phone.";
        }
        if (scheme.equalsIgnoreCase("tel")) {
            return "No phone app available on this device.";
        }
        if (scheme.equalsIgnoreCase("mailto")) {
            return "No email app set up on this device.";
        }
        return "No app on this phone can open that link.";
    }

    /**
     * The only surface exposed to JavaScript. It carries no user data and takes
     * no arguments, so a compromised page gains nothing beyond what the user
     * could do with the home button.
     */
    private class AndroidBridge {
        @android.webkit.JavascriptInterface
        public void moveToBackground() {
            runOnUiThread(() -> moveTaskToBack(true));
        }
    }

    private void requestLocationPermissionIfNecessary() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<String> locPerms = new ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                locPerms.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                locPerms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            if (!locPerms.isEmpty()) {
                ActivityCompat.requestPermissions(this, locPerms.toArray(new String[0]), 1003);
            }
        }
    }

    private boolean checkAndRequestPermissions(WebChromeClient.FileChooserParams fileChooserParams) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }

        List<String> permissionsNeeded = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.CAMERA);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            pendingFileChooserParams = fileChooserParams;
            ActivityCompat.requestPermissions(this, permissionsNeeded.toArray(new String[0]), PERMISSIONS_REQUEST_CODE);
            return false;
        }

        return true;
    }

    private void launchFileChooser(WebChromeClient.FileChooserParams fileChooserParams) {
        try {
            Intent intent = (fileChooserParams != null) ? fileChooserParams.createIntent() : new Intent(Intent.ACTION_GET_CONTENT);
            if (fileChooserParams == null) {
                intent.setType("image/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
            }
            startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
        } catch (Exception e) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            pendingFileChooserParams = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            if (pendingFileChooserParams != null || filePathCallback != null) {
                // Launch file chooser (even if some permissions were denied, picker can still operate)
                launchFileChooser(pendingFileChooserParams);
                pendingFileChooserParams = null;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            pendingFileChooserParams = null;
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        android.webkit.CookieManager.getInstance().flush();
    }

    @Override
    protected void onStop() {
        super.onStop();
        android.webkit.CookieManager.getInstance().flush();
    }

    /**
     * Walk the app back one layer: let the page close whatever it has open,
     * then WebView history, and only then leave.
     *
     * The query into JavaScript is asynchronous, so a second press can arrive
     * while the first is still in flight. Both would find nothing open, and
     * the second would see the exit timer the first had only just set - so a
     * single press appeared to close the app. One query at a time.
     */
    private boolean backQueryInFlight = false;

    private void handleAppBackNavigation() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        if (backQueryInFlight) return;
        backQueryInFlight = true;

        webView.evaluateJavascript(
            "(function(){try{return window.handleAndroidBackButton?window.handleAndroidBackButton():false}catch(e){return false}})();",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    backQueryInFlight = false;
                    // A thrown handler answers "null"; treat anything that is
                    // not an explicit true as unhandled rather than trapping
                    // the user in an app whose back button does nothing.
                    boolean handled = "true".equalsIgnoreCase(value) || "\"true\"".equalsIgnoreCase(value);
                    if (handled) return;

                    if (webView.canGoBack()) {
                        webView.goBack();
                        return;
                    }
                    confirmExit();
                }
            });
    }

    /** Two presses to leave, so a stray swipe does not close the app. */
    private void confirmExit() {
        if (exitToast != null) exitToast.cancel();
        if (backPressedTime + 2500 > System.currentTimeMillis()) {
            moveTaskToBack(true);
            return;
        }
        exitToast = Toast.makeText(this, "Press back again to exit PR Marketplace", Toast.LENGTH_SHORT);
        exitToast.show();
        backPressedTime = System.currentTimeMillis();
    }

}
