import { describe, it, beforeEach, afterEach } from "mocha"
import { expect } from "chai"
import { getShell } from "../utils/shell"
import * as vscode from "vscode"
import * as os from "os"
import Sinon from "sinon"

describe("Shell Detection Tests", () => {
	let sandbox: sinon.SinonSandbox
	let originalPlatform: string
	let originalEnv: NodeJS.ProcessEnv

	// Helper to mock VS Code configuration
	function mockVsCodeConfig(platformKey: string, defaultProfileName: string | null, profiles: Record<string, any>) {
		vscode.workspace.getConfiguration = () =>
			({
				get: (key: string) => {
					if (key === `defaultProfile.${platformKey}`) {
						return defaultProfileName
					}
					if (key === `profiles.${platformKey}`) {
						return profiles
					}
					return undefined
				},
			}) as any
	}

	const setFakeShell = (shell: string | null) => {
		sandbox.stub(os, "userInfo").returns({ shell } as any)
	}

	beforeEach(() => {
		sandbox = Sinon.createSandbox()

		// Store original references
		originalPlatform = process.platform
		originalEnv = { ...process.env }

		// Clear environment variables for a clean test
		delete process.env.SHELL
		delete process.env.COMSPEC

		// Default userInfo() mock
		setFakeShell(null)
	})

	afterEach(() => {
		sandbox.restore()
		// Restore everything
		Object.defineProperty(process, "platform", { value: originalPlatform })
		process.env = originalEnv
	})

	// --------------------------------------------------------------------------
	// Windows Shell Detection
	// --------------------------------------------------------------------------
	describe("Windows Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "win32" })
		})

		it("uses explicit PowerShell 7 path from VS Code config (profile path)", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
			})
			expect(getShell()).to.equal("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("uses PowerShell 7 path if source is 'PowerShell' but no explicit path", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { source: "PowerShell" },
			})
			expect(getShell()).to.equal("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("falls back to legacy PowerShell if profile includes 'powershell' but no path/source", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: {},
			})
			expect(getShell()).to.equal("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
		})

		it("handles undefined shell profile gracefully", () => {
			mockVsCodeConfig("windows", "NonExistentProfile", {})
			expect(getShell()).to.equal("C:\\Windows\\System32\\cmd.exe")
		})

		it("uses WSL bash when profile indicates WSL source", () => {
			mockVsCodeConfig("windows", "WSL", {
				WSL: { source: "WSL" },
			})
			expect(getShell()).to.equal("/bin/bash")
		})

		it("uses WSL bash when profile name includes 'wsl'", () => {
			mockVsCodeConfig("windows", "Ubuntu WSL", {
				"Ubuntu WSL": {},
			})
			expect(getShell()).to.equal("/bin/bash")
		})

		it("defaults to cmd.exe if no special profile is matched", () => {
			mockVsCodeConfig("windows", "CommandPrompt", {
				CommandPrompt: {},
			})
			expect(getShell()).to.equal("C:\\Windows\\System32\\cmd.exe")
		})

		it("respects userInfo() if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			setFakeShell("C:\\Custom\\PowerShell.exe")

			expect(getShell()).to.equal("C:\\Custom\\PowerShell.exe")
		})

		it("respects an odd COMSPEC if no userInfo shell is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.COMSPEC = "D:\\CustomCmd\\cmd.exe"

			expect(getShell()).to.equal("D:\\CustomCmd\\cmd.exe")
		})
	})

	// --------------------------------------------------------------------------
	// macOS Shell Detection
	// --------------------------------------------------------------------------
	describe("macOS Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "darwin" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("osx", "MyCustomShell", {
				MyCustomShell: { path: "/usr/local/bin/fish" },
			})
			expect(getShell()).to.equal("/usr/local/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			setFakeShell("/opt/homebrew/bin/zsh")

			expect(getShell()).to.equal("/opt/homebrew/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.SHELL = "/usr/local/bin/zsh"

			expect(getShell()).to.equal("/usr/local/bin/zsh")
		})

		it("falls back to /bin/zsh if no config, userInfo, or env variable is set", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			// userInfo => null, SHELL => undefined
			expect(getShell()).to.equal("/bin/zsh")
		})
	})

	// --------------------------------------------------------------------------
	// Linux Shell Detection
	// --------------------------------------------------------------------------
	describe("Linux Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("linux", "CustomProfile", {
				CustomProfile: { path: "/usr/bin/fish" },
			})
			expect(getShell()).to.equal("/usr/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			setFakeShell("/usr/bin/zsh")

			expect(getShell()).to.equal("/usr/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.SHELL = "/usr/bin/fish"

			expect(getShell()).to.equal("/usr/bin/fish")
		})

		it("falls back to /bin/bash if nothing is set", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			// userInfo => null, SHELL => undefined
			expect(getShell()).to.equal("/bin/bash")
		})
	})

	// --------------------------------------------------------------------------
	// Unknown Platform & Error Handling
	// --------------------------------------------------------------------------
	describe("Unknown Platform / Error Handling", () => {
		it("falls back to /bin/sh for unknown platforms", () => {
			Object.defineProperty(process, "platform", { value: "sunos" })
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any

			expect(getShell()).to.equal("/bin/sh")
		})

		it("handles VS Code config errors gracefully, falling back to userInfo shell if present", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = () => {
				throw new Error("Configuration error")
			}
			setFakeShell("/bin/bash")

			expect(getShell()).to.equal("/bin/bash")
		})

		it("handles userInfo errors gracefully, falling back to environment variable if present", () => {
			Object.defineProperty(process, "platform", { value: "darwin" })
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any

			sandbox.stub(os, "userInfo").callsFake(() => {
				throw new Error("userInfo error")
			})

			process.env.SHELL = "/bin/zsh"

			expect(getShell()).to.equal("/bin/zsh")
		})

		it("falls back fully to default shell paths if everything fails", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = () => {
				throw new Error("Configuration error")
			}
			sandbox.stub(os, "userInfo").callsFake(() => {
				throw new Error("userInfo error")
			})

			// No SHELL in env
			delete process.env.SHELL

			expect(getShell()).to.equal("/bin/bash")
		})
	})
})
