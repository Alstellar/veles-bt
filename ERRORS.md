# Библиотека ошибок VelesBT

Файл для накопления известных ошибок, их признаков и поведения очереди. Дополняем только подтвержденными кейсами из пользовательских логов, bug report или кода обработки ошибок.

## Матрица поведения очереди

| Ошибка / класс | Где возникает | Признак | Поведение очереди |
|---|---|---|---|
| Rate limit | запуск теста | HTTP `429` или `Too Many Requests` | Текущий тест возвращается в `PENDING`, повтор через `35с`, очередь продолжается позже |
| Очередь Veles заполнена | запуск теста | HTTP `412` + текст про queue/limit/full | Текущий тест возвращается в `PENDING`, повтор после cooldown и/или после освобождения активного слота |
| Ошибка валидации запуска | запуск теста | HTTP `412`, не распознано как queue limit | Текущий тест помечается `ERROR`, очередь идет дальше |
| Слишком длинное имя теста | запуск теста | HTTP `400`, `errors[].field = name`, `code = Length` | Текущий тест помечается `ERROR`, весь поток останавливается как `runtime_error` |
| Сервер Veles временно недоступен | запуск теста | HTTP `5xx` | Текущий тест возвращается в `PENDING`, повтор через `60с`, максимум `10` попыток; после лимита поток останавливается |
| Сеть недоступна | запуск теста | `Failed to fetch`, `NetworkError`, `Network request failed` | Текущий тест возвращается в `PENDING`, повтор через `60с`, максимум `10` попыток; после лимита поток останавливается |
| Сеть недоступна при проверке статуса | status polling | `Failed to fetch`, `NetworkError`, `Network request failed` | Повтор проверки статуса через `60с`, максимум `10` попыток; после лимита поток останавливается |
| Потеря авторизации | запуск/status/context | `401`, `Unauthorized` | Сброс connection cache, попытка восстановить контекст; если не удалось, поток останавливается |
| Нет вкладки / токена / доступа | context resolving | `no_tab`, `no_token`, `unauthorized` | До `3` попыток получить контекст; если не удалось, поток останавливается |
| Вкладка/фрейм Veles исчез | injected request | `Frame with ID ... was removed`, закрытая вкладка, inaccessible page | Попытка восстановить контекст; если не удалось, поток останавливается |
| Таймаут теста | status polling | тест не завершился за `MAX_TEST_DURATION_MS` | Тест помечается `TIMEOUT`, очередь идет дальше |
| Статус Veles `ERROR` / `FAILED` | status polling | `check.data.status` равен `ERROR` или `FAILED` | Тест помечается `ERROR`, очередь идет дальше |
| Ошибка получения статистики | stats fetch after finish | статистика не получена после повторной попытки через `10с` | Ошибка уходит в обработку status/finalize; тест становится `ERROR` или поток останавливается в зависимости от места выброса |
| Потеря lock очереди | runtime loop | heartbeat lock не обновился | Поток останавливается как `lock_lost` |
| Ручная остановка | пользователь / история | stop requested | Поток останавливается, runtime сохраняется для продолжения |

## HTTP 400 - слишком длинное имя теста

- Дата подтверждения: 2026-05-05
- Queue/API: V2 launch, `POST /api/backtests/v2/`
- Stage: `launch`
- HTTP status: `400`
- Server error: `Bad Request`
- Server object: `createBacktestRequest`
- Server field: `name`
- Server code: `Length`
- Raw server message: `длина должна составлять от 1 до 100`
- User-facing message: `имя теста слишком длинное`
- Поведение: критическая ошибка. Если возникла хотя бы один раз, дальнейший запуск бессмысленен, потому что следующие тесты будут генерироваться с тем же слишком длинным шаблоном имени. Очередь должна остановиться.
- Причина: итоговое `payload.name` превышает лимит Veles. К длинному пользовательскому префиксу добавляется служебный суффикс вида `| N/TOTAL | VH #BATCH`.
- Что смотреть в bug report: `snapshot.data.trace.request.body.name`, `snapshot.data.queueItem.name`, `trace.response.bodyJson.errors`, `trace.response.bodyText`, `trace.response.status`.

## HTTP 429 - rate limit

- Queue/API: V1/V2 launch
- Stage: `launch`
- HTTP status: `429`
- Признак: status `429` или текст `Too Many Requests`
- Поведение: не ошибка теста. Текущий тест возвращается в `PENDING`, выставляется retry reason `RATE_LIMIT_429`, следующий запуск блокируется на `35с`.
- Что смотреть в bug report: если лимит превратился в terminal error, смотреть `trace.response.status`, `trace.response.bodyText`, batch timing.

## HTTP 412 - очередь Veles заполнена

