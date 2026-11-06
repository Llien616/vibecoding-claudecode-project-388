---
description: Узнать цену и наличие товара на Ozon
argument-hint: <ссылка на товар Ozon>
allowed-tools: Bash(curl:*), Bash(node:*), Read, Write
---

Определи цену и наличие товара по ссылке: $ARGUMENTS

1. Прочитай `.claude/skills/extract-price/SKILL.md` и действуй по ней.
2. Скачай HTML карточки через прокси Google Translate и разбери его скриптом
   `.claude/skills/extract-price/scripts/extract_price.mjs`.
3. Ответь в формате скилла: обычная цена, цена с Ozon Картой, наличие.
   Обязательно укажи дату получения данных и оговорку, что цена зависит
   от региона и аккаунта.
