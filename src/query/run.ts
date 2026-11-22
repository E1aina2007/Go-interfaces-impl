import { Location, l10n, workspace, type CancellationToken, type Position, type Uri } from 'vscode';
import { isTestFile } from '../core/testing';
import type { GoProvider } from '../language/provider';
import { findModule, isGoConfigFile } from '../workspace/module';
import {
	RelationSources,
	relationSourceKinds,
	type RelationSource,
} from '../workspace/relationSources';
import { TestingFilter } from './filter';
import { GenericRelations, supportsType } from './generics';
import {
	GoSyntaxError,
	StaleQueryError,
	type CapturedFile,
	type LocatedType,
	type QueryOptions,
	type QueryResult,
	type RelationMatch,
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
	{ expected, scope, sourceVersion }: QueryOptions,
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
			(document) => document.isDirty && isGoConfigFile(document.fileName),
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
	// Preserve the original reference's build and test context after resolving aliases.
	// 解析别名后仍保留原始引用的构建和测试上下文
	const locations = await provider.implementations(uri, position, token);
	const configuration = workspace.getConfiguration('goInterfaces', uri);
	const hideTesting =
		!isTestFile(uri.path) && configuration.get<boolean>('hideTestingImplementations', true);
	const sources = new RelationSources(module, scope);
	const matches = new Map<string, RelationMatch>();
	let hasExternalCandidates = false;
	const sourceFor = async (uri: Uri): Promise<RelationSource | undefined> => {
		const key = uri.toString();
		const origin = await sources.source(key);
		// A location outside the module only provides an entry point for a full query.
		// 模块外的位置仅用于提供完整查询入口
		if (scope === 'module' && !origin && !hasExternalCandidates) {
			hasExternalCandidates = (await sources.directory(key)) !== undefined;
		}
		return origin;
	};
	let skipped = 0;
	let unreadable = 0;
	for (const location of locations) {
		check();
		if (location.uri.scheme !== 'file' || !location.uri.path.endsWith('.go')) {
			skipped++;
			continue;
		}
		if (!(await sourceFor(location.uri))) {
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
		if (matches.has(match.id)) {
			continue;
		}
		// Attribute aliases to the declaration they resolve to.
		// 别名按最终解析到的声明确定来源
		const source = await sourceFor(match.location.uri);
		if (source) {
			matches.set(match.id, { ...match, source });
		}
	}

	const candidates = [...matches.values()].sort(
		(a, b) =>
			relationSourceKinds.indexOf(a.source.kind) -
				relationSourceKinds.indexOf(b.source.kind) ||
			a.declaration.name.localeCompare(b.declaration.name) ||
			a.location.uri.toString().localeCompare(b.location.uri.toString()),
	);
	// Direct methods can only be declared in the concrete type's package.
	// 直接方法只能声明在具体类型所属的包中
	const methodPackages = new Set(
		direction === 'interface'
			? candidates.map((match) => match.packageDirectory)
			: [subject.packageDirectory],
	);
	const includesMethodFile = async (uri: string): Promise<boolean> => {
		const directory = await sources.directory(uri);
		return directory !== undefined && methodPackages.has(directory);
	};
	const generics = new GenericRelations(
		provider,
		resolver,
		read,
		includesMethodFile,
		token,
		check,
	);
	const supported: RelationMatch[] = [];
	for (const match of candidates) {
		check();
		if (await generics.supports(subject, match)) {
			supported.push(match);
		} else {
			skipped++;
		}
	}
	// Filter candidates by method source when test filtering is enabled.
	// 启用测试过滤时按方法来源筛选候选类型
	const filtered = hideTesting
		? await new TestingFilter(provider, resolver, read, includesMethodFile, token).apply(
				subject,
				supported,
			)
		: { matches: supported, hidden: 0, unverified: new Set<string>() };
	check();
	return {
		coverage: 'provider-limited',
		module,
		subject,
		matches: filtered.matches,
		hasExternalCandidates,
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