- Queue/API: V1/V2 launch
- Stage: `launch`
- HTTP status: `412`
- Признаки: `queue is full`, `queue limit`, `limit reached` или русские сообщения Veles про лимит/попробуйте позже.
- Поведение: не ошибка теста. Текущий тест возвращается в `PENDING`, retry reason `QUEUE_LIMIT_412`; очередь ждет cooldown и/или освобождения активного слота.
- Что смотреть в bug report: `trace.response.bodyJson`, `activeRuns.size`, retry state.

## HTTP 412 - validation error

- Queue/API: V1/V2 launch
- Stage: `launch`
- HTTP status: `412`
- Признак: status `412`, но не распознано как queue limit.
- Поведение: текущий тест помечается `ERROR`, очередь продолжает следующие тесты.
- Примечание: если конкретная validation-ошибка оказывается системной для всего запуска, ее нужно выделить отдельным правилом, как сделано для длинного имени.
- Что смотреть в bug report: `trace.request.body`, `trace.response.bodyJson.errors`, `errorSummary`.

## HTTP 412 - объём ордера не соответствует требованиям пары

- Дата подтверждения: 2026-05-05
- Queue/API: V2 launch, `POST /api/backtests/v2/`
- Stage: `launch`
- HTTP status: `412`
- Server error: `Precondition Failed`
- Raw server message: `Объём ордера не соответствует требованиям по паре BTC/USDT`
- User-facing message: `Объём ордера не соответствует требованиям по паре BTC/USDT`
- Поведение сейчас: текущий тест помечается `ERROR`, очередь продолжает следующие тесты.
- Вероятная причина: параметры сетки/объёма создают ордер, который не проходит ограничения Veles/биржи для конкретной пары. В подтверждённом payload были `symbol=BTC/USDT`, `deposit.amount=1000`, `leverage=5`, `portion=2`, `settings.type=SIMPLE`, `settings.orders=8`, `settings.martingale=50`, `settings.overlap=10`, `settings.indent=0.01`.
- Что смотреть в bug report: `trace.request.body.deposit`, `trace.request.body.portion`, `trace.request.body.settings`, `trace.request.body.symbol`, `trace.response.bodyJson.message`, `trace.response.status`.

## Retryable launch/status errors in bug report

- Дата изменения: 2026-05-05
- Queue/API: V2
- Событие: `WARN [queue] test.retry`
- Snapshot kind: `queue.launch_retry` или `queue.status_retry`
- Причина: retryable-ошибки раньше были видны пользователю, но не попадали в bug report до исчерпания попыток.
- Новое поведение: retry по `429`, `412 queue full`, `5xx`, `Failed to fetch` сохраняет snapshot с `trace`, `attempts`, `reason`, `queueItem.payload`.
- Что смотреть в bug report: `event=test.retry`, `context.reason`, `context.attempts`, `snapshot.data.trace.response.status`, `snapshot.data.trace.response.bodyText`.

## HTTP 5xx - сервер Veles временно недоступен

- Queue/API: V1/V2 launch
- Stage: `launch`
- HTTP status: `500`-`599`
- Поведение: текущий тест возвращается в `PENDING`, повтор через `60с`, максимум `10` попыток. После лимита поток останавливается как `runtime_error`.
- Что смотреть в bug report: `trace.response.status`, `trace.response.bodyText`, timestamps, количество попыток.

### HTTP 500 - Internal Server Error на создании V2-бектеста

- Дата подтверждения: 2026-05-05
- Queue/API: V2 launch, `POST /api/backtests/v2/`
- Stage: `launch`
- HTTP status: `500`
- Retry reason: `SERVER_5XX`
- Server response: `{"status":500,"error":"Internal Server Error","path":"/api/backtests/v2/"}`
- Подтвержденный пример: `symbol=SPELL/USDT`, `exchange=BYBIT_FUTURES`, `settings.type=SIMPLE`, `settings.priceStrategy=LOGARITHMIC`, `settings.orders=8`, `settings.martingale=50`, `settings.overlap=10`, `settings.indent=0.01`, `deposit.amount=1000`, `leverage=5`, `portion=2`, `stopLoss.indent=5`.
- Вероятная причина: актив остался в справочнике Veles, но по нему уже нет свежих свечей/рыночных данных. В подтвержденном примере запрос `GET /api/candles?symbol=SPELL%2FUSDT&exchange=BYBIT_FUTURES&interval=FIFTEEN_MINUTES&...&limit=300` вернул `[]`.
- Распознавание: при `HTTP 5xx` на V1/V2 launch очередь делает контрольный запрос свечей за последние `12` часов. Если ответ успешный и массив свечей пустой, ошибка классифицируется как `DELISTED_OR_NO_MARKET_DATA`.
- Реализация: классификация вынесена в общий `MarketDataHealthService`, запрос свечей выполняется через общий injected-helper `VelesMarketDataInjections`. Общая механика пометки текущего теста и оставшихся pending-тестов этой пары вынесена в `queueErrorActions`.
- Текущее поведение очереди при пустых свечах: текущий тест помечается `ERROR`, все следующие `PENDING` тесты с тем же `symbol + exchange` помечаются `ERROR` и удаляются из очереди запуска. Поток не останавливается и продолжает остальные активы.
- Область действия: обычный запуск из конфигуратора и запуск из вкладки `Бектесты`, потому что оба режима используют общие queue hooks.
- Пользовательский лог: `<SYMBOL> <EXCHANGE>: нет свежих свечей Veles за последние часы. Актив может быть делистнут или недоступен для бектеста.`
- Текущее поведение очереди, если свечи есть или проверка свечей не удалась: считать `5xx` retryable, логировать `WARN [queue] test.retry` с полным request/response snapshot и повторять до лимита.
- Что смотреть в bug report: `snapshot.data.trace.request.body`, `snapshot.data.trace.response.bodyText`, `snapshot.data.trace.response.status`, `snapshot.data.candleProbe`, `snapshot.data.classification`, `snapshot.data.skippedSameSymbol`.

