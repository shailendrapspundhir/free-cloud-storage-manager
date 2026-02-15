const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)");
  db.run("INSERT OR IGNORE INTO users VALUES ('admin', 'password')");
});

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) {
      res.json({ success: false, message: 'Error' });
    } else if (row) {
      res.json({ success: true, message: 'Logged in successfully' });
    } else {
      res.json({ success: false, message: 'Invalid credentials' });
    }
  });
});

app.listen(3000, () => {
  console.log('Backend running on port 3000');
});
