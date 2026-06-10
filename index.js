const express = require('express');
const fs = require('fs');
const path = require('path');

const { normaliseTimetable } = require('./src/core/normalise');
const { generateSVG } = require('./src/render/svg');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send(`
    <h1>Rail Diagram App</h1>
    <p>Try the diagram here:</p>
    <a href="/diagram">/diagram</a>
  `);
});

app.get('/diagram', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'timetable.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const timetable = normaliseTimetable(raw);
  const svg = generateSVG(timetable);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Diagram available at http://localhost:${PORT}/diagram`);
});
