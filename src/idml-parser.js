import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { promisify } from 'util';
import * as xml2js from 'xml2js';

const unzip = promisify(zlib.unzip);

/**
 * IDML Parser - Extracts and parses IDML (InDesign Markup Language) files
 * IDML files are ZIP archives containing XML files
 */
export class IDMLParser {
  constructor(idmlPath) {
    this.idmlPath = idmlPath;
    this.tempDir = null;
    this.spreads = new Map();
    this.stories = new Map();
    this.styles = new Map();
    this.designMap = null;
  }

  /**
   * Extract IDML ZIP file to temporary directory
   */
  async extract() {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(this.idmlPath);

    this.tempDir = path.join(path.dirname(this.idmlPath), `.${path.basename(this.idmlPath)}_extracted`);
    await fs.mkdir(this.tempDir, { recursive: true });

    zip.extractAllTo(this.tempDir, true);

    return this.tempDir;
  }

  /**
   * Parse the designmap.xml - main file that references all other files
   */
  async parseDesignMap() {
    const designMapPath = path.join(this.tempDir, 'designmap.xml');
    const xmlContent = await fs.readFile(designMapPath, 'utf-8');

    const parser = new xml2js.Parser({ explicitArray: false });
    this.designMap = await parser.parseStringPromise(xmlContent);

    return this.designMap;
  }

  /**
   * Parse all story files ( Stories/ folder) - contains text content
   */
  async parseStories() {
    const storiesDir = path.join(this.tempDir, 'Stories');

    try {
      const files = await fs.readdir(storiesDir);

      for (const file of files) {
        if (!file.endsWith('.xml')) continue;

        const filePath = path.join(storiesDir, file);
        const xmlContent = await fs.readFile(filePath, 'utf-8');

        const parser = new xml2js.Parser({ explicitArray: false });
        const story = await parser.parseStringPromise(xmlContent);

        // Extract the story self URI for reference
        const storySelf = story?.['XML-ELEMENT']?.Self?.$?.src || file;

        this.stories.set(storySelf, {
          id: storySelf,
          filename: file,
          content: story,
          textFrames: this.extractTextFrames(story)
        });
      }
    } catch (error) {
      console.warn('No Stories folder or error parsing stories:', error.message);
    }

    return this.stories;
  }

  /**
   * Extract text frames and their content from a story
   */
  extractTextFrames(story) {
    const textFrames = [];
    const root = story['idPkg:Story'] || story['XML-ELEMENT'];

    if (!root) return textFrames;

    // Navigate through XML to find Story/Story elements
    const storyElement = root.Story || root;

    if (storyElement && storyElement.ParagraphStyleRange) {
      const ranges = this.ensureArray(storyElement.ParagraphStyleRange);

      for (const range of ranges) {
        const textFrame = this.extractTextFromRange(range);
        if (textFrame) textFrames.push(textFrame);
      }
    }

    return textFrames;
  }

  /**
   * Extract text content from a ParagraphStyleRange
   */
  extractTextFromRange(range) {
    const contents = [];

    if (range.CharacterStyleRange) {
      const charRanges = this.ensureArray(range.CharacterStyleRange);
      for (const charRange of charRanges) {
        if (charRange.Content) {
          const text = typeof charRange.Content === 'string'
            ? charRange.Content
            : charRange.Content._ || '';
          contents.push({
            text: text,
            appliedCharacterStyle: charRange.$?.AppliedCharacterStyle || '',
            appliedParagraphStyle: range.$?.AppliedParagraphStyle || ''
          });
        }
      }
    } else if (range.Content) {
      const text = typeof range.Content === 'string'
        ? range.Content
        : range.Content._ || '';
      contents.push({
        text: text,
        appliedParagraphStyle: range.$?.AppliedParagraphStyle || 'ParagraphStyle/$ID/[No Paragraph Style]'
      });
    }

    return contents.length > 0 ? contents : null;
  }

  /**
   * Parse spread files ( Spreads/ folder) - contains layout info
   */
  async parseSpreads() {
    const spreadsDir = path.join(this.tempDir, 'Spreads');

    try {
      const files = await fs.readdir(spreadsDir);

      for (const file of files) {
        if (!file.endsWith('.xml')) continue;

        const filePath = path.join(spreadsDir, file);
        const xmlContent = await fs.readFile(filePath, 'utf-8');

        const parser = new xml2js.Parser({ explicitArray: false });
        const spread = await parser.parseStringPromise(xmlContent);

        this.spreads.set(file, {
          filename: file,
          content: spread
        });
      }
    } catch (error) {
      console.warn('No Spreads folder or error parsing spreads:', error.message);
    }

    return this.spreads;
  }

  /**
   * Parse style definitions from Resources/Styles.xml
   */
  async parseStyles() {
    const stylesPath = path.join(this.tempDir, 'Resources', 'Styles.xml');

    try {
      const xmlContent = await fs.readFile(stylesPath, 'utf-8');

      const parser = new xml2js.Parser({ explicitArray: false });
      const stylesRoot = await parser.parseStringPromise(xmlContent);

      // Extract paragraph styles
      if (stylesRoot?.['idPkg:Styles']?.RootCharacterStyleGroup) {
        const charStyles = this.ensureArray(stylesRoot['idPkg:Styles'].RootCharacterStyleGroup.CharacterStyle);
        for (const style of charStyles) {
          if (style?.$) {
            this.styles.set(style.$.Self, {
              type: 'character',
              name: style.$.Name,
              self: style.$.Self
            });
          }
        }
      }

      if (stylesRoot?.['idPkg:Styles']?.RootParagraphStyleGroup) {
        const paraStyles = this.ensureArray(stylesRoot['idPkg:Styles'].RootParagraphStyleGroup.ParagraphStyle);
        for (const style of paraStyles) {
          if (style?.$) {
            this.styles.set(style.$.Self, {
              type: 'paragraph',
              name: style.$.Name,
              self: style.$.Self
            });
          }
        }
      }
    } catch (error) {
      console.warn('No Styles.xml or error parsing styles:', error.message);
    }

    return this.styles;
  }

  /**
   * Get all text content from the IDML file
   */
  async getAllText() {
    if (this.stories.size === 0) {
      await this.parseStories();
    }

    const allText = [];

    for (const [storyId, story] of this.stories) {
      for (const textFrame of story.textFrames) {
        if (Array.isArray(textFrame)) {
          for (const content of textFrame) {
            if (content.text && content.text.trim()) {
              allText.push({
                storyId,
                text: content.text,
                paragraphStyle: content.appliedParagraphStyle,
                characterStyle: content.appliedCharacterStyle
              });
            }
          }
        }
      }
    }

    return allText;
  }

  /**
   * Clean up temporary extracted files
   */
  async cleanup() {
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Utility: Ensure value is an array
   */
  ensureArray(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Main parsing method - extracts all components
   */
  async parse() {
    await this.extract();
    await this.parseDesignMap();
    await this.parseStories();
    await this.parseSpreads();
    await this.parseStyles();

    return {
      designMap: this.designMap,
      stories: this.stories,
      spreads: this.spreads,
      styles: this.styles,
      allText: await this.getAllText()
    };
  }
}

/**
 * Convenience function to parse an IDML file
 */
export async function parseIDML(idmlPath) {
  const parser = new IDMLParser(idmlPath);
  const result = await parser.parse();
  return { parser, result };
}
