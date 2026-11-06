---
name: extract-price
description: Извлекает актуальную цену и наличие товара из карточки Ozon по ссылке вида ozon.ru/product/...-<id>. Используй, когда просят «узнать цену», «сколько стоит» товар на Ozon, сравнить цену с Ozon Картой и без неё или распарсить данные карточки Ozon. Возвращает обычную цену, цену с Ozon Картой и наличие. В ответ выводится ТОЛЬКО JSON-объект, без пояснений.
---

# Извлечение цен с Ozon

## Формат ответа (жёсткое правило)

В ответ пользователю выводится **только** JSON-объект и ничего больше:

```json
{"regular_price": "522 ₽", "sale_price": "470 ₽", "has_credit": false}
```

- `regular_price` — обычная цена («С другими банками»).
- `sale_price` — цена с Ozon Картой («С банками»).
- `has_credit` — всегда `false` для рассрочки.

**Запрещено** добавлять любой текст: заголовки, название товара, наличие, рейтинг,
отзывы, дату, оговорки про регион, markdown-обёртки и комментарии. Только объект.
Если цену получить не удалось — тоже только объект:

```json
{"error": "ozon_blocked"}
```

## Главное, что нужно знать

1. **ID товара — последнее число в URL** (`...-boho-731553575` → `731553575`).
2. **Ozon блокирует не по IP, а по отпечатку клиента.** Выходной IP может быть
   обычным домашним — это ничего не меняет. Признак блока: `403` и страница
   «Похоже, нет соединения / Выключите VPN…» с incident ID.
3. **Что блокируется:** `curl` (даже с полным набором браузерных заголовков
   `sec-ch-ua`, `Sec-Fetch-*`), **headless** Chrome (`--headless=new --dump-dom`),
   прокси переводчиков.
4. **Что работает:** настоящий **видимый** Chrome с включённым DevTools-портом.
   Cookies и профиль пользователя не нужны — чистый профиль проходит. Именно это
   делает `scripts/fetch_page.mjs`.

## Шаг 1. Загрузить страницу

```bash
node .claude/skills/extract-price/scripts/fetch_page.mjs \
  "https://www.ozon.ru/product/5659780691/" /tmp/ozon-5659780691.html --timeout=45
```

Скрипт:

- поднимает **видимый** Chrome (`--remote-debugging-port=9222 --remote-allow-origins=*`)
  с временным профилем и отвязывает процесс через `Win32_Process.Create`
  (обычный `spawn`/`&` умирает вместе с вызывающим шеллом);
- ждёт появления виджета `[id^="state-webPrice-"]` (до `--timeout`, по умолчанию 40 с);
- падает с `{"error": "..."}` при блок-странице или таймауте;
- сохраняет DOM и закрывает браузер.

На успех печатает `{"html": "...", "url": "...", "title": "..."}`.
Флаг `--keep-open` оставляет окно Chrome открытым для отладки.

**Не удалось загрузить?** Проверь, что Chrome установлен (`CHROME_PATH`), порт 9222
свободен и запрос не идёт через VPN. Фолбэк — прокси Google Translate (шаг 1b),
он нестабилен и часто отдаёт 302-петлю `?__rr=N` или страницу Google
«Can’t translate this page».

### Шаг 1b (фолбэк). Прокси Google Translate

```bash
ID=731553575
curl -sS -L --max-redirs 8 --max-time 60 \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" \
  -H "Accept-Language: ru-RU,ru;q=0.9" \
  "https://www-ozon-ru.translate.goog/product/${ID}/?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en&_x_tr_pto=wapp" \
  -o "/tmp/ozon-${ID}.html" -w "%{http_code} %{size_download}\n"
```

Признак успеха: `200`, ~500–900 КБ, в HTML есть `state-webPrice` и JSON-LD.
При `429` подождать 45–60 с и повторить **один** раз.

## Шаг 2. Разобрать HTML

```bash
node .claude/skills/extract-price/scripts/extract_price.mjs /tmp/ozon-5659780691.html
```

Скрипт печатает JSON с полями `regularPrice`, `cardPrice`, `available`, `rating`
и т. д. — это внутренние данные для проверки, **в ответ их не переносить**.

Проверить себя:

1. `sku` == ID из URL.
2. `regularPrice` совпадает с `"price"` из JSON-LD.
3. В ответ уходит только `{regular_price, sale_price, has_credit}`.

Если скрипт недоступен, цены лежат в:

1. **JSON-LD** `application/ld+json`, `"@type":"Product"` → `offers.price` (обычная цена).
2. **Виджет** `<div id="state-webPrice-…" data-state="…">` (раскодировать HTML-сущности):
   `cardPrice` — с Ozon Картой, `price` — обычная, `isAvailable` — наличие.
3. **Видимые элементы**: `tsHeadline600Large` (цена с картой), `pdp_bj2` (зачёркнутая).

## Подводные камни

- **Варианты товара.** В HTML десятки `"price"` от других цветов/камней. Доверяй
  только JSON-LD с `sku`, совпадающим с ID из URL, и **первому** `state-webPrice`.
- **Не бери данные из «похожих товаров»** и блоков рекомендаций.
- **Рассрочка** («Оплатить позже без %») — не цена товара.
- **Не выдумывай.** Нет `state-webPrice` и JSON-LD — отдай `{"error":"ozon_blocked"}`.

## Что не сработало (не тратить время)

- `curl` и любой headless-браузер → страница «Похоже, нет соединения».
- Профиль/cookies пользователя копировать бесполезно: Chrome держит БД cookies
  с эксклюзивной блокировкой, а чистый профиль и так проходит.
- Прокси `r.jina.ai` → `451`; `allorigins.win`, `codetabs.com` → таймауты.
- `translatetheweb.com` (Bing) → отдаёт только JS-оболочку переводчика, без данных.
- Зеркала `m.ozon.ru`, `ozon.by`, `ozon.kz`, `ozon.com` — тот же блок.
- Поисковики по ID товара — цена не индексируется.
