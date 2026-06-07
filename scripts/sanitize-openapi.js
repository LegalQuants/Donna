#!/usr/bin/env node
/**
 * Sanitizes an OpenAPI YAML file so it can be parsed by strict YAML 1.1 parsers.
 *
 * Problem: The lq-ai upstream spec uses backtick characters (` and ``) in plain
 * YAML scalars (unquoted string values). The backtick is a reserved indicator in
 * YAML 1.1 and causes js-yaml (used by openapi-typescript / redocly) to throw a
 * YamlParseError. Backticks inside block scalars (description: |) are fine.
 *
 * Fix: For any plain scalar that contains a backtick, wrap the entire value in
 * single quotes (escaping any single quotes within by doubling them).
 *
 * Usage: node scripts/sanitize-openapi.js <input.yaml> <output.yaml>
 */

import { readFileSync, writeFileSync } from 'fs';

const [, , input, output] = process.argv;
if (!input || !output) {
	console.error('Usage: node sanitize-openapi.js <input.yaml> <output.yaml>');
	process.exit(1);
}

const content = readFileSync(input, 'utf8');
const lines = content.split('\n');

let inBlockScalar = false;
let blockScalarIndent = -1;

const fixed = lines.map((line) => {
	const stripped = line.trimEnd();

	// Track block scalars (| or >) — content inside is literal, no parsing needed
	if (inBlockScalar) {
		if (stripped === '') return line; // blank lines allowed inside block
		const currentIndent = line.length - line.trimStart().length;
		if (currentIndent <= blockScalarIndent) {
			inBlockScalar = false;
			// fall through to check this line
		} else {
			return line; // inside block scalar, safe
		}
	}

	// Detect start of a block scalar
	// Matches: "key: |", "key: |2", "key: >", etc.
	if (/:\s*[|>][+-]?\s*$/.test(stripped)) {
		inBlockScalar = true;
		blockScalarIndent = line.length - line.trimStart().length;
		return line;
	}

	// If line has a backtick in what looks like a plain scalar value, quote it.
	// Pattern: <indent><key>: <value-with-backtick>
	// We only touch lines where the value is a plain scalar (not already quoted,
	// not a flow mapping, not a reference, not a number, not a boolean).
	if (!stripped.includes('`')) return line;

	// Match: optional indent + key + ': ' + plain scalar value
	const m = line.match(/^(\s*[\w'"${}[\].-]+[\w'"${}[\].,!@#%^&*()+=~|<>?/-]*\s*:\s+)(.+)$/);
	if (!m) return line;

	const prefix = m[1];
	const value = m[2];

	// Skip already-quoted values
	if (
		(value.startsWith("'") && value.endsWith("'")) ||
		(value.startsWith('"') && value.endsWith('"'))
	) {
		return line;
	}

	// Skip flow mappings, references, anchors, and other special YAML values
	if (
		value.startsWith('{') ||
		value.startsWith('[') ||
		value.startsWith('*') ||
		value.startsWith('&') ||
		value.startsWith('!')
	) {
		return line;
	}

	// If the value contains a backtick, wrap in single quotes
	if (value.includes('`')) {
		// Escape single quotes inside the value by doubling them
		const escaped = value.replace(/'/g, "''");
		return prefix + "'" + escaped + "'";
	}

	return line;
});

writeFileSync(output, fixed.join('\n'), 'utf8');
console.error(`Sanitized: ${input} -> ${output}`);
