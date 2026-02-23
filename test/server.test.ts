import * as fs from "node:fs/promises";
import * as logtape from "@logtape/logtape";
import FormData from "form-data";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActualProcessor } from "../src/processor";
import { server, setupLogging, start } from "../src/server";

vi.mock("../src/processor");
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
		// @ts-expect-error
		const listenSpy = vi.spyOn(server, "listen").mockResolvedValue("");
		await start();
		expect(listenSpy).toHaveBeenCalled();
	});

	it("should return 400 if no file is uploaded", async () => {
		const form = new FormData();
		// Sending empty multipart form
		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: form.getHeaders(),
		});

		expect(response.statusCode).toBe(400);
		expect(JSON.parse(response.body)).toEqual({ error: "No file uploaded" });
	});

	it("should return 400 if file is not CSV or PDF", async () => {
		const form = new FormData();
		form.append("file", Buffer.from("test"), "test.txt");

		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: form.getHeaders(),
		});

		expect(response.statusCode).toBe(400);
		expect(JSON.parse(response.body)).toEqual({
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

		const convertPdfSpy = vi.fn().mockResolvedValue("test.csv");
		const convertSpy = vi.fn().mockResolvedValue(mockRecords);
		const setupSpy = vi.fn().mockResolvedValue(undefined);
		const uploadSpy = vi.fn().mockResolvedValue(undefined);

		vi.mocked(ActualProcessor).mockImplementation(
			class {
				convertPdf = convertPdfSpy;
				convert = convertSpy;
				setup = setupSpy;
				upload = uploadSpy;
			} as unknown as typeof ActualProcessor,
		);

		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.rm).mockResolvedValue(undefined);

		const form = new FormData();
		form.append("file", Buffer.from("%PDF-1.4..."), "test.pdf");

		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: form.getHeaders(),
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.status).toBe("success");
		expect(body.transactionsProcessed).toBe(1);

		expect(convertPdfSpy).toHaveBeenCalled();
		expect(convertSpy).toHaveBeenCalledWith("test.csv");
		expect(setupSpy).toHaveBeenCalled();
		expect(uploadSpy).toHaveBeenCalled();
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
		const setupSpy = vi.fn().mockResolvedValue(undefined);
		const uploadSpy = vi.fn().mockResolvedValue(undefined);
		const initApiSpy = vi.fn().mockResolvedValue(undefined);

		vi.mocked(ActualProcessor).mockImplementation(
			class {
				convert = convertSpy;
				setup = setupSpy;
				upload = uploadSpy;
				initApi = initApiSpy;
			} as unknown as typeof ActualProcessor,
		);

		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.rm).mockResolvedValue(undefined);

		const form = new FormData();
		form.append("file", Buffer.from("Date;Payee;..."), "test.csv");

		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: form.getHeaders(),
		});

		if (response.statusCode === 500) {
			console.error("Response body:", response.body);
		}

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.status).toBe("success");
		expect(body.transactionsProcessed).toBe(1);

		expect(convertSpy).toHaveBeenCalled();
		expect(setupSpy).toHaveBeenCalled();
		expect(uploadSpy).toHaveBeenCalled();
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
		form.append("file", Buffer.from("Date;Payee;..."), "test.csv");

		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: form.getHeaders(),
		});

		expect(response.statusCode).toBe(500);
		expect(JSON.parse(response.body).status).toBe("error");
	});
});
