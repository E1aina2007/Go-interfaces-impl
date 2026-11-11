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
	relationArguments,
	shownResult,
	showRelations,
} from './annotationModel';
import { relationDirection, relationSummary, unverifiedNote } from './labels';

function appendLink(
	hover: MarkdownString,
	label: string,
	command: string,
	args: readonly unknown[],
): void {
	// Escape source names and encode arguments; only our guarded navigation commands are trusted.
	// 转义源码名称并编码参数，仅信任带有效性检查的导航命令
	const escaped = new MarkdownString().appendText(label).value;
	// Preserve escaped file URIs and type IDs when VS Code decodes command arguments.
	// 保留文件 URI 与类型身份中的转义字符，避免 VS Code 解码命令参数时将其改写
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
		// Keep the original 16px badge at its natural size and let VS Code select its theme variant.
		// 原创 16 像素徽标按原始大小显示，由 VS Code 选择适合当前主题的版本
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
		// Resolve hovers on demand so retained icons cannot carry stale command links.
		// 按需生成悬停内容，避免保留的图标装饰携带过期命令链接
		this.hover = languages.registerHoverProvider({ language: 'go', scheme: 'file' }, this);
		this.changed = annotations.onDidChange(() => {
			const active = window.activeTextEditor;
			// VS Code caches open hovers; dismiss the old popup when its results invalidate.
			// VS Code 会缓存已打开的悬停，结果失效时先关闭旧弹层
			if (
				active &&
				!annotations.get(active.document) &&
				annotations.retaining(active.document)
			) {
				void commands
					.executeCommand('editor.action.hideHover')
					.then(undefined, (error: unknown) => {
						console.error('Unable to dismiss stale Go implementation hover', error);
					});
			}
			for (const editor of window.visibleTextEditors) {
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
		if (
			!state ||
			token.isCancellationRequested ||
			!annotationsEnabled(document, 'gutterIcons') ||
			this.annotations.get(document) !== state
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
				appendLink(hover, match.declaration.name, openRelation, [...args, match.id]);
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
		const state = this.annotations.get(editor.document);
		// Preserve VS Code's tracked icon ranges until declarations are read again.
		// 声明重新读取前保留由 VS Code 跟随编辑的图标范围
		if (
			!state &&
			this.annotations.retaining(editor.document) &&
			annotationsEnabled(editor.document, 'gutterIcons')
		) {
			return;
		}
		if (state && annotationsEnabled(editor.document, 'gutterIcons')) {
			for (const item of state.items) {
				const shown = shownResult(item);
				if (!shown || shown.result.matches.length === 0) {
					continue;
				}
				const result = shown.result;
				const options = { range: item.range };
				if (result.subject.declaration.kind === 'struct') {
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
