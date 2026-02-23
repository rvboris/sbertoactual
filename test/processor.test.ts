import { exec } from "node:child_process";
import * as fs from "node:fs";
import { Readable } from "node:stream";
import * as api from "@actual-app/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActualProcessor, formatDate } from "../src/processor";

vi.mock("@actual-app/api");
vi.mock("node:fs");
vi.mock("node:child_process", () => ({
	exec: vi.fn(),
}));

const stringToStream = (str: string) => {
	const stream = new Readable();
	stream.push(str);
	stream.push(null);
	return stream;
};

describe("formatDate", () => {
	it("should convert DD.MM.YYYY to YYYY-MM-DD", () => {
		expect(formatDate("21.02.2026")).toBe("2026-02-21");
	});

	it("should handle date with time", () => {
		expect(formatDate("21.02.2026 10:00:00")).toBe("2026-02-21");
	});

	it("should return as is if format is already YYYY-MM-DD", () => {
		expect(formatDate("2026-02-21")).toBe("2026-02-21");
	});

	it("should return as is if format is unknown", () => {
		expect(formatDate("unknown")).toBe("unknown");
		expect(formatDate("21.02.26")).toBe("0026-02-21"); // date-fns parses 26 as year 26
	});
});

describe("ActualProcessor", () => {
	const config = {
		serverURL: "http://test",
		serverPassword: "pass",
		syncId: "sync",
		budgetPassword: "bud",
		accountId: "acc",
		groupName: "Group",
		dataDir: "data",
	};

	let processor: ActualProcessor;

	beforeEach(() => {
		vi.clearAllMocks();
		processor = new ActualProcessor(config);
	});

	it("should initialize API", async () => {
		await processor.initApi();
		expect(api.init).toHaveBeenCalled();
		expect(api.downloadBudget).toHaveBeenCalled();
	});

	it("should convert PDF to CSV", async () => {
		const mockExec = vi.mocked(exec);
		mockExec.mockImplementation(((_cmd: string, options: unknown, cb: unknown) => {
			const callback = typeof options === "function" ? options : cb;
			(callback as (err: null, res: { stdout: string; stderr: string }) => void)(null, { stdout: "Success", stderr: "" });
		}) as unknown as typeof exec);

		const result = await processor.convertPdf("test.pdf");
		expect(result).toContain("test.csv");
		expect(mockExec).toHaveBeenCalledWith(
			expect.stringContaining("sberbank2Excel -t csv"),
			expect.objectContaining({
				env: expect.objectContaining({ PYTHONUTF8: "1" }),
				encoding: "utf8",
				timeout: 30000,
			}),
			expect.any(Function),
		);
	});

	it("should convert CSV", async () => {
		const csvData = "Header\n20.02.2026;1234;AUTH;PAYEE;CAT;100,50";
		vi.mocked(fs.createReadStream).mockReturnValue(
			stringToStream(csvData) as unknown as fs.ReadStream,
		);

		const records = await processor.convert("test.csv");
		expect(records).toHaveLength(1);
		expect(records[0].Payee).toBe("PAYEE");
		expect(records[0].Amount).toBe("100.50");
		expect(records[0].Date).toBe("2026-02-20");
	});

	it("should setup categories", async () => {
		const records = [
			{
				Date: "2026-02-20",
				Payee: "P",
				Category: "New Cat",
				Notes: "",
				Amount: "10",
			},
		];

		vi.mocked(api.getCategoryGroups).mockResolvedValue([
			{ id: "g1", name: "Group" },
		]);
		vi.mocked(api.getCategories).mockResolvedValue([]);

		vi.mocked(api.createCategory).mockResolvedValue("c1");

		await processor.setup(records);
		expect(api.createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ name: "New Cat" }),
		);
	});

	it("should upload transactions", async () => {
		const records = [
			{
				Date: "2026-02-20",
				Payee: "P",
				Category: "Cat",
				Notes: "",
				Amount: "10",
			},
		];

		vi.mocked(api.getAccounts).mockResolvedValue([{ id: "acc", name: "Acc" }]);

		vi.mocked(api.getCategories).mockResolvedValue([{ id: "c1", name: "Cat" }]);

		await processor.upload(records);
		expect(api.importTransactions).toHaveBeenCalled();
	});

	it("should throw error if account not found during upload", async () => {
		const records = [
			{
				Date: "2026-02-20",
				Payee: "P",
				Category: "Cat",
				Notes: "",
				Amount: "10",
			},
		];

		vi.mocked(api.getAccounts).mockResolvedValue([
			{ id: "other", name: "Other" },
		]);

		await expect(processor.upload(records)).rejects.toThrow(
			/Account acc not found/,
		);
	});

	it("should list accounts", async () => {
		vi.mocked(api.getAccounts).mockResolvedValue([{ id: "a1", name: "Acc1" }]);
		const accounts = await processor.list();
		expect(accounts).toEqual([{ id: "a1", name: "Acc1" }]);
	});
});
