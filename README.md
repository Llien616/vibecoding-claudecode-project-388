# Трекер цен с Claude

[![hexlet-check](https://github.com/Llien616/vibecoding-claudecode-project-388/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/Llien616/vibecoding-claudecode-project-388/actions)

Трекер цен на Claude-скиллах: следит за товарами и присылает в Telegram только значимые
изменения. Учебный проект Хекслета — [Vibecoding на Claude-скиллах](https://ru.hexlet.io/programs/vibecoding-claudecode).

## Возможности

- Извлечение актуальной цены и наличия товара с Ozon по ссылке на карточку.
- Обход антибот-блока Ozon через прокси Google Translate.
- Сравнение обычной цены и цены с Ozon Картой.
- Скилл `extract-price` и слэш-команда `/check-price` для работы из Claude Code.

## Структура проекта

```text
.
├── .claude/
│   ├── settings.json              # общие permissions проекта
│   ├── settings.local.json        # личные настройки (в .gitignore)
│   ├── commands/
│   │   └── check-price.md         # /check-price <ссылка на Ozon>
│   └── skills/
│       └── extract-price/
│           ├── SKILL.md           # описание скилла и алгоритм обхода блокировки
│           └── scripts/
│               ├── fetch_page.mjs     # загрузка карточки через видимый Chrome + CDP
│               └── extract_price.mjs  # разбор сохранённого HTML
├── .github/workflows/hexlet-check.yml
├── CLAUDE.md                      # инструкции для Claude Code
└── README.md
```

## Установка

```bash
git clone https://github.com/Llien616/vibecoding-claudecode-project-388.git
cd vibecoding-claudecode-project-388
```

Зависимостей нет — нужен только Node.js 18+.

## Использование

В Claude Code:

```text
/check-price https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662
```

Или вручную: загрузить карточку и разобрать её скриптами скилла:

```bash
node .claude/skills/extract-price/scripts/fetch_page.mjs \
  "https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662/" /tmp/ozon-5247783662.html
node .claude/skills/extract-price/scripts/extract_price.mjs /tmp/ozon-5247783662.html
```

Ответ по скиллу — только JSON-объект:

```json
{"regular_price": "1 462 ₽", "sale_price": "1 316 ₽", "has_credit": false}
```

`fetch_page.mjs` открывает видимый Chrome с DevTools-портом: Ozon режет `curl` и
headless-браузеры по отпечатку клиента, а не по IP, поэтому обычный HTTP-запрос
получает страницу «Похоже, нет соединения».

Результат:

```json
{
  "productId": "5247783662",
  "name": "T.D.S. Браслет со вставками",
  "sku": "5247783662",
  "regularPrice": "1 462 ₽",
  "cardPrice": "1 316 ₽",
  "currency": "RUB",
  "available": true,
  "rating": "5.0",
  "reviews": "582",
  "sourceUrl": "https://www.ozon.ru/product/t-d-s-braslet-so-vstavkami-5247783662/"
}
```

`regularPrice` — цена «с другими банками», `cardPrice` — цена с Ozon Картой.
Данные зависят от региона и аккаунта.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
