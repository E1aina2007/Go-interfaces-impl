import path from 'node:path';
import { Location, l10n, workspace, type CancellationToken, type Position, type Uri } from 'vscode';
import type { GoProvider } from '../language/provider';
import { belongsToModule, findModule } from '../workspace/module';
import { TestingFilter } from './filter';
import { GenericRelations, supportsType } from './generics';
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
				'Select a supported named type or interface. Its type reference must resolve unambiguously within 32 declarations.',
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
	if (!supportsType(subject.declaration)) {
		throw new Error(
			l10n.t(
				'Generic interfaces, embedded generic structs, constraint interfaces and empty interfaces are not supported by this query path.',
			),
		);
	}
	// Query from the original reference to preserve its build context.
	// 从原始引用位置查询以保留构建上下文
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
	const generics = new GenericRelations(provider, resolver, read, belongs, token, check);
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
		// Skip relations between declarations of the same kind.
		// 跳过同类声明之间的关系
		if ((match.declaration.kind === 'interface') === (direction === 'interface')) {
			continue;
		}
		if (!supportsType(match.declaration)) {
			skipped++;
			continue;
		}
		// Confirm the resolved declaration belongs to the current module.
		// 确认解析后的声明属于当前模块
		if (!(await belongs(match.location.uri.toString()))) {
			continue;
		}
		const identity = match.id;
		if (seen.has(identity)) {
			continue;
		}
		seen.add(identity);
		if (!(await generics.supports(subject, match))) {
			skipped++;
			continue;
		}
		matches.set(identity, match);
	}
	const candidates = [...matches.values()];
	// Filter candidates by method source when test filtering is enabled.
	// 启用测试过滤时按方法来源筛选候选类型
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
		// Count files with syntax errors as unreadable candidates.
		// 将存在语法错误的文件计为无法读取的候选
		if (error instanceof GoSyntaxError) {
			return 'unreadable';
		}
		throw error;
	}
}
