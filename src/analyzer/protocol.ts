import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/mini';
import type {
	AnalysisInput,
	AnalysisResponse,
	QueryFailure,
	UnsuccessfulOutcome,
} from '../application/contracts';

export const protocolVersion = 1;

export class AnalyzerError extends Error {
	constructor(readonly outcome: UnsuccessfulOutcome) {
		super(outcome.status === 'failed' ? outcome.error.message : outcome.status);
		this.name = 'AnalyzerError';
	}
}

export function failure(code: QueryFailure['code'], message: string): AnalyzerError {
	return new AnalyzerError({ status: 'failed', error: { code, message } });
}

const text = z.string().check(z.minLength(1));
const integer = z.number().check(z.int(), z.minimum(0));
const filePath = text.check(z.refine((value) => path.isAbsolute(value)));
const position = z.object({ line: integer, character: integer });
const direction = z.enum(['auto', 'interfaces', 'structs']);

export const initializeResult = z.object({
	protocolVersion: z.literal(protocolVersion),
	analyzerVersion: text,
	goVersion: text,
	minimumGoVersion: text,
	maximumGoVersion: text,
	analysisAvailable: z.boolean(),
});

const unsuccessfulOutcome = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('failed'),
		error: z.object({
			code: z.enum([
				'module-not-found',
				'workspace-untrusted',
				'go-not-found',
				'unsupported-go-version',
				'package-load-failed',
				'analyzer-unavailable',
				'protocol-error',
				'timeout',
				'internal-error',
			]),
			message: text,
		}),
	}),
	z.object({
		status: z.literal('unsupported'),
		reason: z.enum([
			'not-a-named-struct-or-interface',
			'direction-mismatch',
			'constraint-interface',
			'uninstantiated-generic',
			'excluded-by-build',
			'unsaved-module-config',
			'unsupported-build-config',
			'virtual-workspace',
		]),
	}),
	z.object({ status: z.literal('cancelled') }),
	z.object({ status: z.literal('stale') }),
]);

export const progressNotification = z.object({
	requestId: text,
	progress: z.object({
		phase: z.enum([
			'resolving-module',
			'loading-packages',
			'indexing',
			'querying',
			'filtering',
		]),
		completed: z.optional(integer),
		total: z.optional(integer),
	}),
});

const analyzeParams = z.object({
	requestId: text,
	source: z.object({ path: filePath, version: integer, position }),
	direction,
	snapshot: z.object({
		id: text,
		generation: integer,
		module: z.object({ goModPath: filePath, rootPath: filePath, modulePath: text }),
		build: z.object({
			key: text,
			goVersion: text,
			goos: text,
			goarch: text,
			cgoEnabled: z.boolean(),
			buildFlags: z.array(z.string()),
			goWorkPath: z.nullable(filePath),
		}),
	}),
	overlays: z.array(z.object({ path: filePath, version: integer, text: z.string() })),
});

export function toFilePath(uri: string): string {
	try {
		return fileURLToPath(uri);
	} catch {
		throw failure('protocol-error', 'The analyzer only accepts filesystem document URIs.');
	}
}

export function encodeAnalysis(input: AnalysisInput): z.infer<typeof analyzeParams> {
	const { module, build } = input.snapshot;
	const result = analyzeParams.safeParse({
		...input,
		source: { ...input.source, path: toFilePath(input.source.uri) },
		snapshot: {
			...input.snapshot,
			module: {
				goModPath: toFilePath(module.goModUri),
				rootPath: toFilePath(module.rootUri),
				modulePath: module.modulePath,
			},
			build: { ...build, goWorkPath: build.goWorkUri ? toFilePath(build.goWorkUri) : null },
		},
		overlays: input.overlays.map((overlay) => ({ ...overlay, path: toFilePath(overlay.uri) })),
	});
	if (!result.success) {
		throw failure('protocol-error', 'Invalid analysis input.');
	}
	const source = result.data.overlays.find((overlay) => overlay.path === result.data.source.path);
	if (!source || source.version !== input.source.version) {
		throw failure(
			'protocol-error',
			'The source document must match its captured overlay version.',
		);
	}
	const line = source.text.split(/\r\n|\r|\n/)[input.source.position.line];
	if (line === undefined || input.source.position.character > line.length) {
		throw failure('protocol-error', 'The source position is outside its captured document.');
	}
	return result.data;
}

export function decodeAnalysis(value: unknown, requestId: string): AnalysisResponse {
	// Successful results become valid only when the semantic analyzer and its decoder are implemented.
	// 只有语义分析器及其结果校验实现后，协议才接受成功结果
	const response = z.object({ requestId: z.literal(requestId), outcome: unsuccessfulOutcome });
	const result = response.safeParse(value);
	if (!result.success) {
		throw failure('protocol-error', 'Invalid or mismatched analyzer response.');
	}
	return result.data;
}
