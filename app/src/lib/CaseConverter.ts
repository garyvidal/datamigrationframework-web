export type NamingCase = 'snake' | 'camel' | 'pascal' | 'dash';

/** Maps the uppercase NamingCase from ProjectSettings to the lowercase form used by this module. */
function toLocalCase(nc: string): NamingCase {
    const map: Record<string, NamingCase> = {
        SNAKE: 'snake', CAMEL: 'camel', PASCAL: 'pascal', DASH: 'dash',
    };
    return map[nc] ?? 'snake';
}

/**
 * Convert a DB column name (assumed snake_case) to the target case defined by
 * the project's NamingCase setting (uppercase variant from projectService).
 */
export function convertCaseFromSetting(input: string, projectNamingCase: string): string {
    return convertCase(input, 'snake', toLocalCase(projectNamingCase));
}

/** Detect whether a string looks like camelCase or PascalCase (contains an uppercase letter after position 0). */
function looksLikeCamelOrPascal(input: string): boolean {
    return /[A-Z]/.test(input.slice(1));
}

function tokenize(input: string, from: NamingCase): string[] {
    let parts: string[];
    switch (from) {
        case 'snake': {
            // If the value contains no underscores but has uppercase letters, treat it as camel/pascal
            if (!input.includes('_') && looksLikeCamelOrPascal(input)) {
                parts = input.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);
            } else {
                parts = input.split('_');
            }
            break;
        }
        case 'dash':
            parts = input.split('-');
            break;
        case 'camel':
        case 'pascal':
            parts = input.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);
            break;
    }
    return parts.map(w => w.toLowerCase());
}

function format(words: string[], to: NamingCase): string {
    const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    switch (to) {
        case 'snake':  return words.join('_');
        case 'dash':   return words.join('-');
        case 'camel':  return words[0] + words.slice(1).map(capitalize).join('');
        case 'pascal': return words.map(capitalize).join('');
    }
}

export function convertCase(input: string, from: NamingCase, to: NamingCase): string {
    if (!input) return input;
    return format(tokenize(input, from), to);
}
