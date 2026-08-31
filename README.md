# ElderMeds - React Native Mobile Application

A React Native mobile application with a Node.js backend for elder health management.

## Project Structure

```
ElderMeds/
├── frontend/          # React Native mobile application
└── backend/           # Node.js Express server
```

## Prerequisites

- Node.js (v16+) and npm
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Xcode (for iOS development on macOS)
- Android Studio (for Android development)
- Expo account (create at https://expo.dev)

## Quick Start

### Frontend Setup with EAS Development Build

```bash
cd frontend
npm install

# Login to Expo
eas login

# Configure project (first time only)
eas build:configure

# Build development app for your platform
npm run eas:build:dev           # Android
# or
npm run eas:build:dev:ios       # iOS

# Start development server
npm start
```

### Backend Setup

```bash
cd backend
npm install

# Set up PostgreSQL connection in .env
npm start
```

## Running the App

### Using EAS Development Build (Recommended)

1. **Build the development app:**
   ```bash
   npm run eas:build:dev
   ```

2. **Install on your device:**
   - Download from the provided link
   - Install APK/IPA on your device

3. **Start development server:**
   ```bash
   npm start
   ```

4. **Connect device:**
   - Scan QR code or use the provided link
   - Press `a` for Android or `i` for iOS

### Using Local Expo (Development Only)

```bash
cd frontend
npm start

# Then press:
# a - Android Emulator
# i - iOS Simulator
# w - Web browser
```

## Documentation

- [Multi-Language Setup](frontend/MULTI_LANGUAGE_SETUP.md) - How to add more languages
- [EAS Development Build Guide](frontend/EAS_SETUP_GUIDE.md) - Detailed EAS setup and workflow

## Project Features

✅ Multi-language support (English ready, Spanish/French templates included)  
✅ React Navigation with bottom tabs and stack navigation  
✅ EAS development build support  
✅ Clean project structure for scalability  
✅ Environment variable configuration  

## Common Commands

```bash
# Frontend
cd frontend
npm start                 # Start dev server
npm run eas:build:dev     # Build development app
npm run eas:build:preview # Build preview for testers
npm run eas:build:prod    # Build production app

# Backend
cd backend
npm start                 # Start server
npm run dev               # Start with nodemon (watch mode)
```

## Environment Configuration

Copy `.env.example` to `.env` and update values:

```bash
cd frontend
cp .env.example .env
```

Edit the API URL to match your backend:
```
EXPO_PUBLIC_API_URL=http://localhost:5000
```

## Troubleshooting

**Build fails?**
```bash
eas build:cache:remove
npm run eas:build:dev
```

**Can't connect to dev server?**
- Check WiFi connection (device and computer on same network)
- Restart dev server: `npm start`
- Check firewall settings

**EAS login issues?**
```bash
eas logout
eas login
```

See [EAS_SETUP_GUIDE.md](frontend/EAS_SETUP_GUIDE.md) for more details.

## Architecture

- **Frontend**: React Native with Expo
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **State Management**: React hooks
- **Navigation**: React Navigation v6
- **Internationalization**: i18next
- **Build & Deploy**: EAS (Expo application Services)
  
