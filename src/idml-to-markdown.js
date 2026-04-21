import { parseIDML } from './idml-parser.js';

/**
 * Convert IDML file to Markdown format
 *
 * Format:
 * - Each story becomes a section
 * - Paragraph breaks preserved
 * - Style hints stored as HTML comments for round-trip
 * - Text frames marked with metadata
 */
export class IDMLToMarkdownConverter {
  constructor(options = {}) {
    this.options = {
      includeStyleHints: true,
      preserveStructure: true,
      ...options
    };
  }

  /**
   * Convert IDML file to Markdown string
   */
  async convert(idmlPath) {
    const { parser, result } = await parseIDML(idmlPath);

    const markdown = this.buildMarkdown(result);

    // Return both markdown and parser for potential re-use
    return {
      markdown,
      metadata: this.extractMetadata(result),
      parser // Keep parser for round-trip conversion
    };
  }

  /**
   * Build Markdown from parsed IDML content
   */
  buildMarkdown(result) {
    const lines = [];

    // Add header with metadata
    lines.push('<!-- IDML Metadata -->');
    lines.push('<!--');
    lines.push(`  stories: ${result.stories.size}`);
    lines.push(`  spreads: ${result.spreads.size}`);
    lines.push(`  styles: ${result.styles.size}`);
    lines.push('-->');
    lines.push('');

    // Process each story in order
    let storyNum = 0;
    for (const [storyId, story] of result.stories) {
      storyNum++;
      lines.push(`<!-- Story: ${storyId} -->`);
      lines.push(`## Story ${storyNum}`);
      lines.push('');

      // Process text frames within this story
      for (const textFrame of story.textFrames) {
        if (!Array.isArray(textFrame)) continue;

        for (const content of textFrame) {
          if (!content.text) continue;

          const text = content.text.trim();
          if (!text) continue;

          // Add style hint if enabled
          if (this.options.includeStyleHints) {
            const paraStyle = this.getStyleName(content.paragraphStyle, result.styles);
            if (paraStyle && paraStyle !== '[No Paragraph Style]') {
              lines.push(`<!-- style: ${paraStyle} -->`);
            }
          }

          // Add the text content
          lines.push(text);
          lines.push('');
        }
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Extract style name from style ID
   */
  getStyleName(styleId, styles) {
    if (!styleId) return '';

    const style = styles.get(styleId);
    return style ? style.name : styleId.split('/').pop() || styleId;
  }

  /**
   * Extract metadata for round-trip conversion
   */
  extractMetadata(result) {
    return {
      storyCount: result.stories.size,
      spreadCount: result.spreads.size,
      styleCount: result.styles.size,
      stories: Array.from(result.stories.entries()).map(([id, story]) => ({
        id,
        filename: story.filename,
        textFrameCount: story.textFrames.length
      }))
    };
  }
}

/**
 * Convenience function to convert IDML to Markdown
 */
export async function convertIDMLToMarkdown(idmlPath, options) {
  const converter = new IDMLToMarkdownConverter(options);
  return await converter.convert(idmlPath);
}
