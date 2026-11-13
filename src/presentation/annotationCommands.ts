import { commands, l10n, window, type Disposable, type LogOutputChannel } from 'vscode';
import { StaleQueryError, type QueryResult } from '../query/model';
import type { ImplementationQueries } from '../query/service';
import type { AnnotationDocuments } from './annotationDocuments';
import {
	openRelation,
	openRelationArguments,
	retryRelation,
	showRelations,
	type OpenRelationArguments,
	type RetryRelationArguments,
	type ShowRelationsArguments,
} from './annotationModel';
import { errorMessage } from './labels';
import { openTarget } from './navigation';
import { createRelationItems, createRelationPickOptions } from './relationPicker';

// Validate arguments passed to public commands.
// 校验传入公开命令的参数
function isRetryArguments(args: unknown[]): args is RetryRelationArguments {
	return (
		args.length === 3 &&
		typeof args[0] === 'string' &&
		args[0].length > 0 &&
		typeof args[1] === 'number' &&
		Number.isSafeInteger(args[1]) &&
		args[1] >= 1 &&
		typeof args[2] === 'number' &&
		Number.isSafeInteger(args[2]) &&
		args[2] >= 0
	);
}

function isRelationArguments(args: unknown[]): args is ShowRelationsArguments {
	return (
		args.length === 4 &&
		isRetryArguments(args.slice(0, 3)) &&
		typeof args[3] === 'number' &&
		Number.isSafeInteger(args[3]) &&
		args[3] >= 0
	);
}

function isOpenArguments(args: unknown[]): args is OpenRelationArguments {
	return (
		args.length === 5 &&
		isRelationArguments(args.slice(0, 4)) &&
		typeof args[4] === 'string' &&
		args[4].length > 0
	);
}

export class AnnotationCommands implements Disposable {
	private readonly subscriptions: Disposable[];
	private disposed = false;

	constructor(
		private readonly documents: AnnotationDocuments,
		private readonly queries: ImplementationQueries,
		private readonly output: LogOutputChannel,
		retried: (uri: string) => void,
	) {
		this.subscriptions = [
			commands.registerCommand(openRelation, (...args: unknown[]): Promise<void> =>
				this.navigate(args),
			),
			commands.registerCommand(showRelations, (...args: unknown[]): Promise<void> =>
				this.showAll(args),
			),
			commands.registerCommand(retryRelation, (...args: unknown[]): void =>
				this.retry(args, retried),
			),
		];
	}

	private retry(args: unknown[], retried: (uri: string) => void): void {
		try {
			if (this.disposed) {
				return;
			}
			if (!isRetryArguments(args)) {
				throw new Error(l10n.t('Invalid Go implementation retry arguments'));
			}
			const [source, version, offset] = args;
			const state = this.documents.find(source);
			const item = state?.items.find((item) => item.start === offset);
			if (
				state?.version === version &&
				!state.document.isClosed &&
				state.document.version === version &&
				item?.state.kind === 'failed'
			) {
				// Retry only failed annotations.
				// 仅重试失败的标注
				item.state = { kind: 'pending' };
				retried(source);
			}
		} catch (error) {
			this.report(error);
		}
	}

	private current(args: ShowRelationsArguments | OpenRelationArguments): QueryResult {
		if (this.disposed) {
			throw new StaleQueryError();
		}
		const [source, version, offset, generation] = args;
		const state = this.documents.find(source);
		const item = state?.items.find((item) => item.start === offset);
		const result = item?.state.kind === 'ready' ? item.state.result : undefined;
		if (
			!state ||
			state.document.isClosed ||
			state.version !== version ||
			state.document.version !== version ||
			!result ||
			result.generation !== generation ||
			!this.queries.isCurrent(result)
		) {
			throw new StaleQueryError();
		}
		return result;
	}

	private async navigate(args: unknown[]): Promise<void> {
		try {
			if (!isOpenArguments(args)) {
				throw new Error(l10n.t('Invalid Go implementation navigation arguments'));
			}
			const result = this.current(args);
			const match = result.matches.find((item) => item.id === args[4]);
			if (!match) {
				throw new StaleQueryError();
			}
			await openTarget(match.location, () => {
				if (this.disposed || !this.queries.isCurrent(result)) {
					throw new StaleQueryError();
				}
			});
		} catch (error) {
			this.report(error);
		}
	}

	private async showAll(args: unknown[]): Promise<void> {
		try {
			if (!isRelationArguments(args)) {
				throw new Error(l10n.t('Invalid Go implementation list arguments'));
			}
			const result = this.current(args);
			const selected = await window.showQuickPick(
				createRelationItems(result, false),
				createRelationPickOptions(result),
			);
			if (selected) {
				await this.navigate(openRelationArguments(args, selected.match.id));
			}
		} catch (error) {
			this.report(error);
		}
	}

	private report(error: unknown): void {
		if (this.disposed) {
			return;
		}
		if (error instanceof StaleQueryError) {
			void window.showInformationMessage(error.message);
			return;
		}
		this.output.error('Unable to navigate Go implementation annotations', error);
		void window.showErrorMessage(errorMessage(error));
	}

	dispose(): void {
		this.disposed = true;
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
	}
}
