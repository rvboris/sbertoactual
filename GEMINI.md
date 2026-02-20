# Project Overview: sbertoactual

This project automates the process of importing Sberbank debit card statements into [Actual Budget](https://actualbudget.org/). It handles CSV conversion, automatic category creation, and transaction uploading with built-in deduplication.

## Technologies
- **Runtime:** Node.js
- **API:** `@actual-app/api` (Actual Budget API)
- **Data Parsing:** `csv-parse`

## Workflow

The import process follows these steps:

1.  **Conversion (`convert.js`):**
    - Reads the raw Sberbank CSV file (`Выписка по счёту дебетовой карты.csv`).
    - Extracts `Date`, `Payee`, `Category`, `Notes` (includes AuthCode), and `Amount`.
    - Outputs `actual_import.csv`.

2.  **Category Creation (`create_categories.js`):**
    - Scans `actual_import.csv` for unique category names.
    - Connects to the Actual Budget server.
    - Creates a category group "Импорт из Сбера" if it doesn't exist.
    - Creates any missing categories within that group to ensure the upload succeeds.

3.  **Upload (`upload.js`):**
    - Connects to the Actual Budget server.
    - Maps category names to their internal Actual Budget IDs.
    - Generates a unique `imported_id` for each transaction (using Date, Payee, Amount, and Notes) to prevent duplicate imports.
    - Uploads transactions to the specified account.

## Configuration

Settings are managed via `CONFIG` objects within the scripts (`create_categories.js` and `upload.js`):

- `serverURL`: URL of your Actual Budget instance.
- `serverPassword`: Your Actual Budget server password.
- `syncId`: The Sync ID of your budget.
- `budgetPassword`: Your budget's end-to-end encryption password.
- `accountId`: The ID of the account in Actual Budget where transactions should be imported.

## Commands

### Prerequisites
Install dependencies:
```bash
npm install
```

### Execution Steps
1.  **Convert raw data:**
    ```bash
    node convert.js
    ```
2.  **Create missing categories:**
    ```bash
    node create_categories.js
    ```
3.  **Upload transactions:**
    ```bash
    node upload.js
    ```

## Development Conventions

- **Deduplication:** The project uses `imported_id` to ensure that running the upload script multiple times with the same data won't create duplicate transactions in Actual Budget.
- **Security:** `NODE_TLS_REJECT_UNAUTHORIZED = '0'` is used in the scripts to bypass self-signed certificate issues. This should be used with caution in production environments.
- **Data Persistence:** Local cache and metadata for Actual Budget are stored in the `./actual-data` directory.
