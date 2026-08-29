# Release builds now run minify + resource shrinking, so anything reached only
# from JavaScript has to be kept explicitly - the shrinker cannot see those
# call sites.

-keepclassmembers class com.prmarketplace.app.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}

-keepattributes JavascriptInterface
-keepattributes *Annotation*

# WebView client callbacks are invoked by the framework.
-keep class * extends android.webkit.WebViewClient { *; }
-keep class * extends android.webkit.WebChromeClient { *; }