## Network failed fetch

- Queue/API: V1/V2 launch/status
- Stage: `launch` или `status`
- Признаки: `Failed to fetch`, `NetworkError`, `Network request failed`
- Поведение при launch: текущий тест возвращается в `PENDING`, повтор через `60с`, максимум `10` попыток; после лимита поток останавливается.
- Поведение при status: повторная проверка статуса через `60с`, максимум `10` попыток; после лимита поток останавливается.
- Что смотреть в bug report: `trace.error`, `trace.method`, `trace.url`, online/Veles availability.

## Unauthorized / 401

- Queue/API: V1/V2 launch/status/context
- Признаки: `401`, `Unauthorized`
- Поведение: connection cache инвалидируется, расширение пытается заново получить вкладку и CSRF token. Если восстановление не удалось, поток останавливается с причиной `no_tab`, `no_token` или `unauthorized`.
- Что смотреть в bug report: `trace.response.status`, `trace.response.bodyText`, `queue.context_missing`, состояние вкладки Veles.

## Chrome scripting / tab frame failure

- Дата первого наблюдения: 2026-05-03
- Queue/API: V1/V2, любой injected request
- Stage: любой API stage
- HTTP status: отсутствует, запрос мог не дойти до Veles.
- Raw message examples: `Frame with ID 0 was removed.`, `No tab with id`, `The tab was closed`, `Cannot access contents of the page`, `Extension context invalidated`
- Поведение: считается ошибкой контекста вкладки. Расширение пытается восстановить контекст; если не удалось, поток останавливается.
- Что смотреть в bug report: `trace.error`, `trace.method`, `trace.url`, `batchId`, `index`.

## Test timeout

- Queue/API: V1/V2 status polling
- Stage: `status`
- Признак: активный тест выполняется дольше `MAX_TEST_DURATION_MS`.
- Поведение: тест помечается `TIMEOUT`, очередь продолжает следующие тесты.
- Что смотреть в bug report: `velesId`, `launchedAt`, status polling history.

## Veles status ERROR / FAILED

- Queue/API: V1/V2 status polling
- Stage: `status`
- Признак: `check.data.status` равен `ERROR` или `FAILED`.
- Поведение: тест помечается `ERROR`, очередь продолжает следующие тесты.
- Что смотреть в bug report: `check.data.error`, `trace` если был HTTP failure, `velesId`.

## Stats fetch failed

- Queue/API: V1/V2 stats
- Stage: `stats`
- Признак: `GET /api/backtests/statistics/{id}` вернул ошибку или не вернул stats.
- Поведение: сначала повтор через `10с`; если снова не удалось, создается `queue.stats_failure` snapshot и ошибка уходит наверх.
- Что смотреть в bug report: `trace.response.status`, `trace.response.bodyText`, `velesId`, `queueItem.payload`.

## Empty JavaScript Error

- Дата первого наблюдения: 2026-05-03
- Queue/API: неизвестно
- Stage: неизвестно
- Признак: `Error` без нормального сообщения.
- Старое поведение: причина терялась до сохранения request/response.
- Ожидаемое поведение после изменений: в bug report должен быть `errorSummary`, `trace` или fallback trace от `executeScript`.
- Что смотреть в bug report: `errorSummary`, `trace`, `snapshot.data.queueItem.payload`.

## Prevention - backtest name length

- Date added: 2026-05-06
- Helper: `BacktestNameValidationService`
- Prefix limit: `70` characters for configurator name prefix.
- Final Veles name limit: `100` characters for generated `payload.name`.
- Configurator behavior: base validation blocks queue start if the prefix is longer than `70`; generated queue item names are also checked before `queueController.run`.
- Backtests tab behavior: generated queue item names are checked after rendering `{template}`, `{symbol}`, `{pair}`, `{n}`, `{total}`, `{batch}`. Launch is blocked before any request to Veles if at least one generated name is too long.
