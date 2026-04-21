# IDML ↔ Markdown Converter

A web application that converts Adobe InDesign IDML files to Markdown for text editing, and converts the edited Markdown back to IDML format while preserving all original formatting.

## Features

- **IDML to Markdown**: Extract text content from IDML files into editable Markdown
- **Markdown to IDML**: Round-trip conversion that preserves all formatting, styles, and layout
- **Style preservation**: Character and paragraph styles maintained
- **Web interface**: Simple drag-and-drop interface for file uploads
- **No InDesign required**: Edit text without opening InDesign

## How It Works

1. Upload an IDML file (InDesign Markup Language format - a ZIP archive of XML files)
2. The app extracts all text content and converts it to Markdown
3. Edit the text in the browser editor
4. Download the converted IDML file
5. Open in InDesign - all formatting is preserved with your text changes

## Installation

```bash
npm install
```

## Running

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The app will be available at http://localhost:3000

## API Endpoints

- `POST /api/idml-to-markdown` - Upload IDML and convert to Markdown
- `POST /api/markdown-to-idml` - Convert Markdown back to IDML
- `GET /api/health` - Health check

## Project Structure

```
idml-converter/
├── src/
│   ├── idml-parser.js       # Parse IDML ZIP and extract XML
│   ├── idml-to-markdown.js  # Convert IDML to Markdown
│   ├── markdown-to-idml.js  # Convert Markdown back to IDML
│   └── server.js            # Express web server
├── public/
│   └── index.html           # Web interface
├── package.json
└── README.md
```

## Technical Details

### IDML File Structure

IDML files are ZIP archives containing:
- `designmap.xml` - Main file referencing all other files
- `Stories/*.xml` - Text content with styling information
- `Spreads/*.xml` - Layout information
- `Resources/Styles.xml` - Style definitions
- `MasterPages/*.xml` - Master page templates

### Round-Trip Conversion

1. **Parse**: Extract and store the original IDML structure
2. **Convert to MD**: Extract text while preserving style references
3. **Edit**: User modifies text in Markdown format
4. **Convert back**: Apply text changes to original XML structure
5. **Repackage**: Create new IDML ZIP with updated content

## Limitations

- Text-only editing (layout, images, and formatting cannot be changed)
- Complex text flows may be simplified in Markdown view
- Some advanced InDesign features may not be editable

## Future Enhancements

- Support for tables and complex layouts
- Image preview and management
- Style editing capabilities
- Batch conversion
- Version comparison
