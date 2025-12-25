import type { StorageData, BatchInfo } from '../types';

const STORAGE_KEY = 'veles_bt_storage_v1';

export class StorageService {

  /**
   * Загрузка всех данных из хранилища
   */
  static async loadData(): Promise<StorageData> {
    return new Promise((resolve) => {
      // 1. Пробуем chrome.storage (если мы в расширении)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (result[STORAGE_KEY]) {
            resolve(result[STORAGE_KEY] as StorageData);
          } else {
            resolve({ batches: {} }); // Пустой инит
          }
        });
      } 
      // 2. Фолбэк на localStorage (для локальной разработки)
      else {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ batches: {} });
          }
        } else {
          resolve({ batches: {} });
        }
      }
    });
  }

  /**
   * Сохранение всей структуры данных
   */
  private static async saveData(data: StorageData): Promise<void> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve());
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        resolve();
      }
    });
  }

  /**
   * Сохранение новой группы тестов (Batch)
   */
  static async saveBatch(batch: BatchInfo): Promise<void> {
    const data = await this.loadData();
    
    // Инициализация, если нет
    if (!data.batches) data.batches = {};

    // Сохраняем батч
    data.batches[batch.id] = batch;

    await this.saveData(data);
  }

  /**
   * Обновление списка ID тестов внутри группы (например, добавляем успешные)
   */
  static async updateBatchIds(batchId: string, velesId: number): Promise<void> {
    const data = await this.loadData();
    
    if (data.batches && data.batches[batchId]) {
      // Добавляем ID, если его там еще нет
      if (!data.batches[batchId].velesIds.includes(velesId)) {
        data.batches[batchId].velesIds.push(velesId);
        await this.saveData(data);
      }
    }
  }

  /**
   * Получение всех групп (для меню истории)
   */
  static async getBatches(): Promise<BatchInfo[]> {
    const data = await this.loadData();
    if (!data.batches) return [];
    
    // Возвращаем массив, отсортированный по дате (новые сверху)
    return Object.values(data.batches).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Очистка истории (удаляет всё)
   */
  static async clearHistory(): Promise<void> {
    await this.saveData({ batches: {} });
  }
}