import {
	CancellationError,
	CancellationTokenSource,
	ConfigurationTarget,
	Position,
	ProgressLocation,
	ThemeIcon,
	Uri,
	commands,
	window,
	workspace,
	type Disposable,
	type LogOutputChannel,
	type QuickPickItem,
} from 'vscode';
import type { TypeKind } from '../core/types';
import {
	type ImplementationQueries,
	StaleQueryError,
	type LocatedType,
	type QueryResult,
} from '../query/service';

export const findInterfaces = 'goInterfaces.findInterfaces';
export const findStructs = 'goInterfaces.findStructs';

interface ResultItem extends QuickPickItem {
	readonly match: LocatedType;
}

export class ImplementationCommands implements Disposable {
	private readonly subscriptions: Disposable[];
	private active: CancellationTokenSource | undefined;
	private disposed = false;

	constructor(
		private readonly queries: ImplementationQueries,
		private readonly output: LogOutputChannel,
	) {
		this.subscriptions = [
			commands.registerCommand(
				findInterfaces,
				(uri?: Uri, position?: Position, version?: number): Promise<void> =>
					this.run('struct', uri, position, version),
			),
			commands.registerCommand(
				findStructs,
				(uri?: Uri, position?: Position, version?: number): Promise<void> =>
					this.run('interface', uri, position, version),
			),
			commands.registerCommand('goInterfaces.toggleTestingFilter', (): Promise<void> =>
				this.toggleFilter(),
			),
		];
	}

	private async run(
		kind: TypeKind,
		uri?: Uri,
		position?: Position,
		version?: number,
	): Promise<void> {
		const editor = window.activeTextEditor;
		const resource = uri ?? editor?.document.uri;
		const cursor =
			position ??
			(resource?.toString() === editor?.document.uri.toString()
				? editor?.selection.active
				: undefined);
		if (!(resource instanceof Uri) || !(cursor instanceof Position)) {
			void window.showInformationMessage('Open a Go document and select a type name.');
			return;
		}
		this.active?.cancel();
		const request = new CancellationTokenSource();
		this.active = request;
		const sourceVersion =
			version ??
			workspace.textDocuments.find(
				(document) => document.uri.toString() === resource.toString(),
			)?.version;
		try {
			const result = await window.withProgress(
				{
					location: ProgressLocation.Notification,
					title:
						kind === 'struct'
							? 'Go Interfaces: Finding implemented interfaces'
							: 'Go Interfaces: Finding implementing structs',
					cancellable: true,
				},
				async (_, token): Promise<QueryResult> => {
					const cancel = token.onCancellationRequested(() => request.cancel());
					try {
						return await this.queries.query(
							resource,
							cursor,
							kind,
							request.token,
							sourceVersion,
						);
					} finally {
						cancel.dispose();
					}
				},
			);
			if (request.token.isCancellationRequested || this.disposed) {
				return;
			}
			if (!this.queries.isCurrent(result)) {
				throw new StaleQueryError();
			}
			if (result.matches.length === 0) {
				void window.showInformationMessage(
					`The Go language service returned no displayable matches in this module (${result.hidden} filtered, ${result.skipped} unsupported). Its results may be incomplete.`,
				);
				return;
			}
			const items: ResultItem[] = result.matches.map((match) => ({
				label: match.declaration.name,
				iconPath: new ThemeIcon(
					match.declaration.kind === 'struct' ? 'symbol-struct' : 'symbol-interface',
				),
				description: workspace.asRelativePath(match.location.uri),
				detail: `${match.location.uri.fsPath}:${match.location.range.start.line + 1}`,
				match,
			}));
			const selected = await window.showQuickPick(
				items,
				{
					title: `${result.subject.declaration.name} → ${kind === 'struct' ? 'interfaces' : 'structs'}`,
					placeHolder: `Language-service results may be incomplete · ${result.hidden} filtered · ${result.skipped} unsupported · test filter checks declaration files`,
					matchOnDescription: true,
					matchOnDetail: true,
				},
				request.token,
			);
			if (!selected || request.token.isCancellationRequested || this.disposed) {
				return;
			}
			if (!this.queries.isCurrent(result)) {
				throw new StaleQueryError();
			}
			await window.showTextDocument(selected.match.location.uri, {
				selection: selected.match.location.range,
				preview: true,
			});
		} catch (error) {
			if (
				error instanceof CancellationError ||
				request.token.isCancellationRequested ||
				this.disposed
			) {
				return;
			}
			if (error instanceof StaleQueryError) {
				void window.showInformationMessage(error.message);
				return;
			}
			this.output.error('Implementation query failed', error);
			void window.showErrorMessage(
				`Go Interfaces: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			if (this.active === request) {
				this.active = undefined;
			}
			request.dispose();
		}
	}

	private async toggleFilter(): Promise<void> {
		const uri = window.activeTextEditor?.document.uri;
		if (!uri || !workspace.getWorkspaceFolder(uri)) {
			void window.showInformationMessage(
				'Open a Go file in a workspace to change its test filter.',
			);
			return;
		}
		try {
			const configuration = workspace.getConfiguration('goInterfaces', uri);
			const enabled = configuration.get<boolean>('hideTestingImplementations', true);
			await configuration.update(
				'hideTestingImplementations',
				!enabled,
				ConfigurationTarget.WorkspaceFolder,
			);
			this.active?.cancel();
			void window.showInformationMessage(
				`Go Interfaces: Declaration-file test filter ${enabled ? 'disabled' : 'enabled'}.`,
			);
		} catch (error) {
			this.output.error('Unable to update the test filter', error);
			void window.showErrorMessage(
				`Go Interfaces: Unable to change the test filter: ${String(error)}`,
			);
		}
	}

	dispose(): void {
		this.disposed = true;
		this.active?.cancel();
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
	}
}
