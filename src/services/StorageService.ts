import type { StorageData, BatchInfo, Template } from '../types';

const STORAGE_KEY = 'veles_bt_storage_v1';

export class StorageService {
  private static writeQueue: Promise<void> = Promise.resolve();

  private static async loadDataRaw(): Promise<StorageData> {
    return new Promise((resolve) => {
      // 1. Пробуем chrome.storage (если мы в расширении)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (result[STORAGE_KEY]) {
            resolve(result[STORAGE_KEY] as StorageData);
          } else {
            // Инициализируем и batches, и templates
            resolve({ batches: {}, templates: {} }); 
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
            resolve({ batches: {}, templates: {} });
          }
        } else {
          resolve({ batches: {}, templates: {} });
        }
      }
    });
  }

  private static async updateData(
    mutator: (data: StorageData) => void | boolean | Promise<void | boolean>
  ): Promise<void> {
    const task = async () => {
      const data = await this.loadDataRaw();
      const shouldSave = await mutator(data);
      if (shouldSave !== false) {
        await this.saveData(data);
      }
    };

    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  /**
   * Загрузка всех данных из хранилища
   */
  static async loadData(): Promise<StorageData> {
    await this.writeQueue;
    return this.loadDataRaw();
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

  // --- BATCHES (История) ---

  /**
   * Сохранение новой группы тестов (Batch)
   */
  static async saveBatch(batch: BatchInfo): Promise<void> {
    await this.updateData((data) => {
      // Инициализация, если нет
      if (!data.batches) data.batches = {};

      // Сохраняем батч
      data.batches[batch.id] = batch;
    });
  }

  /**
   * Добавление ID теста в группу (используется при запуске в реальном времени)
   */
  static async addTestIdToBatch(batchId: string, velesId: number): Promise<void> {
    await this.updateData((data) => {
      if (data.batches && data.batches[batchId]) {
        // Инициализируем массив, если вдруг его нет
        if (!data.batches[batchId].velesIds) {
            data.batches[batchId].velesIds = [];
        }

        // Добавляем ID, если его там еще нет
        if (!data.batches[batchId].velesIds.includes(velesId)) {
          data.batches[batchId].velesIds.push(velesId);
          return true;
        }
      }
      return false;
    });
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
   * Очистка истории (удаляет всё, КРОМЕ шаблонов)
   */
  static async clearHistory(): Promise<void> {
    await this.updateData((data) => {
      data.batches = {}; // Затираем только историю
    });
  }
  
  /**
   * НОВОЕ: Удаление конкретной группы тестов
   */
  static async removeBatch(batchId: string): Promise<void> {
      await this.updateData((data) => {
          if (data.batches && data.batches[batchId]) {
              delete data.batches[batchId];
              return true;
          }
          return false;
      });
  }

  /**
   * Найти самый старый ID теста среди всех сохраненных групп.
   * Нужно для ограничения синхронизации (чтобы не качать историю до сотворения мира).
   */
  static async getEarliestTestId(): Promise<number | null> {
    const batches = await this.getBatches();
    if (batches.length === 0) return null;

    let minId: number | null = null;

    batches.forEach(batch => {
        if (batch.velesIds && batch.velesIds.length > 0) {
            const batchMin = Math.min(...batch.velesIds);
            if (minId === null || batchMin < minId) {
                minId = batchMin;
            }
        }
    });

    return minId;
  }

  // --- TEMPLATES (Шаблоны) ---

  /**
   * Сохранение шаблона
   */
  static async saveTemplate(template: Template): Promise<void> {
    await this.updateData((data) => {
      // Инициализация, если вдруг нет
      if (!data.templates) data.templates = {};

      data.templates[template.id] = template;
    });
  }

  /**
   * Получение всех шаблонов
   */
  static async getTemplates(): Promise<Template[]> {
    const data = await this.loadData();
    if (!data.templates) return [];
    
    // Сортировка по дате (новые сверху)
    return Object.values(data.templates).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Удаление шаблона по ID
   */
  static async deleteTemplate(id: string): Promise<void> {
    await this.updateData((data) => {
      if (data.templates && data.templates[id]) {
          delete data.templates[id];
          return true;
      }
      return false;
    });
  }
}
