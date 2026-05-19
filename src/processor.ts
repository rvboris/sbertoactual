import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as api from "@actual-app/api";
import { getLogger } from "@logtape/logtape";
import { parsePdf } from "@rvboris/sberparse";
import { parse as parseCsv } from "csv-parse";
import { format, parse as parseDate } from "date-fns";
import { stringifyUnknownError } from "./errors.js";

const logger = getLogger(["sber-actual", "processor"]);

function isOutOfSyncMigrationsError(error: unknown): boolean {
	return stringifyUnknownError(error).includes("out-of-sync-migrations");
}

async function safeShutdownApi(): Promise<void> {
	try {
		await api.shutdown();
	} catch (shutdownError) {
		logger.warn`Failed to shut down Actual API after an error: ${stringifyUnknownError(shutdownError)}`;
	}
}

export function formatDate(dateStr: string): string {
	const datePart = dateStr.split(" ")[0] || "";
	try {
		const parsedDate = parseDate(datePart, "dd.MM.yyyy", new Date());
		if (!Number.isNaN(parsedDate.getTime())) {
			return format(parsedDate, "yyyy-MM-dd");
		}
	} catch (_e) {
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

		try {
			await api.init({
				serverURL,
				password: serverPassword,
				dataDir: actualDataDir,
			});

			logger.info`Opening budget...`;

			await api.downloadBudget(syncId, { password: budgetPassword });
		} catch (error) {
			await safeShutdownApi();

			if (isOutOfSyncMigrationsError(error)) {
				throw new Error(
					"Actual API version mismatch: the bundled @actual-app/api is older than the Actual server or budget schema. Update @actual-app/api so it is not behind the server version.",
				);
			}

			throw new Error(
				`Failed to initialize Actual API: ${stringifyUnknownError(error)}`,
			);
		}
	}

	async convertPdf(inputFilePath: string): Promise<TransactionRecord[]> {
		logger.info`Parsing PDF statement: ${inputFilePath}`;

		try {
			const result = await parsePdf(inputFilePath);

			if (result.errors) {
				logger.warn`sberparse warnings: ${result.errors}`;
			}

			const records = result.transactions.map((transaction) => ({
				Date: format(transaction.operation_date, "yyyy-MM-dd"),
				Payee: transaction.description,
				Category: transaction.category,
				Notes: transaction.authorisation_code
					? `AuthCode: ${transaction.authorisation_code}`
					: "",
				Amount: transaction.value_account_currency.toFixed(2),
			}));

			logger.info`Successfully parsed ${records.length} PDF transactions`;

			return records;
		} catch (error) {
			const message = stringifyUnknownError(error);
			logger.error`PDF parsing failed: ${message}`;
			throw new Error(`Failed to parse PDF statement: ${message}`);
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
		await this.initApi();
		try {
			await this.setupCategories(records);
		} finally {
			await api.shutdown();
		}
	}

	async setupCategories(records: TransactionRecord[]): Promise<void> {
		const { groupName } = this.config;
		const startTime = performance.now();

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

		const duration = ((performance.now() - startTime) / 1000).toFixed(2);
		logger.info`Category sync complete. Added ${createdCount} new categories in ${duration}s.`;
	}

	async upload(records: TransactionRecord[]): Promise<void> {
		await this.initApi();
		try {
			await this.uploadTransactions(records);
		} finally {
			await api.shutdown();
		}
	}

	async uploadTransactions(records: TransactionRecord[]): Promise<void> {
		const { accountId } = this.config;
		const startTime = performance.now();

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

		// Chunk large imports to avoid potential timeouts or memory issues
		const CHUNK_SIZE = 100;
		for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
			const chunk = transactions.slice(i, i + CHUNK_SIZE);
			const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
			const totalChunks = Math.ceil(transactions.length / CHUNK_SIZE);

			if (totalChunks > 1) {
				logger.info`Uploading chunk ${chunkNum}/${totalChunks} (${chunk.length} transactions)...`;
			}

			await api.importTransactions(
				accountId,
				chunk as unknown as Parameters<typeof api.importTransactions>[1],
			);
		}

		const duration = ((performance.now() - startTime) / 1000).toFixed(2);
		logger.info`Import successful! Processed ${transactions.length} transactions in ${duration}s.`;
	}

	async list(): Promise<{ name: string; id: string }[]> {
		await this.initApi();
		const accounts = await api.getAccounts();
		const results = accounts.map((acc) => ({ name: acc.name, id: acc.id }));
		await api.shutdown();
		return results;
	}
}
