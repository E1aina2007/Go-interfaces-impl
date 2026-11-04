import { commands, window, type ExtensionContext } from 'vscode';
import { AnalyzerHost } from './analyzer/host';
import { createWorkspaceContext } from './workspace/host';

let analyzers: AnalyzerHost | undefined;

export function activate(context: ExtensionContext): void {
	const output = window.createOutputChannel('Go Interfaces', { log: true });
	analyzers = new AnalyzerHost(context.extensionPath, {
		error: (message): void => output.error(message),
		warn: (message): void => output.warn(message),
		info: (message): void => output.info(message),
		log: (message): void => output.debug(message),
	});

	// Let the extension host dispose of the channel and commands when the extension unloads.
	// 将日志通道和命令交给扩展宿主，在插件卸载时统一释放
	context.subscriptions.push(output);
	context.subscriptions.push(createWorkspaceContext(output));
	context.subscriptions.push(
		commands.registerCommand('goInterfaces.showOutput', () => {
			output.show(true);
		}),
	);

	output.info('Extension activated');
}

export async function deactivate(): Promise<void> {
	await analyzers?.close();
	analyzers = undefined;
}
