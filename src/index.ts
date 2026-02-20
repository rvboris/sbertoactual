import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import * as path from "node:path";
import * as api from "@actual-app/api";
import { Command, Flags } from "@oclif/core";
import { parse } from "csv-parse";
import * as dotenv from "dotenv";
import { configure, dispose, getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";

const logger = getLogger(["sber-actual"]);

interface TransactionRecord {
	Date: string;
	Payee: string;
	Category: string;
	Notes: string;
	Amount: string;
}

const DATA_DIR = "data";

export default class SberToActual extends Command {
	static description = "Import Sberbank statements to Actual Budget";

	static flags = {
		version: Flags.version({ char: "v" }),
		help: Flags.help({ char: "h" }),
		mode: Flags.string({
			char: "m",
			description: "Mode of operation",
			options: ["convert", "setup", "upload", "list", "all"],
			default: "all",
		}),
	};

	private get appConfig() {
		return {
			serverURL: process.env.ACTUAL_SERVER_URL || "",
			serverPassword: process.env.ACTUAL_SERVER_PASSWORD || "",
			syncId: process.env.ACTUAL_SYNC_ID || "",
			budgetPassword: process.env.ACTUAL_BUDGET_PASSWORD || "",
			accountId: process.env.ACTUAL_ACCOUNT_ID || "",
			groupName: process.env.ACTUAL_GROUP_NAME || "Импорт из Сбера",
			inputFile: process.env.INPUT_FILE || "Выписка по счёту дебетовой карты.csv",
			outputFile: process.env.OUTPUT_FILE || "actual_import.csv",
		};
	}

	private getPath(filename: string): string {
		return path.join(process.cwd(), DATA_DIR, filename);
	}

	async initApi() {
		const { serverURL, serverPassword, syncId, budgetPassword } = this.appConfig;

		logger.info`Connecting to server: ${serverURL}`;
		await api.init({
			serverURL,
			password: serverPassword,
			dataDir: this.getPath("actual-data"),
		});

		logger.info`Opening budget...`;
		await api.downloadBudget(syncId, { password: budgetPassword });
	}

	/**
	 * Convert raw Sberbank CSV to internal format
	 */
	async convert(): Promise<TransactionRecord[]> {
		const { inputFile, outputFile } = this.appConfig;
		const inputPath = this.getPath(inputFile);

		logger.info`Reading Sberbank CSV: ${inputPath}`;
		const records: TransactionRecord[] = [];

		const parser = createReadStream(inputPath).pipe(
			parse({
				delimiter: ";",
				from_line: 2,
				skip_empty_lines: true,
				trim: true,
				relax_column_count: true,
			}),
		);

		for await (const cols of parser) {
			if (cols.length >= 6) {
				records.push({
					Date: (cols[0] || "").split(" ")[0],
					Payee: cols[3] || "",
					Category: cols[4] || "",
					Notes: cols[2] ? `AuthCode: ${cols[2]}` : "",
					Amount: (cols[5] || "0").replace(/\s/g, "").replace(",", "."),
				});
			}
		}

		const outputPath = this.getPath(outputFile);
		const csvContent = [
			"Date,Payee,Category,Notes,Amount",
			...records.map(
				(r) =>
					`"${r.Date}","${r.Payee.replace(/"/g, '""')}","${r.Category.replace(
						/"/g,
						'""',
					)}","${r.Notes.replace(/"/g, '""')}",${r.Amount}`,
			),
		].join("\n");

		await fs.writeFile(outputPath, csvContent);
		logger.info`Successfully converted ${records.length} transactions to ${outputPath}`;

		return records;
	}

	/**
	 * Automatically create missing categories
	 */
	async setup(providedRecords?: TransactionRecord[]) {
		const records = providedRecords || (await this.loadImportedCsv());
		const { groupName } = this.appConfig;

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

	/**
	 * Upload transactions to Actual Budget
	 */
	async upload(providedRecords?: TransactionRecord[]) {
		const records = providedRecords || (await this.loadImportedCsv());
		const { accountId } = this.appConfig;

		await this.initApi();

		const accounts = await api.getAccounts();
		const account = accounts.find((a) => a.id === accountId);

		if (!account) {
			logger.error`Account ${accountId} not found. Available accounts:`;
			for (const acc of accounts) logger.info` - ${acc.name} (${acc.id})`;
			process.exit(1);
		}

		const categories = await api.getCategories();
		const categoryMap = new Map(
			categories.map((c) => [c.name.toLowerCase(), c.id]),
		);

		const transactions = records.map((record) => {
			const amount = Math.round(parseFloat(record.Amount) * 100);
			const imported_id = Buffer.from(
				`${record.Date}${record.Payee}${record.Amount}${record.Notes}`,
			)
				.toString("base64")
				.substring(0, 64);

			return {
				date: record.Date,
				payee_name: record.Payee,
				category: categoryMap.get(record.Category.toLowerCase()),
				notes: record.Notes,
				amount,
				account: accountId,
				imported_id,
				cleared: true,
			};
		});

		logger.info`Uploading ${transactions.length} transactions to "${account.name}"...`;
		await api.importTransactions(accountId, transactions);
		logger.info`Import successful!`;
		await api.shutdown();
	}

	async list() {
		await this.initApi();
		const accounts = await api.getAccounts();
		logger.info`AVAILABLE ACCOUNTS:`;
		if (accounts.length === 0) {
			logger.info`No accounts found.`;
		} else {
			for (const acc of accounts) {
				logger.info`Name: ${acc.name.padEnd(20)} ID: ${acc.id}`;
			}
		}
		await api.shutdown();
	}

	private async loadImportedCsv(): Promise<TransactionRecord[]> {
		const csvPath = this.getPath(this.appConfig.outputFile);
		const records: TransactionRecord[] = [];
		const parser = createReadStream(csvPath).pipe(
			parse({ columns: true, skip_empty_lines: true }),
		);
		for await (const record of parser) {
			records.push(record as TransactionRecord);
		}
		return records;
	}

	async init() {
		dotenv.config();
		await configure({
			sinks: {
				stdout: (record) => {
					process.stdout.write(prettyFormatter(record));
				},
			},
			loggers: [
				{ category: ["sber-actual"], lowestLevel: "info", sinks: ["stdout"] },
				{ category: ["logtape"], lowestLevel: "warning", sinks: ["stdout"] },
			],
		});
		console.log = console.info = console.warn = () => {};
	}

	async run() {
		if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}

		try {
			const { flags } = await this.parse(SberToActual);
			await fs.mkdir(this.getPath("actual-data"), { recursive: true });

			if (flags.mode === "list") {
				await this.list();
				return;
			}

			let records: TransactionRecord[] | undefined;

			if (flags.mode === "convert" || flags.mode === "all") {
				records = await this.convert();
			}
			if (flags.mode === "setup" || flags.mode === "all") {
				await this.setup(records);
			}
			if (flags.mode === "upload" || flags.mode === "all") {
				await this.upload(records);
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`❌ error sber-actual Error: ${message}\n`);
			process.exit(1);
		} finally {
			await dispose();
		}
	}
}

if (require.main === module) {
	SberToActual.run().catch((err) => {
		console.error("FATAL ERROR:", err);
		process.exit(1);
	});
}
