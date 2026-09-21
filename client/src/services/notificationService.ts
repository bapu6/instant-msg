import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Configure foreground notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

class NotificationService {
  private isInitialized: boolean = false;

  public async init(): Promise<void> {
    if (this.isInitialized || Platform.OS === 'web') return;

    try {
      // 1. Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // 2. Setup Android Notification Channel with high priority and vibration
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Instant Messages',
          description: 'Incoming secure end-to-end encrypted messages',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#25D366',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });

        await Notifications.setNotificationChannelAsync('calls', {
          name: 'Incoming Calls',
          description: 'Audio and video calls',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 1000, 1000],
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('[NotificationService] Initialization error:', err);
    }
  }

  /**
   * Displays an immediate native system notification on the device
   */
  public async showIncomingMessageNotification(
    senderName: string,
    messageBody: string,
    data: { senderUsername: string; messageId?: string | number }
  ): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      await this.init();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: senderName || 'New Message',
          body: messageBody || 'Sent you an attachment',
          data: data,
          sound: true,
          badge: 1,
          categoryIdentifier: 'message',
        },
        trigger: Platform.OS === 'android' ? { channelId: 'messages' } : null,
      });
    } catch (err) {
      console.warn('[NotificationService] Failed to post notification:', err);
    }
  }

  /**
   * Clears all notification badges
   */
  public async clearBadges(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {}
  }
}

export const notificationService = new NotificationService();
export default notificationService;
