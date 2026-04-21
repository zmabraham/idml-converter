/**
 * Client-side IDML to Markdown converter
 * Runs entirely in the browser using JSZip
 */

class IDMLParser {
  constructor() {
    this.stories = new Map();
    this.spreads = [];
    this.styles = new Map();
    this.designmap = null;
  }

  async parse(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Parse designmap.xml
    const designmapFile = zip.file('designmap.xml');
    if (designmapFile) {
      const content = await designmapFile.async('string');
      this.designmap = await this.parseXML(content);
    }

    // Parse Stories
    const storyFiles = zip.file(/^Stories\/.*\.xml$/);
    for (const file of storyFiles) {
      const content = await file.async('string');
      const xml = await this.parseXML(content);
      const storySelf = xml['$']?.['Self'];
      if (storySelf) {
        this.stories.set(storySelf, xml);
      }
    }

    // Parse Spreads
    const spreadFiles = zip.file(/^Spreads\/.*\.xml$/);
    for (const file of spreadFiles) {
      const content = await file.async('string');
      const xml = await this.parseXML(content);
      this.spreads.push(xml);
    }

    // Parse Styles
    const stylesFile = zip.file('Resources/Styles.xml');
    if (stylesFile) {
      const content = await stylesFile.async('string');
      this.styles = await this.parseXML(content);
    }

    return {
      stories: this.stories,
      spreads: this.spreads,
      styles: this.styles,
      designmap: this.designmap
    };
  }

  async parseXML(content) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, 'text/xml');
    return this.xmlToObj(xmlDoc.documentElement);
  }

  xmlToObj(element) {
    const obj = {};

    // Handle attributes
    if (element.attributes) {
      for (const attr of element.attributes) {
        obj['$'] = obj['$'] || {};
        obj['$'][attr.name] = attr.value;
      }
    }

    // Handle child elements
    for (const child of element.children) {
      const tagName = child.tagName;
      if (!obj[tagName]) {
        obj[tagName] = [];
      }
      obj[tagName].push(this.xmlToObj(child));
    }

    // Handle text content
    if (element.textContent && element.children.length === 0) {
      return element.textContent;
    }

    // Simplify single-item arrays
    for (const key in obj) {
      if (Array.isArray(obj[key]) && obj[key].length === 1) {
        obj[key] = obj[key][0];
      }
    }

    return Object.keys(obj).length === 0 ? element.textContent : obj;
  }
}

class IDMLToMarkdownConverter {
  constructor() {
    this.parser = new IDMLParser();
  }

  async convert(arrayBuffer) {
    const result = await this.parser.parse(arrayBuffer);
    const markdown = this.buildMarkdown(result);

    return {
      markdown,
      metadata: {
        stories: result.stories.size,
        spreads: result.spreads.length,
        styles: Object.keys(result.styles).length
      },
      parser: result
    };
  }

  buildMarkdown(data) {
    let markdown = '';

    let storyIndex = 1;
    for (const [storySelf, story] of data.stories) {
      const storyName = story['$']?.['Self'] || `Story ${storyIndex}`;

      // Extract text from paragraph ranges
      const paragraphs = this.extractParagraphs(story);

      if (paragraphs.length > 0) {
        markdown += `# ${storyName}\n\n`;

        for (const para of paragraphs) {
          markdown += para.text + '\n\n';
        }
      }

      storyIndex++;
    }

    return markdown.trim();
  }

  extractParagraphs(story) {
    const paragraphs = [];

    const extractFromElement = (element) => {
      if (!element) return '';

      // Handle ParagraphStyleRange
      if (element.ParagraphStyleRange) {
        const ranges = Array.isArray(element.ParagraphStyleRange) ? element.ParagraphStyleRange : [element.ParagraphStyleRange];

        for (const range of ranges) {
          let text = '';
          const appliedStyle = range['$']?.['AppliedParagraphStyle'] || 'Normal';

          if (range.CharacterStyleRange) {
            const charRanges = Array.isArray(range.CharacterStyleRange) ? range.CharacterStyleRange : [range.CharacterStyleRange];

            for (const charRange of charRanges) {
              if (charRange.Content) {
                const contents = Array.isArray(charRange.Content) ? charRange.Content : [charRange.Content];
                for (const content of contents) {
                  if (typeof content === 'string') {
                    text += content;
                  } else if (content && content['_']) {
                    text += content['_'];
                  }
                }
              }
            }
          }

          if (text.trim()) {
            // Check if it's a heading (based on style name)
            if (appliedStyle.toLowerCase().includes('heading') || appliedStyle.toLowerCase().includes('title')) {
              paragraphs.push({ text: `## ${text.trim()}`, style: appliedStyle });
            } else {
              paragraphs.push({ text: text.trim(), style: appliedStyle });
            }
          }
        }
      }

      // HandleXMLElement recursively
      if (element.XMLLayer) {
        const layers = Array.isArray(element.XMLLayer) ? element.XMLLayer : [element.XMLLayer];
        for (const layer of layers) {
          if (layer.XMLStory) {
            const stories = Array.isArray(layer.XMLStory) ? layer.XMLStory : [layer.XMLStory];
            for (const s of stories) {
              extractFromElement(s);
            }
          }
        }
      }
    };

    extractFromElement(story);
    return paragraphs;
  }
}

class MarkdownToIDMLConverter {
  constructor(parsedData) {
    this.parsedData = parsedData;
  }

  async convert(markdown) {
    const lines = markdown.split('\n');
    let currentStoryIndex = 0;
    const storyUpdates = new Map();

    let currentStoryContent = [];
    const storySelfs = Array.from(this.parsedData.stories.keys());

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // New story/section
        if (currentStoryContent.length > 0 && currentStoryIndex < storySelfs.length) {
          storyUpdates.set(storySelfs[currentStoryIndex], currentStoryContent);
          currentStoryIndex++;
        }
        currentStoryContent = [];
      } else if (line.trim() && !line.startsWith('##')) {
        currentStoryContent.push(line.trim());
      }
    }

    // Add last story
    if (currentStoryContent.length > 0 && currentStoryIndex < storySelfs.length) {
      storyUpdates.set(storySelfs[currentStoryIndex], currentStoryContent);
    }

    return { storyUpdates };
  }

  objToXML(obj, tagName = 'root') {
    let xml = `<${tagName}`;

    // Add attributes
    if (obj['$']) {
      for (const [key, value] of Object.entries(obj['$'])) {
        xml += ` ${key}="${this.escapeXML(value)}"`;
      }
    }

    const hasChildren = Object.keys(obj).some(k => k !== '$');

    if (!hasChildren) {
      xml += '>';
      if (typeof obj === 'string') {
        xml += this.escapeXML(obj);
      }
      xml += `</${tagName}>`;
      return xml;
    }

    xml += '>';

    for (const [key, value] of Object.entries(obj)) {
      if (key === '$') continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          xml += this.objToXML(item, key);
        }
      } else if (typeof value === 'object') {
        xml += this.objToXML(value, key);
      } else {
        xml += `<${key}>${this.escapeXML(value)}</${key}>`;
      }
    }

    xml += `</${tagName}>`;
    return xml;
  }

  escapeXML(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// Export for use in HTML
window.IDMLConverter = {
  IDMLParser,
  IDMLToMarkdownConverter,
  MarkdownToIDMLConverter
};
