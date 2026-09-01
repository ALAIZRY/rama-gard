# Native Android Barcode Scanner

The Android build uses `@capacitor/barcode-scanner` and the native ZXing scanner instead of decoding camera frames inside the Android WebView.

The web application keeps its existing browser scanner path for normal web use. Android builds use the native scanner configured by `.github/workflows/build-apk.yml`.
