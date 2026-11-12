import {
	CancellationError,
	Location,
	commands,
	extensions,
	l10n,
	type CancellationToken,
	type Disposable,
	type DocumentSymbol,
	type LocationLink,
	type Position,
	type SymbolInformation,
	type Uri,
} from 'vscode';

async function wait<T>(start: () => Thenable<T>, token: CancellationToken): Promise<T> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	let subscription: Disposable | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stopped = new Promise<never>((_, reject) => {
		subscription = token.onCancellationRequested(() => reject(new CancellationError()));
		timer = setTimeout(
			() =>
				reject(
					new Error(
						l10n.t(
							'The Go language service timed out. Try again after it finishes loading.',
						),
					),
				),
			60_000,
		);
	});
	try {
		// Public provider commands cannot cancel the underlying request; discard late responses instead.
		// 公开 provider 命令无法取消底层请求，因此取消后丢弃迟到的响应
		return await Promise.race([start(), stopped]);
	} finally {
		subscription?.dispose();
		clearTimeout(timer);
	}
}

function locations(items: readonly (Location | LocationLink)[] | undefined): readonly Location[] {
	if (!items) {
		throw new Error(l10n.t('The Go language service is not ready.'));
	}
	const unique = new Map<string, Location>();
	for (const item of items) {
		const location =
			'targetUri' in item
				? new Location(item.targetUri, item.targetSelectionRange ?? item.targetRange)
				: item;
		const { line, character } = location.range.start;
		unique.set(`${location.uri.toString()}:${line}:${character}`, location);
	}
	return [...unique.values()];
}

export class GoProvider {
	async prepare(uri: Uri, token: CancellationToken): Promise<void> {
		const go = extensions.getExtension<unknown>('golang.go');
		if (!go) {
			throw new Error(l10n.t('Install and configure the official Go extension (golang.go).'));
		}
		await wait(() => go.activate(), token);
		const symbols = await wait(
			() =>
				commands.executeCommand<(DocumentSymbol | SymbolInformation)[]>(
					'vscode.executeDocumentSymbolProvider',
					uri,
				),
			token,
		);
		if (!symbols || symbols.length === 0) {
			throw new Error(
				l10n.t(
					'The Go language service returned no document symbols. Wait for gopls to finish loading and retry.',
				),
			);
		}
	}

	async definitions(
		uri: Uri,
		position: Position,
		token: CancellationToken,
	): Promise<readonly Location[]> {
		return locations(
			await wait(
				() =>
					commands.executeCommand<(Location | LocationLink)[]>(
						'vscode.executeDefinitionProvider',
						uri,
						position,
					),
				token,
			),
		);
	}

	async implementations(
		uri: Uri,
		position: Position,
		token: CancellationToken,
	): Promise<readonly Location[]> {
		return locations(
			await wait(
				() =>
					commands.executeCommand<(Location | LocationLink)[]>(
						'vscode.executeImplementationProvider',
						uri,
						position,
					),
				token,
			),
		);
	}
}
