# sbertoactual

Автоматизация импорта выписок Сбербанка (дебетовые и кредитные карты) в [Actual Budget](https://actualbudget.org/).

## Особенности

- **Поддержка форматов:** Прямой импорт CSV и PDF выписок (использует [Sberbank2Excel](https://github.com/Ev2geny/Sberbank2Excel)).
- **Автоматизация категорий:** Автоматическое создание групп и категорий в Actual Budget на основе данных из выписки.
- **Дедупликация:** Каждая транзакция получает уникальный `imported_id` (на основе даты, суммы и описания), что предотвращает повторный импорт одних и тех же данных.
- **Два режима работы:** Гибкий CLI для локального использования и REST API сервер для интеграций.

## Быстрый старт (Docker)

Это рекомендуемый способ запуска, так как он включает все необходимые зависимости (Node.js, Python, uv).

1. Создайте файл `.env` (см. раздел "Конфигурация").
2. Соберите и запустите контейнер:

```bash
docker build -t sbertoactual .
docker run -d 
  -p 3000:3000 
  -v ./data:/app/data 
  --env-file .env 
  --name sbertoactual 
  sbertoactual
```

## Локальная установка

### Требования
- **Node.js:** v20+
- **pnpm:** Рекомендуется (через Corepack)
- **Python 3:** Для обработки PDF через [uv](https://docs.astral.sh/uv/)

### Установка зависимостей
1. Установите Node.js пакеты:
   ```bash
   pnpm install
   ```
2. Установите инструмент конвертации PDF:
   ```bash
   uv tool install git+https://github.com/Ev2geny/Sberbank2Excel.git
   ```

## Конфигурация (.env)

| Переменная | Описание |
| :--- | :--- |
| `ACTUAL_SERVER_URL` | URL вашего сервера Actual Budget |
| `ACTUAL_SERVER_PASSWORD` | Пароль пользователя |
| `ACTUAL_SYNC_ID` | Sync ID вашего бюджета |
| `ACTUAL_BUDGET_PASSWORD` | Пароль шифрования бюджета (если установлен) |
| `ACTUAL_ACCOUNT_ID` | ID счета в Actual Budget, куда пойдут транзакции |
| `ACTUAL_GROUP_NAME` | Имя группы категорий. По умолчанию: "Импорт из Сбера" |
| `PORT` | Порт сервера. По умолчанию: `3000` |

## Использование

### Режим сервера (API)
Запустите сервер:
```bash
pnpm run server
```

Отправьте файл выписки через `curl`:
```bash
# Для PDF
curl -X POST -F "file=@statement.pdf" http://localhost:3000/upload

# Для CSV
curl -X POST -F "file=@statement.csv" http://localhost:3000/upload
```

### Режим командной строки (CLI)
Положите файл выписки в папку `data/` и выполните:
```bash
# Полный цикл: конвертация + создание категорий + загрузка
env INPUT_FILE="my_statement.pdf" pnpm start -- --mode=all
```

Доступные режимы `--mode`: `convert`, `setup`, `upload`, `list`, `all`.

## Разработка и тестирование

- **Проверка типов:** `pnpm run type-check`
- **Запуск тестов:** `pnpm test`
- **Линтинг:** `pnpm run lint`

## Лицензия

Проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).
