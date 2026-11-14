import { window, workspace, type Location } from 'vscode';

export async function openTarget(location: Location, check: () => void): Promise<void> {
	check();
	const document = await workspace.openTextDocument(location.uri);
	// Recheck query state after opening the target document.
	// 打开目标文档后重新检查查询状态
	check();
	await window.showTextDocument(document, {
		selection: location.range,
		preview: true,
	});
}
