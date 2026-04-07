import FormData from "form-data";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Server Authentication", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("should allow request when API_KEY is not set", async () => {
		vi.stubEnv("API_KEY", "");
		const { server } = await import("../src/server.js");

		const form = new FormData();
		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: form.getHeaders(),
		});

		// Should reach the handler (which returns 400 because no file)
		expect(response.statusCode).toBe(400);
	});

	it("should return 401 when API_KEY is set but header is missing", async () => {
		vi.stubEnv("API_KEY", "secret-key");
		const { server } = await import("../src/server.js");

		const response = await server.inject({
			method: "POST",
			url: "/upload",
		});

		expect(response.statusCode).toBe(401);
		expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized" });
	});

	it("should return 401 when API_KEY is set but header is wrong", async () => {
		vi.stubEnv("API_KEY", "secret-key");
		const { server } = await import("../src/server.js");

		const response = await server.inject({
			method: "POST",
			url: "/upload",
			headers: {
				"x-api-key": "wrong-key",
			},
		});

		expect(response.statusCode).toBe(401);
	});

	it("should allow request when API_KEY is set and header matches", async () => {
		vi.stubEnv("API_KEY", "secret-key");
		const { server } = await import("../src/server.js");

		const form = new FormData();
		const response = await server.inject({
			method: "POST",
			url: "/upload",
			payload: form.getBuffer(),
			headers: {
				...form.getHeaders(),
				"x-api-key": "secret-key",
			},
		});

		// Should reach the handler
		expect(response.statusCode).toBe(400); // 400 because no file, but passed 401
	});
});
