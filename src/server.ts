import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import * as api from "@actual-app/api";
import { dispose, getLogger } from "@logtape/logtape";
import * as dotenv from "dotenv";
import { Hono } from "hono";
import { timeout } from "hono/timeout";
import { setupLogging } from "./logging.js";
import { ActualProcessor, type ProcessorConfig } from "./processor.js";

dotenv.config({ quiet: true });

const logger = getLogger(["sber-actual", "server"]);

export const server = new Hono();

server.use("*", async (c, next) => {
	const startTime = performance.now();
	const method = c.req.method;
	const requestPath = c.req.path;

	logger.info`Incoming request: ${method} ${requestPath}`;

	const apiKey = process.env.API_KEY;
	if (apiKey && c.req.header("x-api-key") !== apiKey) {
		logger.warn`Unauthorized access attempt: ${method} ${requestPath}`;
		const response = c.json({ error: "Unauthorized" }, 401);
		logger.info`Response sent: ${method} ${requestPath} - Status: ${response.status} - Time: ${(performance.now() - startTime).toFixed(2)}ms`;
		return response;
	}

	await next();

	logger.info`Response sent: ${method} ${requestPath} - Status: ${c.res.status} - Time: ${(performance.now() - startTime).toFixed(2)}ms`;
});

export { setupLogging };

server.post("/upload", timeout(15000), async (c) => {
	let uploadedFile: File | null = null;

	try {
		const formData = await c.req.formData();
		const file = formData.get("file");
		uploadedFile = file instanceof File ? file : null;
	} catch {
		return c.json({ error: "No file uploaded" }, 400);
	}

	if (!uploadedFile) {
		return c.json({ error: "No file uploaded" }, 400);
	}

	const isPdf = uploadedFile.name.toLowerCase().endsWith(".pdf");
	const isCsv = uploadedFile.name.toLowerCase().endsWith(".csv");

	if (!isPdf && !isCsv) {
		return c.json({ error: "Only CSV or PDF files are allowed" }, 400);
	}

	const requestId = Math.random().toString(36).substring(7);
	const tempDir = path.join(os.tmpdir(), `sber-actual-${requestId}`);

	try {
		await fs.mkdir(tempDir, { recursive: true });
		const inputFilePath = path.join(tempDir, isPdf ? "input.pdf" : "input.csv");

		await fs.writeFile(
			inputFilePath,
			Buffer.from(await uploadedFile.arrayBuffer()),
		);

		const config: ProcessorConfig = {
			serverURL: process.env.ACTUAL_SERVER_URL || "",
			serverPassword: process.env.ACTUAL_SERVER_PASSWORD || "",
			syncId: process.env.ACTUAL_SYNC_ID || "",
			budgetPassword: process.env.ACTUAL_BUDGET_PASSWORD || "",
			accountId: process.env.ACTUAL_ACCOUNT_ID || "",
			groupName: process.env.ACTUAL_GROUP_NAME || "Импорт из Сбера",
			dataDir: tempDir,
		};

		const processor = new ActualProcessor(config);

		logger.info`Processing upload for file: ${uploadedFile.name}`;

		const records = isPdf
			? await processor.convertPdf(inputFilePath)
			: await processor.convert(inputFilePath);

		await processor.initApi();
		try {
			await processor.setupCategories(records);
			await processor.uploadTransactions(records);
		} finally {
			await api.shutdown();
		}

		logger.info`Upload successful for: ${uploadedFile.name}`;
		return c.json({
			status: "success",
			transactionsProcessed: records.length,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);

		logger.error`Processing error: ${message}`;

		return c.json({
			status: "error",
			message,
		}, 500);
	} finally {
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
			logger.info`Cleaned up temporary directory: ${tempDir}`;
		} catch (cleanupErr) {
			logger.warn`Failed to clean up temp dir ${tempDir}: ${cleanupErr}`;
		}
	}
});

export async function start(): Promise<void> {
	try {
		await setupLogging();
		const port = Number(process.env.PORT) || 3000;
		const s = serve(
			{ fetch: server.fetch, port, hostname: "0.0.0.0" },
			(info) => {
				logger.info`Server listening on http://${info.address}:${info.port}`;
			},
		);

		// Increase timeouts for large file processing
		if (s && "setTimeout" in s) {
			s.setTimeout(0);
		}
	} catch (err) {
		console.error("Failed to start server:", err);
		process.exit(1);
	}
}

const isMainModule =
	process.argv[1] !== undefined &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
	start();

	process.on("SIGINT", async () => {
		await dispose();
		process.exit(0);
	});
	process.on("SIGTERM", async () => {
		await dispose();
		process.exit(0);
	});
}
