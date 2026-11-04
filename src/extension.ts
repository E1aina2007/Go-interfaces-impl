import { commands, window, type ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext): void {
	const output = window.createOutputChannel('Go Interfaces', { log: true });

	// Let the extension host dispose of the channel and commands when the extension unloads.
	// 将日志通道和命令交给扩展宿主，在插件卸载时统一释放
	context.subscriptions.push(output);
	context.subscriptions.push(
		commands.registerCommand('goInterfaces.showOutput', () => {
			output.show(true);
		}),
	);

	output.info('Extension activated');
}
