/**
 * Queue notifications service
 * Отправка уведомлений пользователю о событиях в очереди
 */

/**
 * Shows browser notification if permissions granted
 * Does nothing if notifications are disabled or permission not granted
 * @param title - Notification title
 * @param body - Notification body text
 * @param notificationsEnabled - Whether notifications are enabled
 */
export function notify(title: string, body: string, notificationsEnabled: boolean): void {
  if (!notificationsEnabled || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icons/icon-128.png' });
  }
}

/**
 * Requests notification permission from user
 * Only works if notifications are supported and not yet granted
 * @returns Promise that resolves when permission is determined
 */
export async function requestNotificationPermission(): Promise<void> {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/**
 * Sends queue completion notification
 * @param itemCount - Number of items in queue
 * @param notificationsEnabled - Whether notifications are enabled
 */
export function notifyQueueComplete(itemCount: number, notificationsEnabled: boolean): void {
  notify('Veles Helper', `Тесты завершены: ${itemCount}`, notificationsEnabled);
}

/**
 * Sends error notification for a specific test
 * @param testName - Name of the failed test
 * @param errorMessage - Error description
 * @param notificationsEnabled - Whether notifications are enabled
 */
export function notifyTestError(testName: string, errorMessage: string, notificationsEnabled: boolean): void {
  const body = `${testName}: ${errorMessage.substring(0, 100)}`;
  notify('Veles Helper - Ошибка теста', body, notificationsEnabled);
}

/**
 * Sends rate limit warning notification
 * @param waitSeconds - Seconds to wait before retry
 * @param notificationsEnabled - Whether notifications are enabled
 */
export function notifyRateLimit(waitSeconds: number, notificationsEnabled: boolean): void {
  notify('Veles Helper', `Достигнут лимит запросов. Ожидание ${waitSeconds}с...`, notificationsEnabled);
}

/**
 * Sends connection lost notification
 * @param notificationsEnabled - Whether notifications are enabled
 */
export function notifyConnectionLost(notificationsEnabled: boolean): void {
  notify('Veles Helper', 'Потеряно подключение к Veles. Ожидание восстановления...', notificationsEnabled);
}