import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import multipart from "@fastify/multipart";
import { configure, dispose, getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";
import * as dotenv from "dotenv";
import fastify from "fastify";
import { ActualProcessor, type ProcessorConfig } from "./processor";

declare module "fastify" {
	interface FastifyRequest {
		logger: ReturnType<typeof getLogger>;
	}
}

dotenv.config();

const logger = getLogger(["sber-actual", "server"]);

export const server = fastify({
	logger: false,
});

server.decorateRequest("logger", {
	getter() {
		return logger;
	},
});

server.addHook("onRequest", async (request) => {
	logger.info`Incoming request: ${request.method} ${request.url}`;
});

server.addHook("onResponse", async (request, reply) => {
	logger.info`Response sent: ${request.method} ${request.url} - Status: ${reply.statusCode} - Time: ${reply.elapsedTime.toFixed(2)}ms`;
});

server.register(multipart, {
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
	},
});

export async function setupLogging(): Promise<void> {
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
}

server.post("/upload", async (request, reply) => {
	const data = await request.file();
	if (!data) {
		return reply.status(400).send({ error: "No file uploaded" });
	}

	const isPdf = data.filename.toLowerCase().endsWith(".pdf");
	const isCsv = data.filename.toLowerCase().endsWith(".csv");

	if (!isPdf && !isCsv) {
		return reply
			.status(400)
			.send({ error: "Only CSV or PDF files are allowed" });
	}

	const requestId = Math.random().toString(36).substring(7);
	const tempDir = path.join(os.tmpdir(), `sber-actual-${requestId}`);

	try {
		await fs.mkdir(tempDir, { recursive: true });
		const inputFilePath = path.join(tempDir, isPdf ? "input.pdf" : "input.csv");

		await fs.writeFile(inputFilePath, await data.toBuffer());

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

		logger.info`Processing upload for file: ${data.filename}`;

		let csvPath = inputFilePath;
		if (isPdf) {
			csvPath = await processor.convertPdf(inputFilePath);
		}

		const records = await processor.convert(csvPath);

		await processor.setup(records);

		await processor.upload(records);

		logger.info`Upload successful for: ${data.filename}`;
		return {
			status: "success",
			transactionsProcessed: records.length,
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);

		logger.error`Processing error: ${message}`;

		return reply.status(500).send({
			status: "error",
			message,
		});
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
		await server.listen({ port, host: "0.0.0.0" });

		logger.info`Server listening on http://localhost:${port}`;
	} catch (err) {
		console.error("Failed to start server:", err);
		process.exit(1);
	}
}

if (require.main === module) {
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
