[🇷🇺 Русский](README.ru.md) | [🇬🇧 English](README.md)

# sbertoactual

Automating the import of Sberbank statements (debit and credit cards) into [Actual Budget](https://actualbudget.org/).

## Features

- **Format Support:** Direct import of CSV and PDF statements (uses [Sberbank2Excel](https://github.com/Ev2geny/Sberbank2Excel)).
- **Category Automation:** Automatic creation of groups and categories in Actual Budget based on statement data.
- **Deduplication:** Each transaction gets a unique `imported_id` (based on date, amount, and description), preventing the re-import of the same data.
- **Two Operation Modes:** Flexible CLI for local use and a REST API server for integrations.

## Quick Start (Docker)

This is the recommended way to run the application, as it includes all necessary dependencies (Node.js, Python, uv).

### Docker Compose (Recommended)
1. Create a `.env` file based on the example in the "Configuration" section.
2. Start the service:
```bash
docker compose up -d
```

### Docker CLI
If you prefer running it manually:
```bash
docker build -t sbertoactual .
docker run -d \
  -p 3000:3000 \
  -v ./data:/app/data \
  --env-file .env \
  --name sbertoactual \
  sbertoactual
```

## Local Installation

### Requirements
- **Node.js:** v24+ (matching `.nvmrc`)
- **pnpm:** Recommended (via Corepack)
- **Python 3:** Required for PDF processing via [uv](https://docs.astral.sh/uv/)

### Installing Dependencies
1. Install Node.js packages:
   ```bash
   pnpm install
   ```
2. Install the PDF conversion tool:
   ```bash
   uv tool install git+https://github.com/Ev2geny/Sberbank2Excel.git
   ```

## Configuration (.env)

| Variable | Description |
| :--- | :--- |
| `ACTUAL_SERVER_URL` | URL of your Actual Budget server |
| `ACTUAL_SERVER_PASSWORD` | User password |
| `ACTUAL_SYNC_ID` | Your budget's Sync ID |
| `ACTUAL_BUDGET_PASSWORD` | Budget encryption password (if set) |
| `ACTUAL_ACCOUNT_ID` | Account ID in Actual Budget where transactions will be imported |
| `ACTUAL_GROUP_NAME` | Name of the category group. Default: "Импорт из Сбера" |
| `PORT` | Server port. Default: `3000` |
| `API_KEY` | (Optional) Secret key to protect the server. If set, requests must include `X-API-Key` header |

## Usage

### Command Line Interface (CLI) Mode
Place your statement file in the `data/` folder and run the command with the desired mode.

Available `--mode` options:

- **`all` (default)**: Full import cycle. Sequentially runs `convert`, `setup`, and `upload`. The most convenient way for regular imports.
- **`convert`**: Only processes the input file (`PDF` or `CSV`). Extracts transactions and saves them to a temporary JSON file for later processing.
- **`setup`**: Checks and creates categories. Scans processed transactions and automatically creates missing categories in Actual Budget to prevent upload errors.
- **`upload`**: Uploads data only. Sends transactions to the Actual Budget server. Thanks to deduplication via `imported_id`, you can run this mode repeatedly without risking duplicates.
- **`list`**: Utility mode. Lists all accounts from your Actual Budget with their IDs (helps find the correct `ACTUAL_ACCOUNT_ID` for config).

Example run via `pnpm`:
```bash
# Import a file
env INPUT_FILE="my_statement.pdf" pnpm start -- --mode=all
```

Or using the globally installed package:
```bash
sber-actual --mode=list
```

### Server (API) Mode
Start the server to automate uploads via HTTP:
```bash
pnpm run server
```

Send a statement file using `curl`. If `API_KEY` is configured, include the header:
```bash
# For PDF
curl -X POST -H "X-API-Key: your-secret-key" -F "file=@statement.pdf" http://localhost:3000/upload

# For CSV
curl -X POST -H "X-API-Key: your-secret-key" -F "file=@statement.csv" http://localhost:3000/upload
```

## Development and Testing

- **Type checking:** `pnpm run type-check`
- **Run tests:** `pnpm test`
- **Linting:** `pnpm run lint`

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.