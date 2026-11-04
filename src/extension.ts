import path from 'node:path';
import { commands, languages, window, type ExtensionContext } from 'vscode';
import { GoSyntax } from './core/syntax';
import { ImplementationLenses } from './presentation/codeLens';
import { ImplementationCommands } from './presentation/commands';
import { ImplementationQueries } from './query/service';

export function activate(context: ExtensionContext): void {
	const output = window.createOutputChannel('Go Interfaces', { log: true });
	const syntax = new GoSyntax(path.join(context.extensionPath, 'dist', 'wasm'));
	const queries = new ImplementationQueries(syntax);
	const actions = new ImplementationCommands(queries, output);
	const lenses = new ImplementationLenses(syntax, output);

	// Let the extension host dispose of the channel and commands when the extension unloads.
	// 将日志通道和命令交给扩展宿主，在插件卸载时统一释放
	context.subscriptions.push(output);
	context.subscriptions.push(
		actions,
		queries,
		lenses,
		syntax,
		languages.registerCodeLensProvider({ language: 'go', scheme: 'file' }, lenses),
	);
	context.subscriptions.push(
		commands.registerCommand('goInterfaces.showOutput', () => {
			output.show(true);
		}),
	);

	output.info('Extension activated');
}
