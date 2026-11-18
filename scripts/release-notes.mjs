import { readFileSync } from 'node:fs';
import { marked } from 'marked';

const tag = process.argv[2];
const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
if (!tag || !tagPattern.test(tag)) {
	throw new Error('Release tag must use vMAJOR.MINOR.PATCH');
}

const version = tag.slice(1);
const headingPattern =
	/^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:\s+—\s+\d{4}-\d{2}-\d{2})?$/u;
const tokens = marked.lexer(readFileSync(0, 'utf8'));
const matches = [];

// Parse Markdown so headings inside code blocks cannot end a release section.
// 解析 Markdown，避免代码块中的标题截断版本说明
for (const [index, token] of tokens.entries()) {
	if (token.type !== 'heading' || token.depth !== 2) {
		continue;
	}
	const heading = headingPattern.exec(token.text);
	if (heading?.[1] === version) {
		matches.push(index);
	}
}

if (matches.length !== 1) {
	throw new Error(
		`CHANGELOG.md must contain exactly one ## ${version} section, with an optional — YYYY-MM-DD date`,
	);
}

const start = matches[0] + 1;
let end = tokens.length;
for (let index = start; index < tokens.length; index++) {
	if (tokens[index].type === 'heading' && tokens[index].depth === 2) {
		end = index;
		break;
	}
}

const section = tokens.slice(start, end);
const hasContent = section.some((token) => {
	if (['space', 'heading', 'hr', 'def'].includes(token.type)) {
		return false;
	}
	return token.raw.replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;
});
if (!hasContent) {
	throw new Error(`CHANGELOG.md section for ${version} must not be empty`);
}

const notes = section
	.map((token) => token.raw)
	.join('')
	.trim();
process.stdout.write(`${notes}\n`);
