import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
	CancellationTokenSource,
	ResponseError,
	StreamMessageReader,
	StreamMessageWriter,
	createMessageConnection,
	type Logger,
	type MessageConnection,
} from 'vscode-jsonrpc/node';
import type {
	AnalysisInput,
	AnalysisResponse,
	ImplementationAnalyzer,
	QueryProgress,
} from '../application/contracts';
import type { ModuleContext } from '../workspace/module';
import {
	AnalyzerError,
	decodeAnalysis,
	encodeAnalysis,
	failure,
	initializeResult,
	progressNotification,
	protocolVersion,
	toFilePath,
} from './protocol';

export interface AnalyzerOptions {
	readonly extensionPath: string;
	readonly context: ModuleContext;
	readonly logger: Logger;
}

export function analyzerPath(extensionPath: string): string {
	const host = `${process.platform}-${process.arch}`;
	if (!['win32-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'].includes(host)) {
		throw failure('analyzer-unavailable', `No analyzer build is configured for ${host}.`);
	}
	// The extension host platform selects the executable, independently of the Go compilation target.
	// 根据扩展宿主平台选择可执行文件，不受 Go 项目编译目标的影响
	const filename =
		process.platform === 'win32' ? 'go-interfaces-analyzer.exe' : 'go-interfaces-analyzer';
	return path.join(extensionPath, 'dist', 'analyzer', host, filename);
}

export class AnalyzerClient implements ImplementationAnalyzer {
	private readonly connection: MessageConnection;
	private readonly exited: Promise<void>;
	private readonly progress = new Map<string, (progress: QueryProgress) => void>();
	private error: AnalyzerError | undefined;
	private closing: Promise<void> | undefined;
	private stopping = false;
	private didExit = false;
	private active = false;

