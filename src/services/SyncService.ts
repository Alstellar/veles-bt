import { VelesService } from './VelesService';
import { DatabaseService } from './DatabaseService';
import { StorageService } from './StorageService'; 
import type { BacktestResultItem } from '../types';

export class SyncService {
  
  /**
   * Запускает процесс синхронизации.
   * Обновляет данные по существующим тестам с сервера Veles.
   * Игнорирует тесты, не входящие в локальные группы.
   * * @param tabId - ID вкладки с Veles
   * @param onProgress - колбек для обновления UI
   * @returns Количество обновленных/добавленных тестов
   */
  static async sync(tabId: number, onProgress?: (count: number) => void): Promise<number> {
    // 1. Узнаем нижнюю границу (самый старый тест, который мы когда-либо запускали)
    const minLocalId = await StorageService.getEarliestTestId();

    // Если у нас нет истории, нечего синхронизировать
    if (!minLocalId) {
        console.log("Синхронизация пропущена: Локальная история групп пуста.");
        return 0;
    }
    
    // 2. Собираем "Белый список" ID (whitelist). 
    // Мы хотим обновлять ТОЛЬКО те тесты, которые есть в наших группах.
    const batches = await StorageService.getBatches();
    const myTestIds = new Set<number>();
    batches.forEach(b => b.velesIds?.forEach(id => myTestIds.add(id)));

    if (myTestIds.size === 0) return 0;

    let updatedCount = 0;
    let page = 0;
    const PAGE_SIZE = 100; // <-- Увеличили до 100
    let keepFetching = true;

    // Лимит безопасности
    const MAX_PAGES = 100; 

    while (keepFetching && page < MAX_PAGES) {
       // 3. Скачиваем страницу (сортировка на сервере date,desc — от новых к старым)
       const response = await VelesService.fetchStatisticsPageWrapper(tabId, page, PAGE_SIZE);

       if (!response || response.length === 0) {
           break; 
       }

       const itemsToSave: BacktestResultItem[] = [];

       for (const item of response) {
           // УСЛОВИЕ ОСТАНОВКИ (Снизу):
           // Если текущий ID меньше самого старого нашего ID, значит мы ушли в историю
           // до установки расширения. Дальше искать нет смысла.
           if (item.id < minLocalId) {
               keepFetching = false;
               // Не делаем break, чтобы дообработать текущую страницу (вдруг там порядок чуть сбит),
               // но следующую страницу запрашивать не будем.
           }

           // ФИЛЬТР: Сохраняем только "СВОИ" тесты
           if (myTestIds.has(item.id)) {
               itemsToSave.push(item);
           }
       }

       // Если нашли "свои" тесты на этой странице — обновляем их в БД
       if (itemsToSave.length > 0) {
           await DatabaseService.saveTests(itemsToSave);
           updatedCount += itemsToSave.length;
           
           if (onProgress) {
             onProgress(updatedCount);
           }
       }

       page++;
       
       if (keepFetching) {
         await new Promise(r => setTimeout(r, 300));
       }
    }

    return updatedCount;
  }
}