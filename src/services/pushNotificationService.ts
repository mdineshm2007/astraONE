import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { ref, update } from 'firebase/database';
import { rtdb } from '../firebase';

export async function setupPushNotifications(uid: string) {
  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Non-native platform. Skipping Capacitor Push.');
    return;
  }

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[Push] User denied notification permissions.');
      return;
    }

    // Register with FCM
    await PushNotifications.register();

    // Remove existing listeners to prevent duplicates on auth state changes
    await PushNotifications.removeAllListeners();

    // Listeners
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] Token registration success:', token.value);
      try {
        const userRef = ref(rtdb, `users/${uid}`);
        await update(userRef, { pushToken: token.value });
        console.log('[Push] Token successfully saved in DB for user', uid);
      } catch (dbErr: any) {
        console.error('[Push] Failed to save token in RTDB:', dbErr.message);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Token registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Notification received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Push] Action performed:', action);
    });

  } catch (error) {
    console.error('[Push] Error setting up push notifications:', error);
  }
}
