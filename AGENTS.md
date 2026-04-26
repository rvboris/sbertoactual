# Project Overview: sbertoactual

This project automates the process of importing Sberbank debit card statements into [Actual Budget](https://actualbudget.org/). It handles CSV and PDF conversion, automatic category creation, and transaction uploading with built-in deduplication.

## Technologies
- **Runtime:** Node.js
- **API:** `@actual-app/api` (Actual Budget API)
- **Data Parsing:** `csv-parse`
- **PDF Processing:** `@rvboris/sberparse`

## Workflow

The import process follows these steps:

1.  **Conversion:**
    - For **CSV**: Reads the raw Sberbank CSV file.
    - For **PDF**: Uses `@rvboris/sberparse` to parse statements directly into normalized records.
    - Extracts `Date`, `Payee`, `Category`, `Notes` (includes AuthCode), and `Amount`.

2.  **Category Creation:**
    - Scans converted data for unique category names.
    - Connects to the Actual Budget server.
    - Creates a category group "Импорт из Сбера" if it doesn't exist.
    - Creates any missing categories within that group to ensure the upload succeeds.

3.  **Upload:**
    - Connects to the Actual Budget server.
    - Maps category names to their internal Actual Budget IDs.
    - Generates a unique `imported_id` for each transaction (using Date, Payee, Amount, and Notes) to prevent duplicate imports.
    - Uploads transactions to the specified account.

## Configuration

Settings are managed via `.env` file for the server or `CONFIG` objects within scripts:

- `ACTUAL_SERVER_URL`: URL of your Actual Budget instance.
- `ACTUAL_SERVER_PASSWORD`: Your Actual Budget server password.
- `ACTUAL_SYNC_ID`: The Sync ID of your budget.
- `ACTUAL_BUDGET_PASSWORD`: Your budget's end-to-end encryption password.
- `ACTUAL_ACCOUNT_ID`: The ID of the account in Actual Budget where transactions should be imported.

## Commands

### Prerequisites
Install Node.js dependencies:
```bash
pnpm install
```

PDF support is included via the npm dependency `@rvboris/sberparse`.

### Execution Steps
#### Server Mode
Start the web server to handle uploads via API:
```bash
pnpm run server
```

#### CLI Mode
1.  **Convert raw data:**
    ```bash
    pnpm run convert -- path/to/file.csv
    ```
2.  **Create missing categories:**
    ```bash
    pnpm run setup
    ```
3.  **Upload transactions:**
    ```bash
    pnpm run upload
    ```

## Development Conventions

- **Deduplication:** The project uses `imported_id` to ensure that running the upload script multiple times with the same data won't create duplicate transactions in Actual Budget.
- **Security:** `NODE_TLS_REJECT_UNAUTHORIZED = '0'` is used in the scripts to bypass self-signed certificate issues. This should be used with caution in production environments.
- **Data Persistence:** Local cache and metadata for Actual Budget are stored in the `./actual-data` directory.

# graphify
- **graphify** (`~/.agents/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

## graphify

This project may have a local graphify knowledge graph at `graphify-out/`.

Rules:
- If `graphify-out/GRAPH_REPORT.md` exists locally, use it for architecture or codebase questions
- If `graphify-out/wiki/index.md` exists locally, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` when a local graph is present
- If a local graph exists and code files were modified in this session, run `graphify update .` to keep it current (AST-only, no API cost)
