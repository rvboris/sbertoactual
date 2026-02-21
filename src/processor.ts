import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import { exec } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import * as api from "@actual-app/api";
import { getLogger } from "@logtape/logtape";
import { parse as parseCsv } from "csv-parse";
import { format, parse as parseDate } from "date-fns";

const execAsync = promisify(exec);
const logger = getLogger(["sber-actual", "processor"]);

export function formatDate(dateStr: string): string {
  const datePart = dateStr.split(" ")[0] || "";
  try {
    const parsedDate = parseDate(datePart, "dd.MM.yyyy", new Date());
    if (!isNaN(parsedDate.getTime())) {
      return format(parsedDate, "yyyy-MM-dd");
    }
  } catch (e) {
    // Ignore and return original
  }
  return datePart;
}

export interface TransactionRecord {
  Date: string;
  Payee: string;
  Category: string;
  Notes: string;
  Amount: string;
}

export interface ProcessorConfig {
  serverURL: string;
  serverPassword: string;
  syncId: string;
  budgetPassword: string;
  accountId: string;
  groupName: string;
  dataDir: string;
}

interface ActualTransaction {
  date: string;
  payee_name: string;
  category?: string | null;
  notes?: string;
  amount: number;
  account: string;
  imported_id?: string;
  cleared?: boolean;
}

export class ActualProcessor {
  constructor(private config: ProcessorConfig) {}

  async initApi(): Promise<void> {
    const { serverURL, serverPassword, syncId, budgetPassword } = this.config;
    const actualDataDir = path.join(this.config.dataDir, "actual-data");

    logger.info`Connecting to server: ${serverURL}`;

    await fs.mkdir(actualDataDir, { recursive: true });

    await api.init({
      serverURL,
      password: serverPassword,
      dataDir: actualDataDir,
    });

    logger.info`Opening budget...`;

    await api.downloadBudget(syncId, { password: budgetPassword });
  }

  async convertPdf(inputFilePath: string): Promise<string> {
    const dir = path.dirname(inputFilePath);
    const ext = path.extname(inputFilePath);
    const base = path.basename(inputFilePath, ext);
    const outputCsvPath = path.join(dir, `${base}.csv`);

    logger.info`Converting PDF to CSV: ${inputFilePath}`;

    try {
      const { stdout, stderr } = await execAsync(
        `sberbank2Excel -t csv "${inputFilePath}"`,
        {
          env: { ...process.env, PYTHONUTF8: "1" },
          encoding: "utf8",
          timeout: 30000, // 30 seconds timeout
        },
      );

      if (stderr) {
        logger.warn`sberbank2Excel stderr: ${stderr}`;
      }

      logger.info`sberbank2Excel stdout: ${stdout}`;

      return outputCsvPath;
    } catch (error) {
      logger.error`PDF conversion failed: ${error}`;
      throw new Error(`Failed to convert PDF to CSV: ${error}`);
    }
  }

  async convert(inputFilePath: string): Promise<TransactionRecord[]> {
    logger.info`Reading Sberbank CSV: ${inputFilePath}`;

    const records: TransactionRecord[] = [];

    const parser = createReadStream(inputFilePath).pipe(
      parseCsv({
        delimiter: ";",
        from_line: 2,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }),
    );

    for await (const record of parser) {
      const cols = record as string[];
      if (cols.length >= 6) {
        records.push({
          Date: formatDate(cols[0] || ""),
          Payee: cols[3] || "",
          Category: cols[4] || "",
          Notes: cols[2] ? `AuthCode: ${cols[2]}` : "",
          Amount: (cols[5] || "0").replace(/\s/g, "").replace(",", "."),
        });
      }
    }

    logger.info`Successfully converted ${records.length} transactions`;

    return records;
  }

  async setup(records: TransactionRecord[]): Promise<void> {
    const { groupName } = this.config;

    await this.initApi();

    const uniqueCategories = [
      ...new Set(records.map((r) => r.Category).filter(Boolean)),
    ];
    const groups = await api.getCategoryGroups();
    let importGroup = groups.find((g) => g.name === groupName);

    if (!importGroup) {
      logger.info`Creating category group: ${groupName}`;

      const groupId = await api.createCategoryGroup({ name: groupName });
      importGroup = { id: groupId, name: groupName, is_income: false };
    }

    const existingCategories = await api.getCategories();
    const existingNames = new Set(
      existingCategories.map((c) => c.name.toLowerCase()),
    );

    let createdCount = 0;
    for (const catName of uniqueCategories) {
      if (!existingNames.has(catName.toLowerCase()) && importGroup.id) {
        logger.info`Adding new category: ${catName}`;
        await api.createCategory({ name: catName, group_id: importGroup.id });
        createdCount++;
      }
    }

    logger.info`Category sync complete. Added ${createdCount} new categories.`;

    await api.shutdown();
  }

  async upload(records: TransactionRecord[]): Promise<void> {
    const { accountId } = this.config;

    await this.initApi();

    const accounts = await api.getAccounts();
    const account = accounts.find((a) => a.id === accountId);

    if (!account) {
      const accList = accounts.map((a) => `${a.name} (${a.id})`).join(", ");
      throw new Error(`Account ${accountId} not found. Available: ${accList}`);
    }

    const categories = await api.getCategories();
    const categoryMap = new Map<string, string>(
      categories.map((c) => [c.name.toLowerCase(), c.id]),
    );

    const transactions: ActualTransaction[] = records.map((record) => {
      const amount = Math.round(parseFloat(record.Amount) * 100);
      const imported_id = Buffer.from(
        `${record.Date}${record.Payee}${record.Amount}${record.Notes}`,
      )
        .toString("base64")
        .substring(0, 64);

      return {
        date: record.Date,
        payee_name: record.Payee,
        category: categoryMap.get(record.Category.toLowerCase()) || null,
        notes: record.Notes,
        amount,
        account: accountId,
        imported_id,
        cleared: true,
      };
    });

    logger.info`Uploading ${transactions.length} transactions to "${account.name}"...`;

    await api.importTransactions(accountId, transactions as any);

    logger.info`Import successful!`;

    await api.shutdown();
  }

  async list(): Promise<{ name: string; id: string }[]> {
    await this.initApi();
    const accounts = await api.getAccounts();
    const results = accounts.map((acc) => ({ name: acc.name, id: acc.id }));
    await api.shutdown();
    return results;
  }
}
