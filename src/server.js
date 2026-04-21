import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { IDMLToMarkdownConverter } from './idml-to-markdown.js';
import { MarkdownToIDMLConverter } from './markdown-to-idml.js';
import { IDMLParser } from './idml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.idml')) {
      cb(null, true);
    } else {
      cb(new Error('Only IDML files are allowed'));
    }
  }
});

// Store active conversion sessions
const sessions = new Map();

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Upload and convert IDML to Markdown
app.post('/api/idml-to-markdown', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save uploaded file temporarily
    const uploadDir = path.join(__dirname, '../uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const idmlPath = path.join(uploadDir, `upload_${Date.now()}.idml`);
    await fs.writeFile(idmlPath, req.file.buffer);

    // Convert IDML to Markdown
    const converter = new IDMLToMarkdownConverter();
    const { markdown, metadata, parser } = await converter.convert(idmlPath);

    // Store session for round-trip
    const sessionId = Date.now().toString();
    sessions.set(sessionId, {
      parser,
      idmlPath,
      createdAt: Date.now()
    });

    // Clean up old sessions (older than 1 hour)
    cleanupSessions();

    res.json({
      success: true,
      sessionId,
      markdown,
      metadata
    });

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Convert Markdown back to IDML
app.post('/api/markdown-to-idml', async (req, res) => {
  try {
    const { sessionId, markdown } = req.body;

    if (!sessionId || !markdown) {
      return res.status(400).json({ error: 'Missing sessionId or markdown' });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Convert Markdown to IDML
    const converter = new MarkdownToIDMLConverter(session.parser);
    const outputPath = path.join(__dirname, `../downloads/converted_${Date.now()}.idml`);
    await converter.convert(markdown, outputPath);

    // Read the file and send it
    const idmlBuffer = await fs.readFile(outputPath);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="converted_${Date.now()}.idml"`);
    res.send(idmlBuffer);

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

// Clean up old sessions
function cleanupSessions() {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > oneHour) {
      // Clean up parser temp files
      session.parser?.cleanup();
      sessions.delete(sessionId);
    }
  }
}

// Cleanup interval
setInterval(cleanupSessions, 15 * 60 * 1000); // Every 15 minutes

app.listen(PORT, () => {
  console.log(`IDML Converter server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to use the web interface`);
});

// Import fs for the server
import fs from 'fs/promises';
