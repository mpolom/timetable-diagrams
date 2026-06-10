const express = require('express');
const fs = require('fs');

const { normaliseTimetable } = require('./src/core/normalise');
const { generateSVG } = require('./src/render/svg');

const app = express();

app.get('/diagram', (req, res) => {
  const raw = JSON.parse(fs.readFileSync('./data/timetable.json'));

  const timetable = normaliseTimetable(raw);
  const svg = generateSVG(timetable);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000/diagram');
});