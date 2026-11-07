import {
	CancellationError,
	CancellationTokenSource,
	ConfigurationTarget,
	Position,
	ProgressLocation,
	ThemeIcon,
	Uri,
	commands,
	l10n,
	window,
	workspace,
	type Disposable,
	type LogOutputChannel,
	type QuickPickItem,
} from 'vscode';
import type { TypeKind } from '../core/types';
import { type ImplementationQueries, StaleQueryError, type QueryResult } from '../query/service';
import type { LocatedType } from '../query/resolve';
import { errorMessage, relationDirection, relationSummary, unverifiedNote } from './labels';

export const findInterfaces = 'goInterfaces.findInterfaces';
export const findStructs = 'goInterfaces.findStructs';
export const findImplementations = 'goInterfaces.findImplementations';

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
				findImplementations,
				(uri?: Uri, position?: Position, version?: number): Promise<void> =>
					this.run('auto', uri, position, version),
			),
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
		kind: TypeKind | 'auto',
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
			void window.showInformationMessage(
				l10n.t('Open a Go document and select a type name.'),
			);
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
		let title = l10n.t('Go Interfaces: Finding implementation relations');
		if (kind === 'struct') {
			title = l10n.t('Go Interfaces: Finding implemented interfaces');
		} else if (kind === 'interface') {
			title = l10n.t('Go Interfaces: Finding implementing structs');
		}
		try {
			const result = await window.withProgress(
				{
					location: ProgressLocation.Notification,
					title,
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
					l10n.t(
						'The Go language service returned no displayable matches in this module. {0}.',
						relationSummary(result),
					),
				);
				return;
			}
			const items: ResultItem[] = result.matches.map((match) => ({
				label: match.declaration.name,
				iconPath: new ThemeIcon(
					match.declaration.kind === 'struct' ? 'symbol-struct' : 'symbol-interface',
				),
				description: workspace.asRelativePath(match.location.uri),
				detail: `${match.location.uri.fsPath}:${match.location.range.start.line + 1}${unverifiedNote(result, match.id)}`,
				match,
			}));
			const selected = await window.showQuickPick(
				items,
				{
					title: `${result.subject.declaration.name} · ${relationDirection(result)}`,
					placeHolder: relationSummary(result),
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
			void window.showErrorMessage(errorMessage(error));
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
				l10n.t('Open a Go file in a workspace to change its test filter.'),
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
				enabled
					? l10n.t('Go Interfaces: Test source filter disabled.')
					: l10n.t('Go Interfaces: Test source filter enabled.'),
			);
		} catch (error) {
			this.output.error('Unable to update the test filter', error);
			void window.showErrorMessage(
				l10n.t('Go Interfaces: Unable to change the test filter: {0}', String(error)),
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
