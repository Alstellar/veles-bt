# Veles Helper

**Veles Helper** - расширение для Google Chrome, которое помогает настраивать, запускать и анализировать бектесты стратегий на Veles.Finance.

Текущая версия: **1.8.0**

## Возможности

- Конфигуратор стратегий с Grid Search по параметрам входа, ордеров, тейк-профита и стоп-лосса.
- Поддержка Бектестов 1.0 и Бектестов 2.0.
- Массовый запуск тестов по нескольким активам прямо из Конфигуратора.
- Автоматическая очередь тестов с настройкой параллельности и интервала между запусками.
- Индивидуальный период тестирования для каждого актива при выборе режима "Весь период".
- Корректировка выбранного диапазона дат с учетом доступной истории конкретной монеты.
- Вкладка "Бектесты" для запуска матрицы тестов по шаблонам и списку активов.
- Вкладка "Активы" с таблицей доступных пар, плеч и дат начала истории.
- Таблица результатов с фильтрацией, сортировкой, полноэкранным режимом и экспортом в CSV.
- История запусков с возможностью продолжить остановленные batch-запуски.
- Импорт настроек из share-ссылок Veles.
- Сохранение и загрузка шаблонов конфигураций.
- Локальное хранение больших объемов результатов через IndexedDB.
- Внутреннее логирование и экспорт bug-report для диагностики.

## Что нового в 1.8.0

- Бектесты 2.0 полностью интегрированы в Конфигуратор.
- Добавлен запуск тестов сразу по нескольким выбранным активам.
- Для режима "Весь период" каждая монета получает собственную дату начала истории на выбранной бирже.
- Добавлено копирование отдельных индикаторов и полных слотов во всех разделах Конфигуратора.
- Переработано внутреннее хранилище для стабильной работы с большими объемами данных.
- Обновлено внутреннее логирование для более полного bug-report.
- Исправлен формат ссылок на бектесты в CSV-экспорте.

## Поддерживаемые домены Veles

Расширение работает с:

- `https://veles.finance`
- `https://ru.veles.finance`

Для работы необходимо быть авторизованным на одном из поддерживаемых доменов Veles.

## Хранение данных

Veles Helper хранит данные локально в браузере пользователя:

- историю запусков;
- результаты бектестов;
- runtime-состояние очередей;
- шаблоны конфигураций;
- диагностические логи.

Данные не отправляются на сторонние серверы расширения.

## Установка для разработки

1. Клонируйте репозиторий.

```bash
git clone https://github.com/Alstellar/veles-bt.git
cd veles-bt
```

2. Установите зависимости.

```bash
npm install
```

3. Соберите расширение.

```bash
npm run build
```

4. Откройте `chrome://extensions`.

5. Включите "Режим разработчика".

6. Нажмите "Загрузить распакованное расширение".

7. Выберите папку `dist`.

## Команды

```bash
npm run dev
npm run build
npm run watch
npm run lint
npm run check:encoding
npm run fix:encoding
npm run mcp:install
npm run mcp:build
npm run mcp:start
```

## MCP Bridge (Phase A, read-only)

Отдельный контур **mcp-bridge**: companion-процесс + клиент в background расширения.

| Часть | Путь |
|-------|------|
| Companion (stdio MCP + HTTP long-poll) | `mcp/` (`veles-mcp-bridge`) |
| Extension client / protocol / keepalive | `src/mcp-bridge/` |
| Read operations (Phase A tools) | `src/operations/` |

1. `npm run mcp:install && npm run mcp:build && npm run mcp:start`
2. В расширении: **Настройки → MCP bridge** — enable, port, token из banner companion.
3. Подключите companion в Cursor/Claude (пример в `mcp/README.md`).

Полное описание tools и checklist: [`mcp/README.md`](./mcp/README.md).  
Запуск/остановка очереди бектестов через MCP **не входит** в Phase A.

## Технологии

- React
- TypeScript
- Vite
- Mantine UI
- IndexedDB
- Chrome Extension Manifest V3
- MCP Bridge (`veles-mcp-bridge`, Node stdio + HTTP long-poll)

## Структура проекта

- `src/components/views` - основные экраны интерфейса.
- `src/components` - переиспользуемые UI-компоненты.
- `src/hooks` - логика очередей, результатов и запусков.
- `src/services` - API, storage, database, logging, import/export.
- `src/mcp-bridge` - **MCP Bridge** client, protocol, settings, alarms keepalive (background).
- `src/operations` - headless read operations for MCP tools (not the transport itself).
- `src/utils` - вспомогательные функции.
- `src/config` - общие настройки доменов и лимитов.
- `mcp/` - **MCP Bridge** companion (`veles-mcp-bridge`: stdio + HTTP long-poll).
- `public` - manifest и статические ресурсы.

## Ограничения

- Расширение не является официальным продуктом Veles.Finance.
- Для запуска тестов требуется активная авторизация на Veles.
- Частота запусков и параллельность должны учитывать ограничения Veles API.
- Длительные batch-запуски зависят от доступности вкладки Veles и сетевого соединения.

## Контакты

- Telegram разработчика: [@Alstellar](https://t.me/alstellar)
- Канал: [Algo Bots](https://t.me/algo_bots)
- Репозиторий: [github.com/Alstellar/veles-bt](https://github.com/Alstellar/veles-bt)
