const esbuild = require("esbuild")
const glob = require("glob")

const watch = process.argv.includes("--watch")

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started")
		})
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`)
				console.error(`    ${location.file}:${location.line}:${location.column}:`)
			})
			console.log("[watch] build finished")
		})
	},
}

const srcFiles = glob.sync("src/**/*.ts").filter((file) => !file.endsWith(".test.ts"))

const srcConfig = {
	bundle: true,
	minify: false,
	sourcemap: true,
	sourcesContent: true,
	logLevel: "silent",
	entryPoints: srcFiles,
	outdir: "out",
	format: "cjs",
	platform: "node",
	define: {
		"process.env.IS_DEV": "true",
		"process.env.IS_TEST": "true",
	},
	external: ["vscode"],
	plugins: [
		esbuildProblemMatcherPlugin,
		{
			name: "prevent-src-bundling",
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					const isRelativeImport = args.path.startsWith("./") || args.path.startsWith("../")
					const isInSrcDir = args.resolveDir.includes("/src/")

					// This way, we prevent bundling all the src for every file
					// and only bundle modules other than vscode
					if (isInSrcDir && isRelativeImport) {
						// Keep relative imports as-is
						// to import them from within the out directory
						return { path: args.path, external: true }
					}

					// Handle normal imports using the `external` option
					return null
				})
			},
		},
		{
			name: "alias-plugin",
			setup(build) {
				build.onResolve({ filter: /^pkce-challenge$/ }, (args) => {
					return { path: require.resolve("pkce-challenge/dist/index.browser.js") }
				})
			},
		},
	],
}

const testsConfig = {
	bundle: false,
	minify: false,
	sourcemap: true,
	sourcesContent: true,
	logLevel: "silent",
	entryPoints: ["src/**/*.test.ts"],
	outdir: "out",
	format: "cjs",
	platform: "node",
	plugins: [esbuildProblemMatcherPlugin],
	tsconfig: "tsconfig.test.json",
	define: {
		"process.env.IS_DEV": "true",
		"process.env.IS_TEST": "true",
	},
}

async function main() {
	const srcCtx = await esbuild.context(srcConfig)
	const testsCtx = await esbuild.context(testsConfig)

	if (watch) {
		await Promise.all([srcCtx.watch(), testsCtx.watch()])
	} else {
		await Promise.all([srcCtx.rebuild(), testsCtx.rebuild()])

		await Promise.all([srcCtx.dispose(), testsCtx.dispose()])
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
