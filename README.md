This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

## Google Maps configuration

The application expects separate, restricted Google Maps SDK keys for Android and iOS. Never commit either key.

- Android: add `GOOGLE_MAPS_API_KEY=your_android_key` to `android/local.properties`. Restrict it to the Android application ID and signing certificate.
- iOS: add a user-defined Xcode build setting named `GOOGLE_MAPS_API_KEY` for the CrisisAgent target. Restrict that key to the iOS bundle identifier.
- Enable **Maps SDK for Android** and **Maps SDK for iOS** and attach billing to the Google Cloud project.
- After installing JavaScript dependencies, run `bundle exec pod install` from `ios` on macOS before building iOS.

The app requests foreground location only. It acquires one position when it opens and again when the existing Refresh button is used; it does not track in the background.

## Refresh and agent configuration

Set `AGENT_URL` in your local `.env` to the existing agent API base URL. Real TodoList and ChatAgent requests are the default (`USE_MOCK_AGENT_RESPONSE=false`); set it to `true` only for explicit mock development. Rebuild the native app after changing `.env` so React Native Config picks up the setting.

Startup and Refresh acquire location, fetch NWS and WFIGS, and wait for a validated TodoList response before replacing the current situation. Any failure or a 120-second deadline preserves the last successful location, disaster information, plan, and comparison history for this app session. Home shows the failure and offers Retry. The four loading steps use timers, with the final step waiting for completion.

For controlled demos or local testing, set `TEST_LOCATION_COORDINATES` in `.env` to a comma-separated `latitude,longitude` pair, for example `TEST_LOCATION_COORDINATES=37.7749,-122.4194`. When present, startup and Refresh use those coordinates instead of GPS. Leave the variable unset or blank to use device location. Rebuild the native app after changing `.env`.

Chat keeps its history and drafts. Each new question includes the last successfully committed snapshot and plan writeups; refresh itself does not send a chat message. Chat submissions pause during refresh and resume with the retained context after a failure.

### Compact agent context

TodoList and Chat receive a shared compact context: each current feature once, full official descriptions and source attribution, and approximate spatial relationships instead of map polygons. Full geometry stays in the app. Distance is in miles to the affected area (zero inside/on the boundary), or to a point; unknown spatial context is never treated as outside.

Comparisons use source record IDs from the last successful refresh. They include added IDs, compact removed records, and only previous values of changed fields. Source-time, geometry, and user-proximity changes are distinguished. Missing/duplicate IDs are uncomparable; a record leaving the result does not establish that a disaster ended. The first refresh explicitly has no baseline.

TodoList output length targets are system-prompt guidance only. Long, otherwise valid responses are accepted in full. Model choice and the one-search limit are unchanged.

Run `npm test -- --runInBand --testPathIgnorePatterns=backend` for frontend checks. The polygon-heavy fixture in `agentContext.test.ts` reports serialized UTF-8 bytes before/after compaction; this is not measured model token usage or a latency guarantee. Run `python -B -m unittest discover -s backend/CrisisAgentBackend/tests -v` with the TodoList environment for offline backend checks.

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
