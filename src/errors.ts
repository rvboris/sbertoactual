export function stringifyUnknownError(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}

	if (error instanceof Error) {
		return error.message;
	}

	if (error && typeof error === "object") {
		for (const key of ["message", "error", "code", "name"]) {
			const value = Reflect.get(error, key);
			if (typeof value === "string" && value.trim()) {
				return value;
			}
		}

		try {
			return JSON.stringify(error);
		} catch {
			// Fall back to String(error) below.
		}
	}

	return String(error);
}
