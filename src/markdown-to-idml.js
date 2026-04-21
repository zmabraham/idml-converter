import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import * as xml2js from 'xml2js';

/**
 * Convert edited Markdown back to IDML format
 *
 * This reuses the original IDML structure and only updates text content,
 * preserving all formatting, layout, and styles.
 */
export class MarkdownToIDMLConverter {
  constructor(originalParser, options = {}) {
    this.parser = originalParser;
    this.options = {
      preserveAllFormatting: true,
      ...options
    };
  }

  /**
   * Convert Markdown back to IDML file
   */
  async convert(markdownContent, outputPath) {
    // Parse the markdown to extract updated text
    const parsedMarkdown = this.parseMarkdown(markdownContent);

    // Update the stories in the original IDML with new text
    await this.updateStories(parsedMarkdown);

    // Repackage the IDML
    await this.repackageIDML(outputPath);

    return outputPath;
  }

  /**
   * Parse Markdown content, extracting text and structure
   */
  parseMarkdown(markdown) {
    const lines = markdown.split('\n');
    const stories = [];
    let currentStory = null;
    let currentText = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip metadata header
      if (line.startsWith('<!-- IDML Metadata -->')) {
        continue;
      }
      if (line.trim().startsWith('<!--  stories:') || line.trim().startsWith('<!--  spreads:')) {
        continue;
      }
      if (line.trim() === '-->') {
        continue;
      }

      // Story header
      if (line.match(/<!-- Story: (.+?) -->/)) {
        if (currentStory) {
          currentStory.texts = currentText;
          stories.push(currentStory);
        }
        const match = line.match(/<!-- Story: (.+?) -->/);
        currentStory = { storyId: match[1], texts: [] };
        currentText = [];
        continue;
      }

      // Story section header (## Story N)
      if (line.match(/^##\s+Story\s+\d+/)) {
        continue;
      }

      // Horizontal rule - story separator
      if (line.trim() === '---') {
        continue;
      }

      // Style hint
      if (line.match(/<!-- style: (.+?) -->/)) {
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        if (currentText.length > 0) {
          currentText.push('');
        }
        continue;
      }

      // Actual text content
      currentText.push(line);
    }

    // Don't forget the last story
    if (currentStory) {
      currentStory.texts = currentText;
      stories.push(currentStory);
    }

    return { stories };
  }

  /**
   * Update story XML files with new text content
   */
  async updateStories(parsedMarkdown) {
    const storiesDir = path.join(this.parser.tempDir, 'Stories');

    for (const storyData of parsedMarkdown.stories) {
      const story = this.parser.stories.get(storyData.storyId);
      if (!story) {
        console.warn(`Story ${storyData.storyId} not found in original IDML`);
        continue;
      }

      const storyPath = path.join(storiesDir, story.filename);
      const xmlContent = await fs.readFile(storyPath, 'utf-8');

      // Update the XML content with new text
      const updatedXml = await this.updateStoryXML(xmlContent, storyData.texts);

      await fs.writeFile(storyPath, updatedXml, 'utf-8');
    }
  }

  /**
   * Update XML content of a story with new text
   */
  async updateStoryXML(xmlContent, newTexts) {
    const parser = new xml2js.Parser({ explicitArray: false });
    const xmlDoc = await parser.parseStringPromise(xmlContent);

    const root = xmlDoc['idPkg:Story'] || xmlDoc['XML-ELEMENT'];
    if (!root) return xmlContent;

    const storyElement = root.Story || root;
    if (!storyElement || !storyElement.ParagraphStyleRange) {
      return xmlContent;
    }

    const ranges = Array.isArray(storyElement.ParagraphStyleRange)
      ? storyElement.ParagraphStyleRange
      : [storyElement.ParagraphStyleRange];

    let textIndex = 0;
    const updatedRanges = [];

    for (const range of ranges) {
      const updatedRange = { ...range };

      if (range.CharacterStyleRange) {
        const charRanges = Array.isArray(range.CharacterStyleRange)
          ? range.CharacterStyleRange
          : [range.CharacterStyleRange];

        const updatedCharRanges = [];

        for (const charRange of charRanges) {
          if (textIndex < newTexts.length) {
            const newText = newTexts[textIndex];
            if (newText !== undefined) {
              updatedCharRanges.push({
                ...charRange,
                Content: { _: newText }
              });
            } else {
              updatedCharRanges.push(charRange);
            }
            textIndex++;
          } else {
            updatedCharRanges.push(charRange);
          }
        }

        updatedRange.CharacterStyleRange = updatedCharRanges;
      } else if (range.Content && textIndex < newTexts.length) {
        const newText = newTexts[textIndex];
        if (newText !== undefined) {
          updatedRange.Content = { _: newText };
        }
        textIndex++;
      }

      updatedRanges.push(updatedRange);
    }

    storyElement.ParagraphStyleRange = updatedRanges;

    // Build back XML
    const builder = new xml2js.Builder({
      renderOpts: { pretty: false },
      headless: true
    });

    return builder.buildObject(xmlDoc);
  }

  /**
   * Repackage the modified IDML files into a ZIP
   */
  async repackageIDML(outputPath) {
    const zip = new AdmZip();

    // Add all files from the temp directory
    await this.addFilesToZip(zip, this.parser.tempDir, '');

    // Write the ZIP file
    zip.writeZip(outputPath);
  }

  /**
   * Recursively add files to ZIP archive
   */
  async addFilesToZip(zip, dirPath, zipPath) {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await this.addFilesToZip(zip, fullPath, path.join(zipPath, file));
      } else {
        const content = await fs.readFile(fullPath);
        zip.addFile(path.join(zipPath, file), content);
      }
    }
  }
}

/**
 * Convenience function to convert Markdown to IDML
 */
export async function convertMarkdownToIDML(markdownContent, originalParser, outputPath, options) {
  const converter = new MarkdownToIDMLConverter(originalParser, options);
  return await converter.convert(markdownContent, outputPath);
}
