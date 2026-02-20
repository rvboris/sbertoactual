import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as api from "@actual-app/api";
import { getLogger } from "@logtape/logtape";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SberToActual from "../src/index";

vi.mock("node:fs/promises");
vi.mock("@actual-app/api");

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock("@logtape/logtape", () => ({
	getLogger: vi.fn(() => mockLogger),
	configure: vi.fn(),
	getConsoleSink: vi.fn(),
	dispose: vi.fn(),
}));
vi.mock("@logtape/pretty", () => ({
	prettyFormatter: vi.fn(),
}));

describe("SberToActual", () => {
	let command: SberToActual;
	const logger = mockLogger;

	beforeEach(() => {
		vi.clearAllMocks();
		command = new SberToActual([], {
			log: vi.fn(),
			error: vi.fn(),
		} as unknown as SberToActual["config"]);
		command.log = vi.fn();
		command.error = vi.fn((msg) => {
			throw new Error(msg);
		}) as unknown as SberToActual["error"];
	});

	describe("initApi", () => {
		it("should initialize api with environment variables", async () => {
			process.env.ACTUAL_SERVER_URL = "http://test";
			process.env.ACTUAL_SERVER_PASSWORD = "pass";
			process.env.ACTUAL_SYNC_ID = "sync-id";
			process.env.ACTUAL_BUDGET_PASSWORD = "bud-pass";

			await command.initApi();

			expect(api.init).toHaveBeenCalledWith(
				expect.objectContaining({
					serverURL: "http://test",
					password: "pass",
					dataDir: expect.stringContaining(path.join("data", "actual-data")),
				}),
			);
			expect(api.downloadBudget).toHaveBeenCalledWith("sync-id", {
				password: "bud-pass",
			});
		});
	});

	describe("convert", () => {
		it("should correctly parse Sberbank CSV and write Actual import CSV", async () => {
			const mockInput =
				"20.02.2026 12:00:00;1234;AUTH123;PAYEE_NAME;CATEGORY_NAME;100.50\n";
			const header = "Дата;Карта;Код авторизации;Описание;Категория;Сумма\n";
			vi.spyOn(fs, "readFile").mockResolvedValue(header + mockInput);
			const writeFileSpy = vi
				.spyOn(fs, "writeFile")
				.mockImplementation(() => Promise.resolve());

			await command.convert();

			expect(writeFileSpy).toHaveBeenCalled();
			const content = writeFileSpy.mock.calls[0][1] as string;
			expect(content).toContain(
				'20.02.2026,"PAYEE_NAME","CATEGORY_NAME","AuthCode: AUTH123",100.50',
			);
		});

		it("should handle empty lines and skip invalid ones", async () => {
			const mockInput =
				"\n\n20.02.2026 12:00:00;1234;AUTH123;PAYEE_NAME;CATEGORY_NAME;100.50\nincomplete;line\n";
			vi.spyOn(fs, "readFile").mockResolvedValue(`Header\n${mockInput}`);
			const writeFileSpy = vi
				.spyOn(fs, "writeFile")
				.mockImplementation(() => Promise.resolve());

			await command.convert();

			const content = writeFileSpy.mock.calls[0][1] as string;
			const rows = content.split("\n");
			expect(rows.length).toBe(2); // Header + 1 data row
		});
	});

	describe("setup", () => {
		it("should create group and categories if they do not exist", async () => {
			const mockCsv =
				'Date,Payee,Category,Notes,Amount\n20.02.2026,"Payee","New Category","",100.50';
			vi.spyOn(fs, "readFile").mockResolvedValue(mockCsv);

			vi.spyOn(api, "getCategoryGroups").mockResolvedValue([]);
			vi.spyOn(api, "createCategoryGroup").mockResolvedValue("group-id");
			vi.spyOn(api, "getCategories").mockResolvedValue([]);
			vi.spyOn(api, "createCategory").mockResolvedValue("cat-id");

			await command.setup();

			expect(api.createCategoryGroup).toHaveBeenCalledWith({
				name: "Импорт из Сбера",
			});
			expect(api.createCategory).toHaveBeenCalledWith({
				name: "New Category",
				group_id: "group-id",
			});
		});

		it("should not create group/categories if they already exist", async () => {
			const mockCsv =
				'Date,Payee,Category,Notes,Amount\n20.02.2026,"Payee","Existing Category","",100.50';
			vi.spyOn(fs, "readFile").mockResolvedValue(mockCsv);

			vi.spyOn(api, "getCategoryGroups").mockResolvedValue([
				{ id: "group-id", name: "Импорт из Сбера" } as unknown as {
					id: string;
					name: string;
					is_income: boolean;
				},
			]);
			vi.spyOn(api, "getCategories").mockResolvedValue([
				{ id: "cat-id", name: "Existing Category" } as unknown as {
					id: string;
					name: string;
					is_income: boolean;
					group_id: string;
				},
			]);

			await command.setup();

			expect(api.createCategoryGroup).not.toHaveBeenCalled();
			expect(api.createCategory).not.toHaveBeenCalled();
		});
	});

	describe("upload", () => {
		it("should correctly prepare and upload transactions", async () => {
			process.env.ACTUAL_ACCOUNT_ID = "acc-id";
			const mockCsv =
				'Date,Payee,Category,Notes,Amount\n20.02.2026,"Payee","Cat","AuthCode: 123",100.50';
			vi.spyOn(fs, "readFile").mockResolvedValue(mockCsv);

			vi.spyOn(api, "getAccounts").mockResolvedValue([
				{ id: "acc-id", name: "Sber" } as unknown as {
					id: string;
					name: string;
				},
			]);
			vi.spyOn(api, "getCategories").mockResolvedValue([
				{ id: "cat-id", name: "Cat" } as unknown as {
					id: string;
					name: string;
					is_income: boolean;
					group_id: string;
				},
			]);
			vi.spyOn(api, "importTransactions").mockResolvedValue({
				status: "ok",
			} as unknown as { status: string });

			await command.upload();

			expect(api.importTransactions).toHaveBeenCalledWith(
				"acc-id",
				expect.arrayContaining([
					expect.objectContaining({
						date: "20.02.2026",
						payee_name: "Payee",
						category: "cat-id",
						amount: 10050,
						account: "acc-id",
					}),
				]),
			);
		});

		it("should throw error if account not found", async () => {
			process.env.ACTUAL_ACCOUNT_ID = "wrong-id";
			vi.spyOn(api, "getAccounts").mockResolvedValue([
				{ id: "acc-id", name: "Sber" } as unknown as {
					id: string;
					name: string;
				},
			]);

			await expect(command.upload()).rejects.toThrow(
				"Account with ID wrong-id not found.",
			);
		});

		it("should generate consistent imported_id", async () => {
			process.env.ACTUAL_ACCOUNT_ID = "acc-id";
			const mockCsv =
				'Date,Payee,Category,Notes,Amount\n20.02.2026,"Payee","Cat","Notes",100.50';
			vi.spyOn(fs, "readFile").mockResolvedValue(mockCsv);

			vi.spyOn(api, "getAccounts").mockResolvedValue([
				{ id: "acc-id", name: "Sber" } as unknown as {
					id: string;
					name: string;
				},
			]);
			vi.spyOn(api, "getCategories").mockResolvedValue([
				{ id: "cat-id", name: "Cat" } as unknown as {
					id: string;
					name: string;
					is_income: boolean;
					group_id: string;
				},
			]);
			const importSpy = vi
				.spyOn(api, "importTransactions")
				.mockResolvedValue({ status: "ok" } as unknown as { status: string });

			await command.upload();

			const transactions = importSpy.mock.calls[0][1] as unknown as {
				imported_id: string;
			}[];
			const id1 = transactions[0].imported_id;

			await command.upload();
			const id2 = (
				importSpy.mock.calls[1][1] as unknown as {
					imported_id: string;
				}[]
			)[0].imported_id;

			expect(id1).toBe(id2);
			expect(id1).toBe(
				Buffer.from("20.02.2026Payee100.50Notes")
					.toString("base64")
					.substring(0, 64),
			);
		});
	});

	describe("list", () => {
		it("should list available accounts", async () => {
			vi.spyOn(api, "getAccounts").mockResolvedValue([
				{ id: "acc-1", name: "Checking" } as unknown as {
					id: string;
					name: string;
					is_income: boolean;
				},
				{ id: "acc-2", name: "Savings" } as unknown as {
					id: string;
					name: string;
					is_income: boolean;
				},
			]);

			await command.list();

			// LogTape tagged templates pass strings array as first arg, then values
			expect(logger.info).toHaveBeenCalledWith(
				expect.arrayContaining([expect.stringContaining("AVAILABLE ACCOUNTS")]),
			);
			expect(logger.info).toHaveBeenCalledWith(
				expect.any(Array),
				"Checking",
				"acc-1",
			);
			expect(logger.info).toHaveBeenCalledWith(
				expect.any(Array),
				"Savings",
				"acc-2",
			);
		});

		it("should show message if no accounts found", async () => {
			vi.spyOn(api, "getAccounts").mockResolvedValue([]);

			await command.list();

			expect(logger.info).toHaveBeenCalledWith(
				expect.arrayContaining([expect.stringContaining("No accounts found.")]),
			);
		});
	});

	describe("run", () => {
		it("should call list when mode is list", async () => {
			vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
			// @ts-expect-error
			vi.spyOn(command, "parse").mockResolvedValue({
				flags: { mode: "list" },
			} as unknown as { flags: { mode: string } });
			const listSpy = vi.spyOn(command, "list").mockResolvedValue(undefined);

			await command.run();

			expect(listSpy).toHaveBeenCalled();
		});

		it("should call all methods when mode is all", async () => {
			vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
			// @ts-expect-error
			vi.spyOn(command, "parse").mockResolvedValue({
				flags: { mode: "all" },
			} as unknown as { flags: { mode: string } });
			const convertSpy = vi
				.spyOn(command, "convert")
				.mockResolvedValue(undefined);
			const setupSpy = vi.spyOn(command, "setup").mockResolvedValue(undefined);
			const uploadSpy = vi
				.spyOn(command, "upload")
				.mockResolvedValue(undefined);

			await command.run();

			expect(convertSpy).toHaveBeenCalled();
			expect(setupSpy).toHaveBeenCalled();
			expect(uploadSpy).toHaveBeenCalled();
		});

		it("should only call convert when mode is convert", async () => {
			vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
			// @ts-expect-error
			vi.spyOn(command, "parse").mockResolvedValue({
				flags: { mode: "convert" },
			} as unknown as { flags: { mode: string } });
			const convertSpy = vi
				.spyOn(command, "convert")
				.mockResolvedValue(undefined);
			const setupSpy = vi.spyOn(command, "setup").mockResolvedValue(undefined);
			const uploadSpy = vi
				.spyOn(command, "upload")
				.mockResolvedValue(undefined);

			await command.run();

			expect(convertSpy).toHaveBeenCalled();
			expect(setupSpy).not.toHaveBeenCalled();
			expect(uploadSpy).not.toHaveBeenCalled();
		});

		it("should log error on failure", async () => {
			vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
			// @ts-expect-error
			vi.spyOn(command, "parse").mockRejectedValue(new Error("Test error"));
			const exitSpy = vi
				.spyOn(process, "exit")
				.mockImplementation(() => undefined as never);
			const stderrSpy = vi
				.spyOn(process.stderr, "write")
				.mockImplementation(() => true);

			await command.run();

			expect(stderrSpy).toHaveBeenCalledWith(
				expect.stringContaining("Error: Test error"),
			);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});
	});
});
