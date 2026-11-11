import {
	CancellationError,
	CancellationTokenSource,
	Position,
	ProgressLocation,
	Uri,
	commands,
	l10n,
	window,
	workspace,
	type Disposable,
	type LogOutputChannel,
} from 'vscode';
import { toggleTestingFilter } from './filterCommand';
import type { TypeKind } from '../core/types';
import { StaleQueryError, type QueryResult } from '../query/model';
import type { ImplementationQueries } from '../query/service';
import { errorMessage, relationSummary } from './labels';
import { openTarget } from './navigation';
import { createRelationItems, createRelationPickOptions } from './relationPicker';

export const findInterfaces = 'goInterfaces.findInterfaces';
export const findStructs = 'goInterfaces.findStructs';
export const findImplementations = 'goInterfaces.findImplementations';

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
				toggleTestingFilter(this.output, () => this.active?.cancel()),
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
			const selected = await window.showQuickPick(
				createRelationItems(result, true),
				createRelationPickOptions(result),
				request.token,
			);
			if (!selected) {
				return;
			}
			await openTarget(selected.match.location, () => {
				if (request.token.isCancellationRequested || this.disposed) {
					throw new CancellationError();
				}
				if (!this.queries.isCurrent(result)) {
					throw new StaleQueryError();
				}
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

	dispose(): void {
		this.disposed = true;
		this.active?.cancel();
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
	}
}
