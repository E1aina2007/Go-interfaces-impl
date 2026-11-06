import {
	DecorationRangeBehavior,
	MarkdownString,
	Uri,
	window,
	workspace,
	type DecorationOptions,
	type Disposable,
	type TextEditor,
	type TextEditorDecorationType,
} from 'vscode';
import {
	annotationsEnabled,
	inlineLimit,
	openRelation,
	relationArguments,
	shownResult,
	showRelations,
	type ImplementationAnnotations,
} from './annotations';
import { relationDirection, relationSummary } from './labels';

function appendLink(
	hover: MarkdownString,
	label: string,
	command: string,
	args: readonly unknown[],
): void {
	// Escape source names and encode arguments; only our guarded navigation commands are trusted.
	// 转义源码名称并编码参数，仅信任带有效性检查的导航命令
	const escaped = new MarkdownString().appendText(label).value;
	hover.appendMarkdown(
		`[${escaped}](command:${command}?${encodeURIComponent(JSON.stringify(args))})`,
	);
}

export class ImplementationGutter implements Disposable {
	private readonly implementsIcon: TextEditorDecorationType;
	private readonly implementedByIcon: TextEditorDecorationType;
	private readonly changed: Disposable;

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
		this.changed = annotations.onDidChange(() => {
			for (const editor of window.visibleTextEditors) {
				this.update(editor);
			}
		});
	}

	private update(editor: TextEditor): void {
		const implemented: DecorationOptions[] = [];
		const implementations: DecorationOptions[] = [];
		const state = this.annotations.get(editor.document);
		// Keep current icons until retained results are attached to the reloaded document.
		// 旧结果接续到重新读取的文档之前，保留当前图标以避免闪烁
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
				const hover = new MarkdownString();
				hover.appendText(`${relationDirection(result)} (${result.matches.length})`);
				hover.appendMarkdown('\n\n');
				// Stale hovers list names as plain text so outdated targets cannot be opened.
				// 过期结果的悬停仅以纯文本列出名称，避免打开已经失效的目标
				const args = shown.stale ? undefined : relationArguments(state, item, result);
				if (args) {
					hover.isTrusted = { enabledCommands: [openRelation, showRelations] };
				}
				for (const match of result.matches.slice(0, inlineLimit)) {
					if (args) {
						appendLink(hover, match.declaration.name, openRelation, [
							...args,
							match.id,
						]);
					} else {
						hover.appendText(match.declaration.name);
					}
					hover.appendText(
						` · ${workspace.asRelativePath(match.location.uri)}${result.unverifiedTesting.has(match.id) ? ' · Test sources unverified' : ''}`,
					);
					hover.appendMarkdown('\n\n');
				}
				if (args) {
					appendLink(hover, 'Show all results', showRelations, args);
				} else {
					hover.appendText('Refreshing after a change…');
				}
				hover.appendMarkdown('\n\n');
				hover.appendText(relationSummary(result));
				const options = { range: item.range, hoverMessage: hover };
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
		this.implementsIcon.dispose();
		this.implementedByIcon.dispose();
	}
}
