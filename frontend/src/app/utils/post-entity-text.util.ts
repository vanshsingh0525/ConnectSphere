export type PostEntityTextTokenType = 'text' | 'hashtag' | 'mention';

export interface PostEntityTextToken {
  type: PostEntityTextTokenType;
  value: string;
}

const ENTITY_PATTERN = /([#@][A-Za-z0-9_.]+)/g;

export function parsePostEntityText(text: string): PostEntityTextToken[] {
  if (!text) {
    return [];
  }

  const tokens: PostEntityTextToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(ENTITY_PATTERN)) {
    const raw = match[0] ?? '';
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      tokens.push({
        type: 'text',
        value: text.slice(lastIndex, matchIndex),
      });
    }

    tokens.push({
      type: raw.startsWith('@') ? 'mention' : 'hashtag',
      value: raw.slice(1),
    });

    lastIndex = matchIndex + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      value: text.slice(lastIndex),
    });
  }

  return tokens;
}
