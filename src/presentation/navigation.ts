import { window, workspace, type Location } from 'vscode';

export async function openTarget(location: Location, check: () => void): Promise<void> {
	check();
	const document = await workspace.openTextDocument(location.uri);
	// Opening the document can yield to invalidation or cancellation; recheck before showing it.
	// 打开文档期间可能发生失效或取消，展示前需要再次检查
	check();
	await window.showTextDocument(document, {
		selection: location.range,
		preview: true,
	});
}
