import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as api from "@actual-app/api";
import { configure, dispose, getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";
import { Command, Flags } from "@oclif/core";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";

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

	private getPath(filename: string): string {
		return path.join(process.cwd(), DATA_DIR, filename);
	}

	async initApi() {
		logger.info`Connecting to server...`;
		await api.init({
			serverURL: process.env.ACTUAL_SERVER_URL || "",
			password: process.env.ACTUAL_SERVER_PASSWORD || "",
			dataDir: this.getPath("actual-data"),
		});

		logger.info`Opening budget...`;
		await api.downloadBudget(process.env.ACTUAL_SYNC_ID || "", {
			password: process.env.ACTUAL_BUDGET_PASSWORD || "",
		});
	}

	async convert() {
		const inputFile =
			process.env.INPUT_FILE || "Выписка по счёту дебетовой карты.csv";
		const outputFile = process.env.OUTPUT_FILE || "actual_import.csv";

		const inputPath = this.getPath(inputFile);
		const outputPath = this.getPath(outputFile);

		logger.info`Converting ${inputPath}...`;
		const data = await fs.readFile(inputPath, "utf8");
		const lines = data.split("\n");

		const outputHeaders = ["Date", "Payee", "Category", "Notes", "Amount"];
		const result = [outputHeaders.join(",")];

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			const cols = line.split(";");
			if (cols.length < 6) continue;

			const rawDate = cols[0] || "";
			const date = rawDate.split(" ")[0];

			const authCode = (cols[2] || "").trim();
			const payee = (cols[3] || "").trim().replace(/"/g, '""');
			const category = (cols[4] || "").trim().replace(/"/g, '""');
			const amount = (cols[5] || "0").trim();
			const notes = authCode ? `AuthCode: ${authCode}` : "";

			result.push(`${date},"${payee}","${category}","${notes}",${amount}`);
		}

		await fs.writeFile(outputPath, result.join("\n"));
		logger.info`Processed ${result.length - 1} transactions to ${outputPath}`;
	}

	async setup() {
		const csvFile = process.env.OUTPUT_FILE || "actual_import.csv";
		const csvPath = this.getPath(csvFile);
		const groupName = process.env.ACTUAL_GROUP_NAME || "Импорт из Сбера";

		await this.initApi();

		logger.info`Scanning categories from ${csvPath}...`;
		const fileContent = await fs.readFile(csvPath, "utf8");
		const records = parse(fileContent, {
			columns: true,
			skip_empty_lines: true,
		}) as TransactionRecord[];
		const uniqueCategories = [
			...new Set(records.map((r) => r.Category).filter((c) => c?.trim())),
		];

		const groups = await api.getCategoryGroups();
		let importGroup = groups.find((g) => g.name === groupName);

		if (!importGroup) {
			logger.info`Creating group "${groupName}"...`;
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
				logger.info`Creating category: ${catName}`;
				await api.createCategory({
					name: catName,
					group_id: importGroup.id,
				});
				createdCount++;
			}
		}

		logger.info`Created ${createdCount} new categories.`;
		await api.shutdown();
	}

	async upload() {
		const csvFile = process.env.OUTPUT_FILE || "actual_import.csv";
		const csvPath = this.getPath(csvFile);
		const accountId = process.env.ACTUAL_ACCOUNT_ID;

		await this.initApi();

		const accounts = await api.getAccounts();

		if (!accountId) {
			logger.warn`--- ACCOUNTS LIST ---`;
			for (const acc of accounts) {
				logger.info`Name: ${acc.name}, ID: ${acc.id}`;
			}
			logger.warn`----------------------`;
			this.error("Please set ACTUAL_ACCOUNT_ID in your .env file.");
		}

		const account = accounts.find((a) => a.id === accountId);
		if (!account) {
			this.error(`Account with ID ${accountId} not found.`);
		}

		logger.info`Uploading to account: ${account.name}`;

		const categories = await api.getCategories();
		const categoryMap = new Map(
			categories.map((cat) => [cat.name.toLowerCase(), cat.id]),
		);

		const fileContent = await fs.readFile(csvPath, "utf8");
		const records = parse(fileContent, {
			columns: true,
			skip_empty_lines: true,
			relax_quotes: true,
		}) as TransactionRecord[];

		const transactions = records.map((record) => {
			const amount = Math.round(
				parseFloat(record.Amount.replace(",", ".")) * 100,
			);
			const uniqueString = `${record.Date}${record.Payee}${record.Amount}${record.Notes}`;
			const imported_id = Buffer.from(uniqueString)
				.toString("base64")
				.substring(0, 64);
			const categoryId = categoryMap.get(record.Category.toLowerCase());

			return {
				date: record.Date,
				payee_name: record.Payee,
				category: categoryId,
				notes: record.Notes,
				amount: amount,
				account: accountId,
				imported_id: imported_id,
				cleared: true,
			};
		});

		logger.info`Prepared ${transactions.length} transactions.`;
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
				logger.info`Name: ${acc.name} (ID: ${acc.id})`;
			}
		}

		await api.shutdown();
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
				{
					category: ["sber-actual"],
					lowestLevel: "info",
					sinks: ["stdout"],
				},
				{
					category: ["logtape"],
					lowestLevel: "warning",
					sinks: ["stdout"],
				},
			],
		});

		// Silence console.log from libraries
		console.log = () => {};
		console.info = () => {};
		console.warn = () => {};
	}

	async run() {
		// Bypass self-signed certificate issues if configured
		if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}

		try {
			const { flags } = await this.parse(SberToActual);

			const actualDataDir = this.getPath("actual-data");
			await fs.mkdir(actualDataDir, { recursive: true });

			if (flags.mode === "list") {
				await this.list();
				return;
			}

			if (flags.mode === "convert" || flags.mode === "all") {
				await this.convert();
			}
			if (flags.mode === "setup" || flags.mode === "all") {
				await this.setup();
			}
			if (flags.mode === "upload" || flags.mode === "all") {
				await this.upload();
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			// Use process.stderr directly if LogTape is failed or dispose called
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
