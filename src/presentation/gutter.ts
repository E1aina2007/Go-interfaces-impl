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
	relationDirection,
	relationSummary,
	showRelations,
	type ImplementationAnnotations,
} from './annotations';

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
		this.implementsIcon = window.createTextEditorDecorationType({
			gutterIconPath: Uri.joinPath(extensionUri, 'media', 'implements.svg'),
			gutterIconSize: 'contain',
			rangeBehavior: DecorationRangeBehavior.ClosedClosed,
		});
		this.implementedByIcon = window.createTextEditorDecorationType({
			gutterIconPath: Uri.joinPath(extensionUri, 'media', 'implemented-by.svg'),
			gutterIconSize: 'contain',
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
		if (state && annotationsEnabled(editor.document, 'gutterIcons')) {
			for (const item of state.items) {
				const result = item.result;
				if (!result || result.matches.length === 0) {
					continue;
				}
				const args = relationArguments(state, item, result);
				const hover = new MarkdownString();
				hover.isTrusted = { enabledCommands: [openRelation, showRelations] };
				hover.appendText(`${relationDirection(result)} (${result.matches.length})`);
				hover.appendMarkdown('\n\n');
				for (const match of result.matches.slice(0, inlineLimit)) {
					appendLink(hover, match.declaration.name, openRelation, [...args, match.id]);
					hover.appendText(
						` · ${workspace.asRelativePath(match.location.uri)}${result.unverifiedTesting.has(match.id) ? ' · Test sources unverified' : ''}`,
					);
					hover.appendMarkdown('\n\n');
				}
				appendLink(hover, 'Show all results', showRelations, args);
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
