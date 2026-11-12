import { ConfigurationTarget, l10n, window, workspace, type LogOutputChannel } from 'vscode';

export async function toggleTestingFilter(
	output: LogOutputChannel,
	changed: () => void,
): Promise<void> {
	const uri = window.activeTextEditor?.document.uri;
	if (!uri || !workspace.getWorkspaceFolder(uri)) {
		void window.showInformationMessage(
			l10n.t('Open a Go file in a workspace to change its test filter.'),
		);
		return;
	}
	try {
		const configuration = workspace.getConfiguration('goInterfaces', uri);
		const enabled = configuration.get<boolean>('hideTestingImplementations', true);
		await configuration.update(
			'hideTestingImplementations',
			!enabled,
			ConfigurationTarget.WorkspaceFolder,
		);
		changed();
		void window.showInformationMessage(
			enabled
				? l10n.t('Go Interfaces: Test source filter disabled.')
				: l10n.t('Go Interfaces: Test source filter enabled.'),
		);
	} catch (error) {
		output.error('Unable to update the test filter', error);
		void window.showErrorMessage(
			l10n.t('Go Interfaces: Unable to change the test filter: {0}', String(error)),
		);
	}
}
