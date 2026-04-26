import * as fs from "node:fs/promises";
import * as nodeServer from "@hono/node-server";
import * as api from "@actual-app/api";
import * as logtape from "@logtape/logtape";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActualProcessor } from "../src/processor.js";
import { server, setupLogging, start } from "../src/server.js";

vi.mock("@hono/node-server", () => ({
	serve: vi.fn(),
}));
vi.mock("../src/processor.js");
vi.mock("@actual-app/api");
vi.mock("node:fs/promises");
vi.mock("@logtape/logtape", async (importOriginal) => {
	const actual = await importOriginal<typeof logtape>();
	return {
		...actual,
		configure: vi.fn(),
	};
});

describe("Server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should configure logging", async () => {
		await setupLogging();
		expect(logtape.configure).toHaveBeenCalled();
	});

	it("should start the server", async () => {
		await start();
		expect(nodeServer.serve).toHaveBeenCalled();
	});

	it("should return 400 if no file is uploaded", async () => {
		const form = new FormData();
		const response = await server.request("/upload", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "No file uploaded" });
	});

	it("should return 400 if file is not CSV or PDF", async () => {
		const form = new FormData();
		form.append("file", new File(["test"], "test.txt", { type: "text/plain" }));

		const response = await server.request("/upload", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Only CSV or PDF files are allowed",
		});
	});

	it("should process PDF file successfully", async () => {
		const mockRecords = [
			{
				Date: "2026-02-20",
				Payee: "Test PDF",
				Category: "Food",
				Notes: "",
				Amount: "200",
			},
		];

		const convertPdfSpy = vi.fn().mockResolvedValue(mockRecords);
		const convertSpy = vi.fn().mockResolvedValue([]);
		const initApiSpy = vi.fn().mockResolvedValue(undefined);
		const setupCategoriesSpy = vi.fn().mockResolvedValue(undefined);
		const uploadTransactionsSpy = vi.fn().mockResolvedValue(undefined);

		vi.mocked(ActualProcessor).mockImplementation(
			class {
				convertPdf = convertPdfSpy;
				convert = convertSpy;
				initApi = initApiSpy;
				setupCategories = setupCategoriesSpy;
				uploadTransactions = uploadTransactionsSpy;
			} as unknown as typeof ActualProcessor,
		);

		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.rm).mockResolvedValue(undefined);

		const form = new FormData();
		form.append(
			"file",
			new File(["%PDF-1.4..."], "test.pdf", { type: "application/pdf" }),
		);

		const response = await server.request("/upload", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("success");
		expect(body.transactionsProcessed).toBe(1);

		expect(convertPdfSpy).toHaveBeenCalled();
		expect(convertSpy).not.toHaveBeenCalled();
		expect(initApiSpy).toHaveBeenCalled();
		expect(setupCategoriesSpy).toHaveBeenCalled();
		expect(uploadTransactionsSpy).toHaveBeenCalled();
		expect(api.shutdown).toHaveBeenCalled();
	});

	it("should process CSV file successfully", async () => {
		const mockRecords = [
			{
				Date: "2026-02-20",
				Payee: "Test",
				Category: "Food",
				Notes: "",
				Amount: "100",
			},
		];

		const convertSpy = vi.fn().mockResolvedValue(mockRecords);
		const initApiSpy = vi.fn().mockResolvedValue(undefined);
		const setupCategoriesSpy = vi.fn().mockResolvedValue(undefined);
		const uploadTransactionsSpy = vi.fn().mockResolvedValue(undefined);

		vi.mocked(ActualProcessor).mockImplementation(
			class {
				convert = convertSpy;
				initApi = initApiSpy;
				setupCategories = setupCategoriesSpy;
				uploadTransactions = uploadTransactionsSpy;
			} as unknown as typeof ActualProcessor,
		);

		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.rm).mockResolvedValue(undefined);

		const form = new FormData();
		form.append("file", new File(["Date;Payee;..."], "test.csv", { type: "text/csv" }));

		const response = await server.request("/upload", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("success");
		expect(body.transactionsProcessed).toBe(1);

		expect(convertSpy).toHaveBeenCalled();
		expect(initApiSpy).toHaveBeenCalled();
		expect(setupCategoriesSpy).toHaveBeenCalled();
		expect(uploadTransactionsSpy).toHaveBeenCalled();
		expect(api.shutdown).toHaveBeenCalled();
	});

	it("should return 500 if processing fails", async () => {
		vi.mocked(ActualProcessor).mockImplementation(
			class {
				convert = vi.fn().mockRejectedValue(new Error("Processing failed"));
			} as unknown as typeof ActualProcessor,
		);

		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.rm).mockResolvedValue(undefined);

		const form = new FormData();
		form.append("file", new File(["Date;Payee;..."], "test.csv", { type: "text/csv" }));

		const response = await server.request("/upload", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(500);
		expect((await response.json()).status).toBe("error");
	});
});
