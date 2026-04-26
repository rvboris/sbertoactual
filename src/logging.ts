import { configure, getConfig } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";

let setupPromise: Promise<void> | undefined;

function silenceConsoleNoise(): void {
	console.log = console.info = console.warn = () => {};
}

export async function setupLogging(): Promise<void> {
	if (getConfig()) {
		silenceConsoleNoise();
		return;
	}

	if (setupPromise) {
		await setupPromise;
		if (getConfig()) {
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
		await configure({
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
