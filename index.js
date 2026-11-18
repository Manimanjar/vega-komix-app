/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './src/App';
import {installVegaLog} from './src/lib/logging/vegaLog';
import {bugSentinel} from './src/lib/telemetry/bugSentinel';
import notifee from '@notifee/react-native';
// import notificationService from './src/lib/services/Notification';

// Release builds: drop verbose logging. Each call formats its arguments and
// crosses into native logcat on the JS thread, which adds up in hot paths
// (provider fetches, playback, downloads). installVegaLog keeps info, warnings
// and errors in the exportable log file, and console.log only while detailed
// logging is on.
if (!__DEV__) {
  console.trace = () => {};
}
installVegaLog(__DEV__);
bugSentinel.init();

// Track unhandled promise rejections globally
if (typeof globalThis !== 'undefined') {
  const previousRejectionHandler = globalThis.onunhandledrejection;
  globalThis.onunhandledrejection = function (event) {
    bugSentinel.recordUnhandledPromise(
      event && event.reason ? event.reason : event,
    );
    if (typeof previousRejectionHandler === 'function') {
      previousRejectionHandler(event);
    }
  };
}

// Enable react-native-firebase debug mode for Analytics DebugView in dev
if (__DEV__) {
  // eslint-disable-next-line no-undef
  globalThis.RNFBDebug = true;
}

notifee.onBackgroundEvent(async ({type, detail}) => {
  const notificationService =
    require('./src/lib/services/Notification').default;
  await notificationService.actionHandler({type, detail});
});

notifee.registerForegroundService(async () => {
  // Keep the service alive while in foreground
  return new Promise(() => {});
});

AppRegistry.registerComponent('main', () => App);
