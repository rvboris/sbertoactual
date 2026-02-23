import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { configure, dispose, getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";
import { Command, Flags } from "@oclif/core";
import { parse } from "csv-parse";
import * as dotenv from "dotenv";
import { ActualProcessor, type TransactionRecord } from "./processor";

const logger = getLogger(["sber-actual"]);

const DATA_DIR = "data";

interface AppConfig {
	serverURL: string;
	serverPassword: string;
	syncId: string;
	budgetPassword: string;
	accountId: string;
	groupName: string;
	inputFile: string;
	outputFile: string;
}

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

	private get appConfig(): AppConfig {
		return {
			serverURL: process.env.ACTUAL_SERVER_URL || "",
			serverPassword: process.env.ACTUAL_SERVER_PASSWORD || "",
			syncId: process.env.ACTUAL_SYNC_ID || "",
			budgetPassword: process.env.ACTUAL_BUDGET_PASSWORD || "",
			accountId: process.env.ACTUAL_ACCOUNT_ID || "",
			groupName: process.env.ACTUAL_GROUP_NAME || "Импорт из Сбера",
			inputFile:
				process.env.INPUT_FILE || "Выписка по счёту дебетовой карты.csv",
			outputFile: process.env.OUTPUT_FILE || "actual_import.csv",
		};
	}

	private getPath(filename: string): string {
		return path.join(process.cwd(), DATA_DIR, filename);
	}

	private _processor: ActualProcessor | undefined;
	private get processor(): ActualProcessor {
		if (!this._processor) {
			const config = this.appConfig;
			this._processor = new ActualProcessor({
				...config,
				dataDir: path.join(process.cwd(), DATA_DIR),
			});
		}
		return this._processor;
	}

	async initApi(): Promise<void> {
		return this.processor.initApi();
	}

	async convert(): Promise<TransactionRecord[]> {
		const inputPath = this.getPath(this.appConfig.inputFile);
		const isPdf = inputPath.toLowerCase().endsWith(".pdf");

		let csvPath = inputPath;
		if (isPdf) {
			csvPath = await this.processor.convertPdf(inputPath);
		}

		const records = await this.processor.convert(csvPath);
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
		await fs.writeFile(this.getPath(this.appConfig.outputFile), csvContent);
		return records;
	}

	async setup(records?: TransactionRecord[]): Promise<void> {
		const data = records || (await this.loadImportedCsv());
		return this.processor.setup(data);
	}

	async upload(records?: TransactionRecord[]): Promise<void> {
		const data = records || (await this.loadImportedCsv());
		return this.processor.upload(data);
	}

	async list(): Promise<void> {
		const accounts = await this.processor.list();

		logger.info`AVAILABLE ACCOUNTS:`;

		if (accounts.length === 0) {
			logger.info`No accounts found.`;
		} else {
			for (const acc of accounts) {
				logger.info`Name: ${acc.name.padEnd(20)} ID: ${acc.id}`;
			}
		}
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

	async init(): Promise<void> {
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

	async run(): Promise<void> {
		if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}

		try {
			const { flags } = await this.parse(SberToActual);
			await fs.mkdir(path.join(process.cwd(), DATA_DIR), { recursive: true });

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
