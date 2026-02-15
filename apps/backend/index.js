const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

// JWT secret for auth (use env var in production)
const SECRET = 'free-storage-secret-key-change-in-prod';

// Enable CORS to allow requests from the Next.js frontend (running on localhost:3001)
// This fixes cross-origin issues for the login screen and file uploads
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE');
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }
  next();
});

// Middleware to authenticate JWT token for protected routes
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  jwt.verify(token, SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = user; // { username }
    next();
  });
}

// Multer setup for provider-specific "buckets" (folders under ./uploads/)
// Simulates multi-storage (local/, s3/, gdrive/ etc.) - files routed by active provider from frontend
// Creates folders as buckets for organization; metadata in SQLite
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get provider from formData (e.g., 'local', 's3', 'gdrive')
    const provider = req.body.provider || 'local';
    const dir = `./uploads/${provider}`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Unique filename to avoid collisions: timestamp + random + ext
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// DB setup: users + files table for metadata (per user)
const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  // Users table
  db.run("CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)");
  db.run("INSERT OR IGNORE INTO users VALUES ('admin', 'password')");

  // Files table: store metadata for uploaded files (linked to user + provider/bucket)
  // Allows filtering by current provider (e.g., files in uploads/local/, uploads/s3/ etc.)
  // Provider simulates buckets/folders for multi-storage
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      provider TEXT DEFAULT 'local',  -- storage provider/bucket (local, s3, gdrive)
      filename TEXT,      -- stored name (unique)
      originalname TEXT,  -- original upload name
      path TEXT,          -- full path on disk
      size INTEGER,       -- file size in bytes
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Migration for existing DBs: add provider column if not exists (ignore error if already there)
  db.run("ALTER TABLE files ADD COLUMN provider TEXT DEFAULT 'local'", (err) => {
    // Silent fail if column exists (SQLite limitation)
  });

  // Create provider-specific folders/buckets upfront (local, s3, gdrive etc.)
  // Files routed here based on active provider for simulation
  ['local', 's3', 'gdrive'].forEach((prov) => {
    const dir = `./uploads/${prov}`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

app.use(express.json());

// Public: root
app.get('/', (req, res) => {
  res.json({ message: 'Free Storage Manager API - Login to upload files!' });
});

// Auth: login (returns JWT token)
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) {
      res.json({ success: false, message: 'Error' });
    } else if (row) {
      // Issue JWT token for subsequent requests (e.g., uploads tied to user)
      const token = jwt.sign({ username: row.username }, SECRET, { expiresIn: '1h' });
      res.json({ success: true, message: 'Logged in successfully', token });
    } else {
      res.json({ success: false, message: 'Invalid credentials' });
    }
  });
});

// Protected: upload single file (photo, doc, etc.) - file saved to ./uploads/, metadata in DB
// Supports provider from frontend (mock: local/S3/etc; files always local for now)
app.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const { username } = req.user;
  const provider = req.body.provider || 'local'; // From formData , extensible for multi-provider
  console.log(`Upload via provider: ${provider} for user: ${username}`);
  // Insert file metadata linked to user + provider/bucket
  // path will point to provider folder (e.g., uploads/s3/...)
  db.run(
    'INSERT INTO files (username, provider, filename, originalname, path, size) VALUES (?, ?, ?, ?, ?, ?)',
    [username, provider, req.file.filename, req.file.originalname, req.file.path, req.file.size],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json({
        success: true,
        message: 'File uploaded successfully',
        file: { id: this.lastID, ...req.file, username, provider }
      });
    }
  );
});

// Protected: list user's uploaded files , filtered by current provider/bucket
// e.g., ?provider=local shows files from uploads/local/ folder
// Simulates bucket-specific listing for multi-provider storage
app.get('/files', authenticateToken, (req, res) => {
  const { username } = req.user;
  const provider = req.query.provider || 'local'; // From frontend active provider
  db.all(
    'SELECT * FROM files WHERE username = ? AND provider = ? ORDER BY upload_date DESC',
    [username, provider],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Error fetching files' });
      }
      res.json({ success: true, files: rows, provider });
    }
  );
});

// Protected: download file by ID (triggers browser download)
app.get('/files/:id/download', authenticateToken, (req, res) => {
  const { username } = req.user;
  db.get(
    'SELECT * FROM files WHERE id = ? AND username = ?',
    [req.params.id, username],
    (err, file) => {
      if (err || !file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }
      // Send file for download with original name
      res.download(file.path, file.originalname);
    }
  );
});

// Protected: view file by ID (e.g., display images inline in browser)
app.get('/files/:id/view', authenticateToken, (req, res) => {
  const { username } = req.user;
  db.get(
    'SELECT * FROM files WHERE id = ? AND username = ?',
    [req.params.id, username],
    (err, file) => {
      if (err || !file) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }
      // Serve file directly (for images/photos preview)
      res.sendFile(path.resolve(file.path));
    }
  );
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
