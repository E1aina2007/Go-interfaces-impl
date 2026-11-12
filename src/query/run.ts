import path from 'node:path';
import { Location, l10n, workspace, type CancellationToken, type Position, type Uri } from 'vscode';
import type { GoProvider } from '../language/provider';
import { belongsToModule, findModule } from '../workspace/module';
import { TestingFilter } from './filter';
import {
	GoSyntaxError,
	StaleQueryError,
	type CapturedFile,
	type LocatedType,
	type QueryKind,
	type QueryResult,
} from './model';
import { TypeResolver } from './resolve';

interface QueryContext {
	readonly provider: GoProvider;
	readonly token: CancellationToken;
	readonly generation: number;
	readonly read: (uri: Uri) => Promise<CapturedFile>;
	readonly check: () => void;
	readonly prepare: (uri: Uri) => Promise<void>;
}

export async function runQuery(
	context: QueryContext,
	uri: Uri,
	position: Position,
	expected: QueryKind,
	sourceVersion?: number,
): Promise<QueryResult> {
	const { provider, token, generation, read, check, prepare } = context;
	const resolver = new TypeResolver(provider, read, token);
	check();
	if (!workspace.isTrusted) {
		throw new Error(l10n.t('Go implementation queries require a trusted workspace.'));
	}
	if (uri.scheme !== 'file' || !workspace.getWorkspaceFolder(uri)) {
		throw new Error(l10n.t('Select a Go file inside an open filesystem workspace.'));
	}
	if (
		workspace.textDocuments.some(
			(document) =>
				document.isDirty &&
				/^go\.(mod|sum|work|work\.sum)$/.test(path.basename(document.fileName)),
		)
	) {
		throw new Error(
			l10n.t('Save Go module and workspace configuration files before querying.'),
		);
	}
	const source = await read(uri);
	if (sourceVersion !== undefined && source.document.version !== sourceVersion) {
		throw new StaleQueryError();
	}
	if (source.document.languageId !== 'go') {
		throw new Error(l10n.t('Select a Go source document.'));
	}
	position = source.document.getWordRangeAtPosition(position)?.start ?? position;
	const module = await findModule(uri.toString());
	if (!module) {
		throw new Error(l10n.t('No go.mod was found for the selected file.'));
	}
	await prepare(uri);
	check();
	const subject = await resolver.resolveReference(new Location(uri, position));
	if (!subject) {
		throw new Error(
			l10n.t(
				'Select a named type or interface. Its type reference must resolve unambiguously within 32 declarations; pointer types and generic instances are not supported.',
			),
		);
	}
	const direction = subject.declaration.kind === 'interface' ? 'interface' : 'concrete';
	if (expected !== 'auto' && direction !== expected) {
		throw new Error(
			expected === 'concrete'
				? l10n.t('This command requires a concrete named type.')
				: l10n.t('This command requires an interface type.'),
		);
	}
	if (
		subject.declaration.generic ||
		subject.declaration.constraint ||
		subject.declaration.empty
	) {
		throw new Error(
			l10n.t(
				'Generic declarations, constraint interfaces and empty interfaces are not supported by this query path.',
			),
		);
	}
	// Query from the original reference so the Go extension retains the caller's build context.
	// 从原始引用位置查询，保留 Go 扩展为调用方选择的构建上下文
	const locations = await provider.implementations(uri, position, token);
	const hideTesting = workspace
		.getConfiguration('goInterfaces', uri)
		.get<boolean>('hideTestingImplementations', true);
	const matches = new Map<string, LocatedType>();
	const seen = new Set<string>();
	let skipped = 0;
	let unreadable = 0;
	const moduleResults = new Map<string, Promise<boolean>>();
	const belongs = (uri: string): Promise<boolean> => {
		let result = moduleResults.get(uri);
		if (!result) {
			result = belongsToModule(uri, module);
			moduleResults.set(uri, result);
		}
		return result;
	};
	for (const location of locations) {
		check();
		if (location.uri.scheme !== 'file') {
			skipped++;
			continue;
		}
		const key = location.uri.toString();
		if (!(await belongs(key))) {
			continue;
		}
		const match = await candidate(resolver, location);
		if (match === 'unreadable') {
			unreadable++;
			continue;
		}
		if (!match) {
			skipped++;
			continue;
		}
		// Interface-to-interface results are outside this relation scope, not unsupported failures.
		// 接口之间的结果不属于本插件的关系范围，也不是不支持导致的失败
		if ((match.declaration.kind === 'interface') === (direction === 'interface')) {
			continue;
		}
		if (match.declaration.generic || match.declaration.constraint || match.declaration.empty) {
			skipped++;
			continue;
		}
		// Recheck the canonical type so a local alias cannot import a dependency into module results.
		// 再次核对规范类型，避免通过本地别名把依赖类型加入当前模块结果
		if (!(await belongs(match.location.uri.toString()))) {
			continue;
		}
		const identity = match.id;
		if (seen.has(identity)) {
			continue;
		}
		seen.add(identity);
		matches.set(identity, match);
	}
	const candidates = [...matches.values()];
	// Disabling filtering also skips embedded-interface expansion and method-origin provider calls.
	// 关闭过滤时也跳过嵌入接口展开和方法来源的语言服务调用
	const filtered = hideTesting
		? await new TestingFilter(provider, resolver, read, belongs, token).apply(
				subject,
				candidates,
			)
		: { matches: candidates, hidden: 0, unverified: new Set<string>() };
	check();
	return {
		coverage: 'provider-limited',
		module,
		subject,
		matches: [...filtered.matches].sort(
			(a, b) =>
				a.declaration.name.localeCompare(b.declaration.name) ||
				a.location.uri.toString().localeCompare(b.location.uri.toString()),
		),
		hidden: filtered.hidden,
		unverifiedTesting: filtered.unverified,
		skipped,
		unreadable,
		hideTesting,
		generation,
	};
}

async function candidate(
	resolver: TypeResolver,
	location: Location,
): Promise<LocatedType | 'unreadable' | undefined> {
	try {
		return await resolver.resolve(location);
	} catch (error) {
		// A candidate file being edited must not fail the whole query; it is counted separately.
		// 正在编辑的候选文件不应使整个查询失败，单独计数并在摘要中显示
		if (error instanceof GoSyntaxError) {
			return 'unreadable';
		}
		throw error;
	}
}
