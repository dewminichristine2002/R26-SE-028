# Quick EAS Development Build Reference

## One-Time Setup

```bash
# Install tools
npm install -g eas-cli expo-cli

# Login
eas login

# Configure project (in frontend folder)
cd frontend
eas build:configure

# Install dependencies
npm install
```

## Development Workflow

### Step 1: Build Development App
```bash
npm run eas:build:dev        # Android
npm run eas:build:dev:ios    # iOS
```
First build takes 2-5 minutes. Download and install the APK/IPA on your device.

### Step 2: Run Development Server
```bash
npm start
```

### Step 3: Connect Device
- Scan QR code shown in terminal
- Or use the provided link
- Press `a` (Android) or `i` (iOS) in terminal

### Step 4: Develop
- Make code changes
- Changes hot-reload on your device
- If adding dependencies, need to rebuild

## Build Profiles

| Command | Purpose | When to Use |
|---------|---------|------------|
| `npm run eas:build:dev` | Development build with debug features | Local testing |
| `npm run eas:build:preview` | Test build for internal team | Pre-release testing |
| `npm run eas:build:prod` | Production ready build | App store submission |

## Useful Commands

```bash
# Check what's happening
eas whoami                          # Verify login
eas build:list                      # View recent builds
eas build:view <BUILD_ID>          # See build details/logs

# Clean up
eas build:cache:remove             # Clear build cache
rm node_modules && npm install     # Reset dependencies

# For app store
npm run eas:submit                 # Submit to Play Store / App Store
```

## Environment Variables

Edit `frontend/.env`:
```
EXPO_PUBLIC_API_URL=http://your-backend-url:5000
EXPO_PUBLIC_ENVIRONMENT=development
```

Access in code: `process.env.EXPO_PUBLIC_API_URL`

## If Something Goes Wrong

```bash
# Build failed?
eas build:view <BUILD_ID>          # See error logs

# Can't connect?
# - Check WiFi (both on same network)
# - Restart: npm start
# - Check firewall

# Fresh start
npm run eas:build:cache:remove
npm run eas:build:dev
npm start
```

## Next Steps When Ready
- Update app icons/splash screen in `assets/`
- Configure production API URL
- Set up app store accounts (Apple Developer, Google Play)
- Use `npm run eas:build:prod` for final builds
- Run `npm run eas:submit` to publish

See [EAS_SETUP_GUIDE.md](EAS_SETUP_GUIDE.md) for full documentation.
