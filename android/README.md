# ArtiMeow Android

The Android app packages the existing Editor and Player web interfaces in a native Android WebView shell. Use the tabs to switch between them. The Editor and Player keep separate project folders under Android app-specific documents storage.

## Build a debug APK

Install Java 17+, Gradle, and the Android SDK (API 35), then run:

```sh
cd android
gradle :app:assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Android Studio can also open this directory as a Gradle project.
The generated debug APK is also checked in at [`android/releases/ArtiMeow-Android-debug.apk`](releases/ArtiMeow-Android-debug.apk).

## Android-specific behavior

- Opening a project asks Android's system folder picker for access, then copies that folder into the app's private project storage.
- Basic project, chapter, asset, settings, and save-file operations use that private storage.
- The same APK includes both the Editor and Player interfaces.
- Desktop-only functions that depend on Electron, Node.js child processes, or desktop window controls are unavailable. This includes Git CLI operations, npm/Electron game packaging, and AI generation handled by the desktop main process.
- Uninstalling the app removes its private project data. Export or back up projects before uninstalling.
