# IDML Converter - Quick Start Guide

## Installation & Setup

```bash
cd /workspace/group/idml-converter
npm install
```

## Running the Application

```bash
# Start the server
npm start

# Or run in development mode (auto-reload on changes)
npm run dev
```

Visit http://localhost:3000

## Testing

### Without an IDML File

If you don't have an IDML file handy, you can create a simple test:

1. Open Adobe InDesign
2. Create a new document with some text
3. File → Export → Choose IDML format
4. Upload the file to the web app

### Testing Round-Trip

1. Upload an IDML file
2. The Markdown will appear in the editor
3. Make a text change (e.g., fix a typo, add a word)
4. Click "Download Converted IDML"
5. Open the downloaded file in InDesign
6. Verify: The text change is there, formatting is unchanged

## Project Files

| File | Purpose |
|------|---------|
| `src/idml-parser.js` | Extracts XML content from IDML ZIP archive |
| `src/idml-to-markdown.js` | Converts parsed IDML to Markdown |
| `src/markdown-to-idml.js` | Converts edited Markdown back to IDML |
| `src/server.js` | Express server handling uploads/downloads |
| `public/index.html` | Web interface with drag-and-drop upload |

## API Usage

### Convert IDML to Markdown

```bash
curl -X POST http://localhost:3000/api/idml-to-markdown \
  -F "file=@example.idml"
```

Response:
```json
{
  "success": true,
  "sessionId": "1234567890",
  "markdown": "# Story 1\n\nYour text here...",
  "metadata": {
    "stories": 5,
    "spreads": 2,
    "styles": 15
  }
}
```

### Convert Markdown to IDML

```bash
curl -X POST http://localhost:3000/api/markdown-to-idml \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "1234567890",
    "markdown": "# Story 1\n\nUpdated text here..."
  }' \
  --output converted.idml
```

## Troubleshooting

### Server won't start
- Check port 3000 is not in use: `lsof -i :3000`
- Check dependencies installed: `ls node_modules`

### Upload fails
- Ensure file is .idml format (ZIP archive)
- Check file size < 50MB

### Conversion errors
- Check browser console for JavaScript errors
- Check server terminal for error messages
