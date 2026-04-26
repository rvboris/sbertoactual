# Contributing

Спасибо за вклад в `sbertoactual`.

## Prerequisites

- Node.js 24+
- `pnpm`

## Local Setup

```bash
pnpm install
```

Основные команды разработки:

- `pnpm start -- --mode=all` - запустить полный CLI-цикл из исходников
- `pnpm run server` - запустить HTTP API сервер из исходников
- `pnpm run build` - собрать TypeScript в `dist/`
- `pnpm run type-check` - проверить типы
- `pnpm test` - запустить тесты
- `pnpm run coverage` - запустить тесты с покрытием
- `pnpm run lint` - запустить проверки Biome
- `pnpm run format` - отформатировать код

## Development Expectations

- Предпочитайте небольшие, точечные изменения вместо широких рефакторингов.
- Сохраняйте согласованное поведение CLI и HTTP API для одинаковых сценариев импорта.
- Не ломайте дедупликацию через `imported_id` без явной причины и тестов.
- Если меняется пользовательское поведение или конфигурация, обновляйте README и примеры использования.

## Tests

- Добавляйте или обновляйте тесты для любой нетривиальной логики импорта, обработки файлов или API.
- Перед открытием PR прогоняйте:

```bash
pnpm run type-check
pnpm run lint
pnpm run coverage
```

Текущие тестовые файлы находятся в `test/`:

- `test/index.test.ts`
- `test/processor.test.ts`
- `test/server.test.ts`
- `test/auth.test.ts`

## Import Flow Changes

Если вы меняете логику импорта:

- проверьте режимы `convert`, `setup`, `upload`, `all` и `list`;
- проверьте поведение для CSV и PDF, если изменение их затрагивает;
- сохраните совместимость с Actual Budget API и ожидаемым форматом `actual_import.csv`;
- обновите тесты и документацию вместе с изменением поведения.

## Commit and Pull Request Rules

- Используйте Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:` и т.д.
- Держите PR сфокусированными и явно описывайте пользовательские изменения.
- Если меняется логика импорта или API, добавляйте тесты в том же PR.

Этот репозиторий использует `release-please`, поэтому сообщения коммитов влияют на version bump и changelog.

## CI and Release Flow

- `.github/workflows/test.yml` запускается на `pull_request` и делегирует проверки в `.github/workflows/reusable-test.yml`.
- `.github/workflows/reusable-test.yml` выполняет install, type-check, lint, tests и coverage.
- `.github/workflows/npm-publish.yml` содержит интегрированный flow для `release-please`: release PR, обновление версии, `CHANGELOG.md`, проверку релизного коммита и публикацию в npm.
- `.github/workflows/docker-publish.yml` остаётся отдельным workflow для Docker-образов.

## When in Doubt

- Следуйте текущим шаблонам проекта.
- Обновляйте тесты и docs вместе с изменением поведения.
- Держите contributor-facing документацию синхронизированной с реальной конфигурацией репозитория.
