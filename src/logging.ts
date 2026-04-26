import { configure, getConfig } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";

let setupPromise: Promise<void> | undefined;

function silenceConsoleNoise(): void {
	console.log = console.info = console.warn = () => {};
}

function categoryMatches(
	category: string | string[],
	expected: readonly string[],
): boolean {
	const parts = Array.isArray(category) ? category : [category];
	return (
		parts.length === expected.length &&
		parts.every((part, index) => part === expected[index])
	);
}

function hasAppLogging(): boolean {
	const config = getConfig();
	return Boolean(
		config?.sinks.stdout &&
			config.loggers.some(
				(logger) =>
					categoryMatches(logger.category, ["sber-actual"]) &&
					logger.sinks?.includes("stdout"),
			) &&
			config.loggers.some(
				(logger) =>
					categoryMatches(logger.category, ["logtape"]) &&
					logger.sinks?.includes("stdout"),
			),
	);
}

export async function setupLogging(): Promise<void> {
	if (hasAppLogging()) {
		silenceConsoleNoise();
		return;
	}

	if (setupPromise) {
		await setupPromise;
		if (hasAppLogging()) {
			silenceConsoleNoise();
			return;
		}

		setupPromise = undefined;
	}

	const formatterOptions: NonNullable<Parameters<typeof getPrettyFormatter>[0]> & {
		readonly category: () => string;
	} = {
		timestamp: "time",
		// The current type definition omits 'category',
		// but the runtime supports it to hide the category name.
		category: () => "",
		wordWrap: false,
	};
	const formatter = getPrettyFormatter(formatterOptions);

	const currentSetup = (async () => {
		const reset = getConfig() !== null;

		await configure({
			reset,
			sinks: {
				stdout: (record) => {
					process.stdout.write(formatter(record));
				},
			},
			loggers: [
				{ category: ["sber-actual"], lowestLevel: "info", sinks: ["stdout"] },
				{ category: ["logtape"], lowestLevel: "warning", sinks: ["stdout"] },
			],
		});

		silenceConsoleNoise();
	})();

	setupPromise = currentSetup;

	try {
		await currentSetup;
	} catch (error) {
		if (setupPromise === currentSetup) {
			setupPromise = undefined;
		}
		throw error;
	}
}