	private constructor(
		private readonly child: ChildProcessWithoutNullStreams,
		private readonly options: AnalyzerOptions,
	) {
		this.exited = new Promise((resolve) => {
			child.once('close', (code, signal) => {
				this.didExit = true;
				if (!this.stopping) {
					this.fail(
						failure('analyzer-unavailable', `Analyzer exited (${signal ?? code}).`),
					);
				}
				resolve();
			});
		});
		child.on('error', (error) => {
			this.fail(failure('analyzer-unavailable', `Unable to run analyzer: ${error.message}`));
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (data: string) => options.logger.log(data.trimEnd()));
		this.connection = createMessageConnection(
			new StreamMessageReader(child.stdout),
			new StreamMessageWriter(child.stdin),
			options.logger,
		);
		this.connection.onError(([error]) => {
			this.fail(failure('protocol-error', `Analyzer transport error: ${error.message}`));
		});
		this.connection.onClose(() => {
			if (!this.stopping) {
				this.fail(
					failure('analyzer-unavailable', 'Analyzer connection closed unexpectedly.'),
				);
			}
		});
		this.connection.onNotification('analysis/progress', (value: unknown) => {
			const parsed = progressNotification.safeParse(value);
			if (!parsed.success) {
				this.fail(failure('protocol-error', 'Invalid analyzer progress notification.'));
				return;
			}
			const { requestId, progress } = parsed.data;
			// Explicitly omit absent fields to preserve the exact optional application contract.
			// 省略缺失字段，保持应用契约中可选字段的准确含义
			const update: QueryProgress = {
				phase: progress.phase,
				...(progress.completed === undefined ? {} : { completed: progress.completed }),
				...(progress.total === undefined ? {} : { total: progress.total }),
			};
			try {
				this.progress.get(requestId)?.(update);
			} catch (error) {
				options.logger.error(`Progress callback failed: ${String(error)}`);
			}
		});
		this.connection.listen();
	}

	static async start(options: AnalyzerOptions, signal: AbortSignal): Promise<AnalyzerClient> {
		if (signal.aborted) {
			throw new AnalyzerError({ status: 'cancelled' });
		}
		const executable = analyzerPath(options.extensionPath);
		try {
			await access(executable);
		} catch {
			throw failure(
				'analyzer-unavailable',
				`Analyzer is missing; run npm run build:analyzer (${executable}).`,
			);
		}
		if (signal.aborted) {
			throw new AnalyzerError({ status: 'cancelled' });
		}
		const { context } = options;
		const client = new AnalyzerClient(
			spawn(executable, [], {
				cwd: toFilePath(context.module.rootUri),
				env: { ...context.environment },
				stdio: 'pipe',
				windowsHide: true,
				shell: false,
			}),
			options,
		);
		try {
			const result = initializeResult.safeParse(
				await client.request(
					'initialize',
					{
						protocolVersion,
						goVersion: context.build.goVersion,
						goExecutable: context.goExecutable,
						moduleRootPath: toFilePath(context.module.rootUri),
						goModPath: toFilePath(context.module.goModUri),
					},
					signal,
					10_000,
				),
			);
			if (!result.success) {
				throw failure('protocol-error', 'Invalid analyzer initialization response.');
			}
			options.logger.info(
				`Analyzer ${result.data.analyzerVersion}, ${result.data.goVersion}, protocol ${protocolVersion}; semantic analysis: ${result.data.analysisAvailable}.`,
			);
			return client;
		} catch (error) {
			await client.close();
			throw error;
		}
	}

	get available(): boolean {
		return !this.error && !this.stopping && !this.didExit;
	}

	async analyze(
		input: AnalysisInput,
		signal: AbortSignal,
		onProgress?: (progress: QueryProgress) => void,
	): Promise<AnalysisResponse> {
		if (signal.aborted) {
			return { requestId: input.requestId, outcome: { status: 'cancelled' } };
		}
		if (this.active) {
			return {
				requestId: input.requestId,
				outcome: {
					status: 'failed',
					error: {
						code: 'analyzer-unavailable',
						message: 'This analyzer is already processing a request.',
					},
				},
			};
		}
		this.active = true;
		try {
			if (!this.available) {
				throw this.error ?? failure('analyzer-unavailable', 'The analyzer is closed.');
			}
			if (
				!isDeepStrictEqual(input.snapshot.build, this.options.context.build) ||
				!isDeepStrictEqual(input.snapshot.module, this.options.context.module)
			) {
				throw new AnalyzerError({ status: 'stale' });
			}
			const params = encodeAnalysis(input);
			if (onProgress) {
				this.progress.set(input.requestId, onProgress);
			}
			return decodeAnalysis(
				await this.request('analyze', params, signal, 120_000),
				input.requestId,
			);
		} catch (error) {
			const reported = this.asError(error);
			if (
				reported.outcome.status === 'failed' &&
				reported.outcome.error.code === 'protocol-error'
			) {
				this.fail(reported);
			}
			return { requestId: input.requestId, outcome: reported.outcome };
		} finally {
			this.active = false;
			this.progress.delete(input.requestId);
		}
	}

	async invalidate(): Promise<void> {
		if (this.available) {
			try {
				await this.connection.sendNotification('invalidate');
			} catch (error) {
				this.fail(this.asError(error));
			}
		}
	}

	close(): Promise<void> {
		this.closing ??= this.shutdown();
		return this.closing;
	}

	private fail(error: AnalyzerError): void {
		this.error ??= error;
		this.connection?.dispose();
		if (!this.didExit) {
			this.child.kill();
		}
	}

	private asError(error: unknown): AnalyzerError {
		if (error instanceof AnalyzerError) {
			return error;
		}
		if (this.error) {
			return this.error;
		}
		if (error instanceof ResponseError) {
			if (error.code === -32800) {
				return new AnalyzerError({ status: 'cancelled' });
			}
			if (error.code === -32002) {
				return failure('go-not-found', error.message);
			}
			if (error.code === -32003) {
				return failure('unsupported-go-version', error.message);
			}
			return failure('protocol-error', error.message);
		}
		return failure('analyzer-unavailable', `Analyzer request failed: ${String(error)}`);
	}

	private async request(
		method: string,
		params: unknown,
		signal: AbortSignal,
		timeout: number,
	): Promise<unknown> {
		if (this.error) {
			throw this.error;
		}
		if (signal.aborted) {
			throw new AnalyzerError({ status: 'cancelled' });
		}
		const token = new CancellationTokenSource();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				const error = failure('timeout', `Analyzer ${method} timed out.`);
				this.fail(error);
				reject(error);
			}, timeout);
		});
		const abort = (): void => {
			token.cancel();
			// Allow the Go handler to acknowledge cancellation; terminate a process that ignores it.
			// 给 Go 处理器留出确认取消的时间，超时后终止没有响应的进程
			cancellationTimer ??= setTimeout(
				() => this.fail(new AnalyzerError({ status: 'cancelled' })),
				2_000,
			);
		};
		signal.addEventListener('abort', abort, { once: true });
		try {
			const result: unknown = await Promise.race([
				this.connection.sendRequest<unknown>(method, params, token.token),
				deadline,
			]);
			if (signal.aborted) {
				throw new AnalyzerError({ status: 'cancelled' });
			}
			return result;
		} catch (error) {
			if (signal.aborted) {
				throw new AnalyzerError({ status: 'cancelled' });
			}
			throw this.asError(error);
		} finally {
			clearTimeout(timer);
			clearTimeout(cancellationTimer);
			signal.removeEventListener('abort', abort);
			token.dispose();
		}
	}

	private async shutdown(): Promise<void> {
		this.stopping = true;
		try {
			if (!this.error && !this.didExit) {
				await this.request('shutdown', undefined, new AbortController().signal, 2_000);
			}
		} catch (error) {
			this.options.logger.warn(`Analyzer shutdown: ${String(error)}`);
		} finally {
			this.connection.dispose();
			this.child.stdin.end();
			if (!this.didExit) {
				const timer = setTimeout(() => this.child.kill('SIGKILL'), 1_000);
				try {
					await this.exited;
				} finally {
					clearTimeout(timer);
				}
			}
		}
	}
}
