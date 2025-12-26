import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BacktestResultItem } from '../types';

// Описание схемы БД для TypeScript
interface VelesDB extends DBSchema {
  tests: {
    key: number;                // Основной ключ - ID теста (например, 9335983)
    value: BacktestResultItem;  // Объект с данными
    indexes: { 'by-date': string }; // Индекс для сортировки по дате
  };
}

const DB_NAME = 'VelesHelperDB';
const DB_VERSION = 1;

export class DatabaseService {
  // Кэшируем промис открытия базы, чтобы не открывать её каждый раз заново
  private static dbPromise: Promise<IDBPDatabase<VelesDB>>;

  // Инициализация и открытие базы
  private static getDB() {
    if (!this.dbPromise) {
      this.dbPromise = openDB<VelesDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Создаем хранилище объектов (таблицу), если её нет
          if (!db.objectStoreNames.contains('tests')) {
            const store = db.createObjectStore('tests', { keyPath: 'id' });
            // Создаем индекс по полю date для быстрой сортировки
            store.createIndex('by-date', 'date');
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * Массовое сохранение тестов.
   * Работает как "Upsert": если тест уже есть, он обновится.
   */
  static async saveTests(tests: BacktestResultItem[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('tests', 'readwrite');
    
    // Запускаем все операции записи параллельно внутри одной транзакции
    await Promise.all([
      ...tests.map(test => tx.store.put(test)),
      tx.done
    ]);
  }

  /**
   * Получить ID самого последнего (свежего) теста в базе.
   * Используется для синхронизации, чтобы не качать старые данные.
   */
  static async getLastTestId(): Promise<number | null> {
    const db = await this.getDB();
    const tx = db.transaction('tests', 'readonly');
    // Открываем курсор в направлении 'prev' (с конца), чтобы сразу получить максимальный ключ
    const cursor = await tx.store.openCursor(null, 'prev'); 
    return cursor ? cursor.key : null;
  }

  /**
   * Получить ВСЕ тесты из базы.
   * Отсортированы по дате (от старых к новым по умолчанию в IndexedDB).
   * Мы перевернем массив в UI.
   */
  static async getAllTests(): Promise<BacktestResultItem[]> {
    const db = await this.getDB();
    return await db.getAllFromIndex('tests', 'by-date');
  }

  /**
   * Получить конкретные тесты по списку ID.
   * Нужно для просмотра результатов конкретной группы (Batch).
   */
  static async getTestsByIds(ids: number[]): Promise<BacktestResultItem[]> {
    const db = await this.getDB();
    const tx = db.transaction('tests', 'readonly');
    const results: BacktestResultItem[] = [];
    
    for (const id of ids) {
        const item = await tx.store.get(id);
        if (item) results.push(item);
    }
    
    return results;
  }

  /**
   * Получить общее количество сохраненных тестов.
   */
  static async getCount(): Promise<number> {
    const db = await this.getDB();
    return await db.count('tests');
  }

  /**
   * Полная очистка базы данных
   */
  static async clearAll(): Promise<void> {
    const db = await this.getDB();
    await db.clear('tests');
  }
}