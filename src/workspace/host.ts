import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	EventEmitter,
	RelativePattern,
	Uri,
	extensions,
	workspace,
	type Disposable,
	type Event,
	type LogOutputChannel,
	type TextDocument,
} from 'vscode';
import type { AnalysisInput, QueryRequest } from '../application/contracts';
import { configurationDigest, resolveModule, WorkspaceError, type ModuleContext } from './module';
import { isWorkspaceConfiguration, WorkspaceSnapshots } from './snapshot';

interface GoTools {
	settings?: {
		getExecutionCommand?: (name: string, resource: Uri) => { binPath: string } | undefined;
	};
}

export interface PreparedAnalysis {
	readonly input: AnalysisInput;
	readonly context: ModuleContext;
}

export interface WorkspaceContext extends Disposable {
	readonly onDidInvalidate: Event<void>;
	prepare(request: QueryRequest, signal: AbortSignal): Promise<PreparedAnalysis>;
	isCurrent(prepared: PreparedAnalysis): Promise<boolean>;
}

export function createWorkspaceContext(output: LogOutputChannel): WorkspaceContext {
	const snapshots = new WorkspaceSnapshots();
	const changed = new EventEmitter<void>();
	const subscriptions: Disposable[] = [changed];
	const watched = new Set<string>();
	const lifetime = new AbortController();
	let disposed = false;

	function checkActive(signal: AbortSignal): void {
		if (signal.aborted) {
			throw new WorkspaceError({ status: 'cancelled' });
		}
		if (disposed) {
			throw new WorkspaceError({ status: 'stale' });
		}
	}

	function invalidate(): void {
		snapshots.invalidate();
		changed.fire();
	}

	function update(document: TextDocument): void {
		if (
			document.uri.scheme !== 'file' ||
			(document.languageId !== 'go' && !isWorkspaceConfiguration(document.uri.toString()))
		) {
			return;
		}
		if (
			snapshots.updateDocument({
				uri: document.uri.toString(),
				languageId: document.languageId,
				version: document.version,
				text: document.getText(),
				isDirty: document.isDirty,
			})
		) {
			changed.fire();
		}
	}

	function watch(pattern: string | RelativePattern): void {
		const watcher = workspace.createFileSystemWatcher(pattern);
		subscriptions.push(
			watcher,
			watcher.onDidCreate(invalidate),
			watcher.onDidChange(invalidate),
			watcher.onDidDelete(invalidate),
		);
	}

	for (const document of workspace.textDocuments) {
		update(document);
	}
	watch('**/*.{go,mod,sum,work}');
	subscriptions.push(
		workspace.onDidOpenTextDocument(update),
		workspace.onDidChangeTextDocument((event) => update(event.document)),
		workspace.onDidSaveTextDocument(update),
		workspace.onDidCloseTextDocument((document) => {
			if (snapshots.closeDocument(document.uri.toString())) {
				changed.fire();
			}
		}),
		workspace.onDidChangeWorkspaceFolders(invalidate),
		workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('goInterfaces') || event.affectsConfiguration('go')) {
				invalidate();
			}
		}),
	);

	return {
		onDidInvalidate: changed.event,
		async prepare(request, signal): Promise<PreparedAnalysis> {
			// Closing the context also cancels module discovery still running for a caller.
			// 关闭上下文时，同时取消调用方仍在执行的模块发现任务
			signal = AbortSignal.any([signal, lifetime.signal]);
			checkActive(signal);
			if (!workspace.isTrusted) {
				throw new WorkspaceError({
					status: 'failed',
					error: {
						code: 'workspace-untrusted',
						message: 'Go analysis requires a trusted workspace.',
					},
				});
			}
			const resource = Uri.parse(request.source.uri, true);
			if (resource.scheme !== 'file') {
				throw new WorkspaceError({ status: 'unsupported', reason: 'virtual-workspace' });
			}
			if (!workspace.getWorkspaceFolder(resource)) {
				throw new WorkspaceError({
					status: 'failed',
					error: {
						code: 'module-not-found',
						message: 'Select a Go file in an open workspace folder.',
					},
				});
			}
			const generation = snapshots.generation;
			const configuration = workspace.getConfiguration('goInterfaces', resource);
			let goExecutable = configuration.get<string>('goExecutable', '');
			if (!goExecutable) {
				try {
					const go = extensions.getExtension<GoTools>('golang.go');
					const api = go ? await go.activate() : undefined;
					goExecutable =
						api?.settings?.getExecutionCommand?.('go', resource)?.binPath ?? 'go';
				} catch (error) {
					output.warn('Unable to use the Go extension tool path; using PATH.', error);
					goExecutable = 'go';
				}
			}
			checkActive(signal);
			const context = await resolveModule(
				resource.toString(),
				{
					goExecutable,
					buildFlags: configuration.get<readonly string[]>('buildFlags', []),
					unsavedConfigurationUris: snapshots.unsavedConfigurationUris(),
				},
				signal,
			);
			checkActive(signal);
			for (const uri of context.configurationUris) {
				if (!watched.has(uri)) {
					const filename = fileURLToPath(uri);
					watch(
						new RelativePattern(
							Uri.file(path.dirname(filename)),
							path.basename(filename),
						),
					);
					watched.add(uri);
					const sourceKey = `go:${path.dirname(filename)}`;
					if (path.basename(filename) === 'go.mod' && !watched.has(sourceKey)) {
						watch(new RelativePattern(Uri.file(path.dirname(filename)), '**/*.go'));
						watched.add(sourceKey);
					}
				}
			}
			const input = await snapshots.capture(context, request, generation);
			if (
				context.configurationDigest !==
					(await configurationDigest(context.configurationUris)) ||
				!snapshots.isCurrent(input.snapshot)
			) {
				throw new WorkspaceError({ status: 'stale' });
			}
			checkActive(signal);
			return { input, context };
		},
		async isCurrent(prepared): Promise<boolean> {
			return (
				snapshots.isCurrent(prepared.input.snapshot) &&
				prepared.context.configurationDigest ===
					(await configurationDigest(prepared.context.configurationUris)) &&
				snapshots.isCurrent(prepared.input.snapshot)
			);
		},
		dispose(): void {
			disposed = true;
			lifetime.abort();
			for (const subscription of subscriptions) {
				subscription.dispose();
			}
			snapshots.dispose();
		},
	};
}
