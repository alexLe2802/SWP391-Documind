# DocuMind iOS build and IPA

The iOS application is a Capacitor shell that loads the production Next.js app
from `https://documind.icu`. It therefore requires an internet connection and a
working production frontend/backend during the demonstration.

## Prerequisites

- Use the Node/npm versions in the repository `.nvmrc` and `package.json`.
- Install the latest stable Xcode that supports the iOS version on the device.
- Open Xcode once and accept its license, or run:

  ```bash
  sudo xcodebuild -license accept
  sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
  ```

- Sign in under **Xcode > Settings > Accounts**.
- On the iPhone, enable **Settings > Privacy & Security > Developer Mode**.

## Sync and open the project

From `frontend/`:

```bash
npm ci
npm run ios:sync
npm run ios:open
```

The committed Xcode project is `ios/App/App.xcodeproj`. Run `npm run ios:sync`
after changing Capacitor configuration, native plugins, or bundled fallback
assets.

## Install directly on an iPhone

1. Connect the iPhone to the Mac and trust the Mac on the device.
2. Open the **App** target in Xcode.
3. Under **Signing & Capabilities**, keep automatic signing enabled and select
   the appropriate Team.
4. Keep the bundle identifier unique. The current identifier is
   `icu.documind.app`.
5. Select the connected iPhone as the run destination and choose
   **Product > Run**.

A free Personal Team is enough for a personal device, but its provisioning
profile expires after seven days. For a defense/demo, install and test the app
again on the day before the presentation.

## Export an IPA

Reliable IPA export requires an active Apple Developer Program membership.

1. Select **Any iOS Device (arm64)** as the run destination.
2. Set a unique version and build number under the App target's **General** tab.
3. Choose **Product > Archive**.
4. In Organizer, select the archive and choose **Distribute App**.
5. Choose **Development** for the owner's registered iPhone, or **Ad Hoc** for
   a list of registered test devices.
6. Let Xcode manage signing and export the `.ipa` file.

Test the exported build on the exact iPhone 15 Pro before the presentation.
Also verify login, email verification, upload, PDF/Office preview, AI chat,
downloads, and payment flows on mobile data as well as Wi-Fi.

## Release checklist

- `https://documind.icu` and `https://api.documind.icu/api/health` are reachable.
- Production Firebase configuration is deployed and `documind.icu` is an
  authorized authentication domain.
- Backend CORS allows `https://documind.icu`.
- The iPhone has internet access and Developer Mode enabled.
- The certificate/provisioning profile is not expired.
- A screen recording and browser fallback are available for the defense.
