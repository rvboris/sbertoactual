import * as fsPromises from "node:fs/promises";
import * as fs from "node:fs";
import { Readable } from "node:stream";
import * as path from "node:path";
import * as api from "@actual-app/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SberToActual from "../src/index";

vi.mock("node:fs/promises");
vi.mock("node:fs");
vi.mock("@actual-app/api");

const stringToStream = (str: string) => {
	const stream = new Readable();
	stream.push(str);
	stream.push(null);
	return stream;
};

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
		// Use as any to avoid complex oclif Config types in tests
		command = new SberToActual([], {} as any);
		command.log = vi.fn();
		command.error = vi.fn((msg) => {
			throw new Error(msg);
		}) as any;
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
			vi.spyOn(fs, "createReadStream").mockImplementation(
				() => stringToStream(header + mockInput) as any,
			);
			const writeFileSpy = vi
				.spyOn(fsPromises, "writeFile")
				.mockImplementation(() => Promise.resolve());

			const records = await command.convert();

			expect(writeFileSpy).toHaveBeenCalled();
			expect(records.length).toBe(1);
			expect(records[0]).toEqual({
				Date: "20.02.2026",
				Payee: "PAYEE_NAME",
				Category: "CATEGORY_NAME",
				Notes: "AuthCode: AUTH123",
				Amount: "100.50",
			});
		});

		it("should handle empty lines and skip invalid ones", async () => {
			const mockInput =
				"\n\n20.02.2026 12:00:00;1234;AUTH123;PAYEE_NAME;CATEGORY_NAME;100.50\nincomplete;line\n";
			vi.spyOn(fs, "createReadStream").mockImplementation(
				() => stringToStream(`Header\n${mockInput}`) as any,
			);
			const writeFileSpy = vi
				.spyOn(fsPromises, "writeFile")
				.mockImplementation(() => Promise.resolve());

			const records = await command.convert();

			expect(records.length).toBe(1);
		});
	});

	describe("setup", () => {
		it("should create group and categories if they do not exist", async () => {
			const mockCsv =
				'Date,Payee,Category,Notes,Amount\n"20.02.2026","Payee","New Category","",100.50';
			vi.spyOn(fs, "createReadStream").mockImplementation(
				() => stringToStream(mockCsv) as any,
			);

			vi.spyOn(api, "getCategoryGroups").mockResolvedValue([]);
			vi.spyOn(api, "createCategoryGroup").mockResolvedValue("group-id");
			vi.spyOn(api, "getCategories").mockResolvedValue([]);
			vi.spyOn(api, "createCategory").mockResolvedValue("cat-id" as any);

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
				'Date,Payee,Category,Notes,Amount\n"20.02.2026","Payee","Existing Category","",100.50';
			vi.spyOn(fs, "createReadStream").mockImplementation(
				() => stringToStream(mockCsv) as any,
			);

			vi.spyOn(api, "getCategoryGroups").mockResolvedValue([
				{ id: "group-id", name: "Импорт из Сбера" } as any,
			]);
			vi.spyOn(api, "getCategories").mockResolvedValue([
				{ id: "cat-id", name: "Existing Category" } as any,
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
				'Date,Payee,Category,Notes,Amount\n"20.02.2026","Payee","Cat","AuthCode: 123",100.50';
			vi.spyOn(fs, "createReadStream").mockImplementation(
				() => stringToStream(mockCsv) as any,
			);

			vi.spyOn(api, "getAccounts").mockResolvedValue([
				{ id: "acc-id", name: "Sber" } as any,
			]);
			vi.spyOn(api, "getCategories").mockResolvedValue([
				{ id: "cat-id", name: "Cat" } as any,
			]);
			vi.spyOn(api, "importTransactions").mockResolvedValue({
				status: "ok",
			} as any);

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
				{ id: "acc-id", name: "Sber" } as any,
			]);

			await expect(command.upload()).rejects.toThrow();
		});

		it("should generate consistent imported_id", async () => {
			process.env.ACTUAL_ACCOUNT_ID = "acc-id";
			const mockCsv =
				'Date,Payee,Category,Notes,Amount\n"20.02.2026","Payee","Cat","Notes",100.50';
			vi.spyOn(fs, "createReadStream").mockImplementation(
				() => stringToStream(mockCsv) as any,
			);

			vi.spyOn(api, "getAccounts").mockResolvedValue([
				{ id: "acc-id", name: "Sber" } as any,
			]);
			vi.spyOn(api, "getCategories").mockResolvedValue([
				{ id: "cat-id", name: "Cat" } as any,
			]);
			const importSpy = vi
				.spyOn(api, "importTransactions")
				.mockResolvedValue({ status: "ok" } as any);

			await command.upload();

			const transactions = importSpy.mock.calls[0][1] as any[];
			const id1 = transactions[0].imported_id;

			await command.upload();
			const id2 = (importSpy.mock.calls[1][1] as any[])[0].imported_id;

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
				{ id: "acc-1", name: "Checking" } as any,
				{ id: "acc-2", name: "Savings" } as any,
			]);

			await command.list();

			expect(logger.info).toHaveBeenCalledWith(
				expect.arrayContaining([expect.stringContaining("AVAILABLE ACCOUNTS")]),
			);
		});
	});

	describe("run", () => {
		it("should call list when mode is list", async () => {
			vi.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
			vi.spyOn(command as any, "parse").mockResolvedValue({
				flags: { mode: "list" },
			});
			const listSpy = vi.spyOn(command, "list").mockResolvedValue(undefined);

			await command.run();

			expect(listSpy).toHaveBeenCalled();
		});

		it("should call all methods when mode is all", async () => {
			vi.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
			vi.spyOn(command as any, "parse").mockResolvedValue({
				flags: { mode: "all" },
			});
			const convertSpy = vi.spyOn(command, "convert").mockResolvedValue([]);
			const setupSpy = vi.spyOn(command, "setup").mockResolvedValue(undefined);
			const uploadSpy = vi.spyOn(command, "upload").mockResolvedValue(undefined);

			await command.run();

			expect(convertSpy).toHaveBeenCalled();
			expect(setupSpy).toHaveBeenCalled();
			expect(uploadSpy).toHaveBeenCalled();
		});

		it("should only call convert when mode is convert", async () => {
			vi.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
			vi.spyOn(command as any, "parse").mockResolvedValue({
				flags: { mode: "convert" },
			});
			const convertSpy = vi.spyOn(command, "convert").mockResolvedValue([]);
			const setupSpy = vi.spyOn(command, "setup").mockResolvedValue(undefined);
			const uploadSpy = vi.spyOn(command, "upload").mockResolvedValue(undefined);

			await command.run();

			expect(convertSpy).toHaveBeenCalled();
			expect(setupSpy).not.toHaveBeenCalled();
			expect(uploadSpy).not.toHaveBeenCalled();
		});

		it("should log error on failure", async () => {
			vi.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
			vi.spyOn(command as any, "parse").mockRejectedValue(new Error("Test error"));
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
