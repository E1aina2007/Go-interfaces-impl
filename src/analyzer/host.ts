import type { Logger } from 'vscode-jsonrpc/node';
import type { ModuleContext } from '../workspace/module';
import { AnalyzerClient } from './client';
import { AnalyzerError, failure } from './protocol';

interface ProcessEntry {
	readonly buildKey: string;
	readonly controller: AbortController;
	readonly client: Promise<AnalyzerClient>;
}

export class AnalyzerHost {
	private readonly entries = new Map<string, ProcessEntry>();
	private closing: Promise<void> | undefined;
	private stopped = false;

	constructor(
		private readonly extensionPath: string,
		private readonly logger: Logger,
	) {}

	async get(context: ModuleContext, signal: AbortSignal): Promise<AnalyzerClient> {
		if (this.stopped || signal.aborted) {
			throw new AnalyzerError({ status: 'cancelled' });
		}
		const key = context.module.goModUri;
		let entry = this.entries.get(key);
		if (entry && entry.buildKey !== context.build.key) {
			const previous = entry;
			entry.controller.abort();
			const controller = new AbortController();
			entry = {
				buildKey: context.build.key,
				controller,
				client: this.release(previous).then(() =>
					AnalyzerClient.start(
						{ extensionPath: this.extensionPath, context, logger: this.logger },
						controller.signal,
					),
				),
			};
			this.entries.set(key, entry);
		}
		if (!entry) {
			if (this.entries.size >= 2) {
				throw failure(
					'analyzer-unavailable',
					'The limit of two active module analyzers has been reached.',
				);
			}
			const controller = new AbortController();
			entry = {
				buildKey: context.build.key,
				controller,
				client: AnalyzerClient.start(
					{ extensionPath: this.extensionPath, context, logger: this.logger },
					controller.signal,
				),
			};
			this.entries.set(key, entry);
		}
		let client: AnalyzerClient;
		let abort: (() => void) | undefined;
		const cancelled = new Promise<never>((_, reject) => {
			abort = (): void => reject(new AnalyzerError({ status: 'cancelled' }));
			signal.addEventListener('abort', abort, { once: true });
		});
		try {
			// Cancel this caller's wait without interrupting initialization shared by another caller.
			// 只取消当前调用方的等待，避免中断其他调用方共享的进程初始化
			client = await Promise.race([entry.client, cancelled]);
		} catch (error) {
			if (!signal.aborted && this.entries.get(key) === entry) {
				this.entries.delete(key);
				entry.controller.abort();
				await this.release(entry);
			}
			throw error;
		} finally {
			if (abort) {
				signal.removeEventListener('abort', abort);
			}
		}
		if (this.stopped || signal.aborted) {
			throw new AnalyzerError({ status: 'cancelled' });
		}
		if (this.entries.get(key) !== entry) {
			throw new AnalyzerError({ status: 'stale' });
		}
		if (!client.available) {
			this.entries.delete(key);
			await client.close();
			return this.get(context, signal);
		}
		return client;
	}

	close(): Promise<void> {
		this.stopped = true;
		this.closing ??= this.closeAll();
		return this.closing;
	}

	private async closeAll(): Promise<void> {
		const entries = [...this.entries.values()];
		this.entries.clear();
		for (const entry of entries) {
			entry.controller.abort();
		}
		await Promise.all(entries.map((entry) => this.release(entry)));
	}

	private async release(entry: ProcessEntry): Promise<void> {
		try {
			await (await entry.client).close();
		} catch (error) {
			this.logger.warn(`Analyzer release: ${String(error)}`);
		}
	}
}
