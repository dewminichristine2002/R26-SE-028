# EAS Development Build Setup Guide

This guide explains how to set up and run ElderMeds using **EAS (Expo Application Services)** development builds.

## Prerequisites

Before you start, ensure you have:
- Node.js and npm installed
- Expo CLI installed globally: `npm install -g eas-cli expo-cli`
- An Expo account (create at https://expo.dev)
- For iOS: Xcode installed (macOS only)
- For Android: Android Studio and SDK installed, or access to a cloud builder

## Initial Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Log in to Expo
```bash
eas login
# Follow the prompts to enter your Expo credentials
```

Verify login status:
```bash
eas whoami
```

### 3. Configure Your Project (First Time Only)
```bash
eas build:configure
```

This will:
- Create/update `eas.json`
- Create credentials for iOS/Android builds
- Set up your project on EAS servers

**Note:** Update the `owner` field in `app.json` with your Expo username.

## Running Development Builds

### Android Development Build

**Build the development app:**
```bash
npm run eas:build:dev
```

Or explicitly:
```bash
eas build --platform android --profile development
```

**On your device:**
1. Download the build from the provided link
2. Install the APK on your Android device
3. Run: `npm start` to connect to the development server
4. Press `a` in the terminal to launch the app on your device

### iOS Development Build

**Build the development app:**
```bash
npm run eas:build:dev:ios
```

Or explicitly:
```bash
eas build --platform ios --profile development
```

**On your device:**
1. The build will be available for download or direct installation to your device
2. Run: `npm start` to connect to the development server
3. Press `i` in the terminal to launch the app on your device

### Build Both Platforms at Once
```bash
npm run eas:build:preview
```

## Development Workflow

Once your development app is installed:

1. **Start the development server:**
   ```bash
   npm start
   ```

2. **Connect your device** (via QR code or link)

3. **Make code changes** - they'll hot-reload on your device

4. **Rebuild if needed:**
   ```bash
   npm run eas:build:dev
   ```

## EAS Configuration Explained

### eas.json Profiles

- **development**: Local testing with hot reload and debugging
  - Android: APK build
  - iOS: Simulator build
  - `developmentClient: true` enables development features

- **preview**: Pre-production testing
  - Builds ready for internal testing
  - Can be distributed to testers without publishing to stores

- **production**: Final release builds
  - Android: AAB (Android App Bundle) for Google Play
  - iOS: IPA for App Store
  - Production optimizations enabled

## Common Commands

```bash
# Check login status
eas whoami

# View build status
eas build:list

# View detailed build logs
eas build:view <BUILD_ID>

# Update app code on devices (after EAS Update setup)
npm run eas:update

# Submit build to app stores (after setup)
npm run eas:submit

# Clean build cache
eas build:cache:remove
```

## Troubleshooting

### Build Fails
```bash
# Check build logs
eas build:view <BUILD_ID>

# Clear cache and retry
eas build:cache:remove
npm run eas:build:dev
```

### Cannot Connect to Development Server
- Ensure your device and computer are on the same WiFi network
- Check firewall settings
- Restart the development server: `npm start`

### iOS Build Issues
- Ensure Xcode is up to date
- Check Apple Developer credentials in EAS
- Run: `eas build:configure` to update credentials

### Android Build Issues
- Verify Android SDK is properly installed
- Check `ANDROID_SDK_ROOT` environment variable
- Ensure keystore is properly configured

## Environment Variables

Create a `.env` file in the frontend folder:
```
EXPO_PUBLIC_API_URL=http://your-backend-url:5000
EXPO_PUBLIC_ENVIRONMENT=development
```

Access in code:
```javascript
const API_URL = process.env.EXPO_PUBLIC_API_URL;
```

## Next Steps

1. **Update app.json**
   - Change `owner` to your Expo username
   - Update `bundleIdentifier` and `package` name
   - Add app icons and splash screen images to `assets/`

2. **Develop your app**
   - Build development app with EAS
   - Install on your device
   - Use `npm start` for development

3. **When ready for distribution**
   - Switch to `preview` profile for testing
   - Use `production` profile for app stores
   - Follow app store submission guidelines

## Resources

- [EAS Documentation](https://docs.expo.dev/eas/)
- [EAS Build](https://docs.expo.dev/eas-update/introduction/)
- [EAS Configuration Reference](https://docs.expo.dev/eas/json/)
- [Expo Development Client](https://docs.expo.dev/development/development-client/)

## Notes

- Development builds are only for testing and development
- Use preview profile for internal team testing
- Production builds ready for app store submission
- All credentials are securely stored on EAS servers
- First build takes longer (2-5 minutes), subsequent builds are faster
