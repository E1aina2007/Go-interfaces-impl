import { commands, window, type Disposable, type LogOutputChannel } from 'vscode';
import { StaleQueryError, type QueryResult } from '../query/model';
import type { ImplementationQueries } from '../query/service';
import type { AnnotationDocuments } from './annotationDocuments';
import { openRelation, retryRelation, showRelations } from './annotationModel';
import { errorMessage } from './labels';
import { openTarget } from './navigation';
import { createRelationItems, createRelationPickOptions } from './relationPicker';

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
			commands.registerCommand(
				openRelation,
				(
					source: string,
					version: number,
					offset: number,
					generation: number,
					target: string,
				): Promise<void> => this.navigate(source, version, offset, generation, target),
			),
			commands.registerCommand(
				showRelations,
				(
					source: string,
					version: number,
					offset: number,
					generation: number,
				): Promise<void> => this.showAll(source, version, offset, generation),
			),
			commands.registerCommand(
				retryRelation,
				(source: string, version: number, offset: number): void => {
					const state = this.documents.find(source);
					const item = state?.items.find((item) => item.start === offset);
					if (
						state?.version === version &&
						state.document.version === version &&
						item?.state.kind === 'failed'
					) {
						// Replayed retry commands must not reset successful or retained results.
						// 重放的重试命令不能重置成功结果或保留的旧结果
						item.state = { kind: 'pending' };
						retried(source);
					}
				},
			),
		];
	}

	private current(
		source: string,
		version: number,
		offset: number,
		generation: number,
	): QueryResult {
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

	private async navigate(
		source: string,
		version: number,
		offset: number,
		generation: number,
		target: string,
	): Promise<void> {
		try {
			const result = this.current(source, version, offset, generation);
			const match = result.matches.find((item) => item.id === target);
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

	private async showAll(
		source: string,
		version: number,
		offset: number,
		generation: number,
	): Promise<void> {
		try {
			const result = this.current(source, version, offset, generation);
			const selected = await window.showQuickPick(
				createRelationItems(result, false),
				createRelationPickOptions(result),
			);
			if (selected) {
				await this.navigate(source, version, offset, generation, selected.match.id);
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
