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

const ESModules = [
	"@sindresorhus/merge-streams",
	"parse-ms",
	"pretty-ms",
	"strip-final-newline",
	"human-signals",
	"unicorn-magic",
	"npm-run-path",
	"js2c",
	"yoctocolors",
	"figures",
	"globby",
	"execa",
]

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
			name: "bundle-esm",
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					// Skip entry points
					if (args.kind === "entry-point") {
						return null
					}

					// Bundle ES modules into the src code
					// This will also bundle imports from those modules. For example, if
					// execa imports ./lib/index.js, it will also be bundled.
					const isESModuleResolving = ESModules.some((module) => args.importer.includes(module))
					const isModuleResolvingRelative = args.path.startsWith("./") || args.path.startsWith("../")
					if ((isESModuleResolving && isModuleResolvingRelative) || ESModules.includes(args.path)) {
						return { external: false }
					}

					// Mark all other modules as external
					return { external: true }
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
	target: "es2022",
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
