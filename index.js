const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const csv = require('fast-csv');
const validator = require('validator');
const rateLimit = require('express-rate-limit');

const db = new Database(path.resolve(__dirname, 'emails.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const limiter = rateLimit({
    windowMs: 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 100 requests per windowMs
});

app.use(limiter);

app.post('/api/subscribe', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    try {
        const stmt = db.prepare('INSERT INTO emails (email, created_at) VALUES (?, ?)');
        stmt.run(email, new Date().toISOString());
        return res.status(200).json({ message: 'Subscribed successfully' });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Subscribed successfully' });
        }
        console.error('Error saving email:', error);
        return res.status(500).json({ error: 'Failed to save email' });
    }
});

app.post('/api/unsubscribe', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const stmt = db.prepare('DELETE FROM emails WHERE email = ?');
        const result = stmt.run(email);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Unsubscribed successfully' });
        }

        return res.status(200).json({ message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Error deleting email:', error);
        return res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

const authenticate = (req, res, next) => {
    const apiKey = req.query['API_KEY'];
    if (apiKey === process.env.API_KEY) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};


app.get('/api/emails', authenticate, (req, res) => {
    try {
        const stmt = db.prepare('SELECT email FROM emails');
        const emails = stmt.all();
        const filename = `emails_${new Date().toISOString().replace(/:/g, '-')}.csv`;
        res.setHeader('Content-disposition', 'attachment; filename=' + filename);
        res.setHeader('Content-type', 'text/csv');

        csv.write(emails, { headers: true }).pipe(res);
    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).send('Failed to fetch emails');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
