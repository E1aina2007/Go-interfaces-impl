import {
	DecorationRangeBehavior,
	Hover,
	MarkdownString,
	Uri,
	commands,
	languages,
	l10n,
	window,
	workspace,
	type DecorationOptions,
	type CancellationToken,
	type Disposable,
	type HoverProvider,
	type Position,
	type TextDocument,
	type TextEditor,
	type TextEditorDecorationType,
} from 'vscode';
import type { ImplementationAnnotations } from './annotations';
import {
	annotationsEnabled,
	inlineLimit,
	openRelation,
	openRelationArguments,
	relationArguments,
	shownResult,
	showRelations,
	type OpenRelationArguments,
	type ShowRelationsArguments,
} from './annotationModel';
import { relationDirection, relationSummary, unverifiedNote } from './labels';

function appendLink(
	hover: MarkdownString,
	label: string,
	command: typeof openRelation | typeof showRelations,
	args: ShowRelationsArguments | OpenRelationArguments,
): void {
	// Build a command link with an escaped label and encoded arguments.
	// 使用转义后的标签和编码参数构建命令链接
	const escaped = new MarkdownString().appendText(label).value;
	// Preserve argument encoding when VS Code parses the command URI.
	// VS Code 解析命令 URI 时保留参数编码
	const uri = Uri.from({
		scheme: 'command',
		path: command,
		query: encodeURIComponent(JSON.stringify(args)),
	});
	hover.appendMarkdown(`[${escaped}](${uri.toString()})`);
}

export class ImplementationGutter implements Disposable, HoverProvider {
	private readonly implementsIcon: TextEditorDecorationType;
	private readonly implementedByIcon: TextEditorDecorationType;
	private readonly changed: Disposable;
	private readonly hover: Disposable;

	constructor(
		private readonly annotations: ImplementationAnnotations,
		extensionUri: Uri,
	) {
		// Use theme-specific gutter icons.
		// 使用适配主题的行号槽图标
		this.implementsIcon = window.createTextEditorDecorationType({
			gutterIconPath: Uri.joinPath(extensionUri, 'media', 'implements.svg'),
			dark: { gutterIconPath: Uri.joinPath(extensionUri, 'media', 'implements-dark.svg') },
			gutterIconSize: 'auto',
			rangeBehavior: DecorationRangeBehavior.ClosedClosed,
		});
		this.implementedByIcon = window.createTextEditorDecorationType({
			gutterIconPath: Uri.joinPath(extensionUri, 'media', 'implemented-by.svg'),
			dark: {
				gutterIconPath: Uri.joinPath(extensionUri, 'media', 'implemented-by-dark.svg'),
			},
			gutterIconSize: 'auto',
			rangeBehavior: DecorationRangeBehavior.ClosedClosed,
		});
		// Build hover links from current annotation results.
		// 根据当前标注结果构建悬停链接
		this.hover = languages.registerHoverProvider({ language: 'go', scheme: 'file' }, this);
		this.changed = annotations.onDidChange((event) => {
			const active = window.activeTextEditor;
			// Hide open hovers when results are invalidated.
			// 结果失效时关闭已打开的悬停
			if (
				event.kind === 'invalidated' &&
				active &&
				annotations.view(active.document).kind === 'retained'
			) {
				void commands
					.executeCommand('editor.action.hideHover')
					.then(undefined, (error: unknown) => {
						console.error('Unable to dismiss stale Go implementation hover', error);
					});
			}
			for (const editor of window.visibleTextEditors) {
				if (event.kind === 'document' && editor.document.uri.toString() !== event.uri) {
					continue;
				}
				this.update(editor);
			}
		});
	}

	async provideHover(
		document: TextDocument,
		position: Position,
		token: CancellationToken,
	): Promise<Hover | undefined> {
		if (token.isCancellationRequested || !annotationsEnabled(document, 'gutterIcons')) {
			return undefined;
		}
		const state = await this.annotations.load(document);
		const view = this.annotations.view(document);
		if (
			!state ||
			token.isCancellationRequested ||
			!annotationsEnabled(document, 'gutterIcons') ||
			view.kind !== 'loaded' ||
			view.state !== state
		) {
			return undefined;
		}
		const item = state.items.find((item) => item.range.contains(position));
		const shown = item && shownResult(item);
		if (!item || !shown || shown.result.matches.length === 0) {
			return undefined;
		}
		const result = shown.result;
		const hover = new MarkdownString();
		hover.appendText(`${relationDirection(result)} (${result.matches.length})`);
		hover.appendMarkdown('\n\n');
		const args = shown.stale ? undefined : relationArguments(state, item, result);
		if (args) {
			hover.isTrusted = { enabledCommands: [openRelation, showRelations] };
		}
		for (const match of result.matches.slice(0, inlineLimit)) {
			if (args) {
				appendLink(
					hover,
					match.declaration.name,
					openRelation,
					openRelationArguments(args, match.id),
				);
			} else {
				hover.appendText(match.declaration.name);
			}
			hover.appendText(
				` · ${workspace.asRelativePath(match.location.uri)}${unverifiedNote(result, match.id)}`,
			);
			hover.appendMarkdown('\n\n');
		}
		if (args) {
			appendLink(hover, l10n.t('Show all results'), showRelations, args);
		} else {
			hover.appendText(l10n.t('Refreshing after a change…'));
		}
		hover.appendMarkdown('\n\n');
		hover.appendText(relationSummary(result));
		return new Hover(hover, item.range);
	}

	private update(editor: TextEditor): void {
		const implemented: DecorationOptions[] = [];
		const implementations: DecorationOptions[] = [];
		const view = this.annotations.view(editor.document);
		const enabled = annotationsEnabled(editor.document, 'gutterIcons');
		// Keep retained icon ranges until declarations reload.
		// 声明重新加载前保留图标范围
		if (view.kind === 'retained' && enabled) {
			return;
		}
		if (view.kind === 'loaded' && enabled) {
			for (const item of view.state.items) {
				const shown = shownResult(item);
				if (!shown || shown.result.matches.length === 0) {
					continue;
				}
				const result = shown.result;
				const options = { range: item.range };
				if (result.subject.declaration.kind !== 'interface') {
					implemented.push(options);
				} else {
					implementations.push(options);
				}
			}
		}
		editor.setDecorations(this.implementsIcon, implemented);
		editor.setDecorations(this.implementedByIcon, implementations);
	}

	dispose(): void {
		this.changed.dispose();
		this.hover.dispose();
		this.implementsIcon.dispose();
		this.implementedByIcon.dispose();
	}
}
