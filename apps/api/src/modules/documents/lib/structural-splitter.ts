/**
 * Splits cleaned Vietnamese administrative document text into structural blocks.
 * Detects heading hierarchy: Roman numerals → Arabic numbers → sub-sections.
 */

export interface TextBlock {
  heading: string;
  breadcrumb: string[]; // ancestor headings from root → parent
  content: string;
  level: number; // 1=Roman, 2=single digit, 3=X.Y, 4=X.Y.Z
}

// Ordered from most-specific to least-specific to avoid false matches
const HEADING_PATTERNS: Array<{ level: number; regex: RegExp }> = [
  // Markdown H3: "### Heading"
  { level: 3, regex: /^###\s+\S.*$/ },
  // Markdown H2: "## Heading"
  { level: 2, regex: /^##\s+\S.*$/ },
  // Markdown H1: "# Heading"
  { level: 1, regex: /^#\s+\S.*$/ },
  // Numbered level 4: "1.1.1." or "1.2.3."
  { level: 4, regex: /^(\d{1,2}\.\d{1,2}\.\d{1,2}\.?\s+\S.*)$/ },
  // Numbered level 3: "1.1." or "2.3."
  { level: 3, regex: /^(\d{1,2}\.\d{1,2}\.?\s+\S.*)$/ },
  // Numbered level 2: "1." or "12." followed by uppercase/content
  { level: 2, regex: /^(\d{1,2}\.\s+[^\d].*)$/ },
  // Roman numerals "I." "II." "III." "IV." etc.
  {
    level: 1,
    regex: /^((?:XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)\.[ \t]+\S.*)$/,
  },
];

function detectLevel(line: string): number {
  for (const { level, regex } of HEADING_PATTERNS) {
    if (regex.test(line.trim())) return level;
  }
  return 0;
}

/** Strip markdown "# " / "## " / "### " prefix from a heading line */
function cleanHeading(line: string): string {
  return line.trim().replace(/^#{1,3}\s+/, '');
}

export function structuralSplit(text: string): TextBlock[] {
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];

  // Stack tracks the active heading at each level
  // stack[i] = { level, heading }
  const stack: Array<{ level: number; heading: string }> = [];

  let currentHeading = '';
  let currentLevel = 0;
  let contentLines: string[] = [];

  function flush() {
    const content = contentLines.join('\n').trim();
    contentLines = [];
    if (!content && !currentHeading) return;
    blocks.push({
      heading: currentHeading,
      breadcrumb: stack.map((s) => s.heading),
      content,
      level: currentLevel,
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const detectedLevel = detectLevel(trimmed);

    if (detectedLevel > 0) {
      // Flush what we have so far
      flush();

      // Update stack: pop everything at or deeper than this level
      while (stack.length > 0 && stack[stack.length - 1].level >= detectedLevel) {
        stack.pop();
      }

      // If there was a previous heading at a shallower level, push it onto stack
      if (currentHeading && currentLevel < detectedLevel) {
        stack.push({ level: currentLevel, heading: currentHeading });
      } else if (currentHeading && currentLevel >= detectedLevel) {
        // Same or deeper level — already popped above, nothing to push
      }

      currentHeading = cleanHeading(trimmed);
      currentLevel = detectedLevel;
    } else {
      contentLines.push(line);
    }
  }

  // Flush remaining
  flush();

  // If no headings were detected, return single block with full text
  const hasHeadings = blocks.some((b) => b.heading.length > 0);
  if (!hasHeadings) {
    return [{ heading: '', breadcrumb: [], content: text.trim(), level: 0 }];
  }

  // Filter out blocks that are essentially empty (very short content AND no heading)
  return blocks.filter((b) => b.heading.length > 0 || b.content.trim().length > 30);
}
