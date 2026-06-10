const express = require('express');
const fs = require('fs');
const path = require('path');

const { generateSVG } = require('./src/render/svg');
const { loadSchedulesForRoute } = require('./src/adapters/networkRailSchedule');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send(`
    <h1>Rail Diagram App</h1>
    <p>Try:</p>
    <ul>
      <li><a href="/diagram?date=2026-06-10">/diagram?date=2026-06-10</a></li>
    </ul>
  `);
});

app.get('/diagram', async (req, res) => {
  try {
    const serviceDate = req.query.date || new Date().toISOString().slice(0, 10);

    const routeConfig = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'data', 'routes', 'geml-col-ipswich.json'),
        'utf8'
      )
    );

    const timetable = await loadSchedulesForRoute({
      scheduleFile: path.join(__dirname, 'data', 'networkrail', 'schedule.json.gz'),
      routeConfig,
      serviceDate
    });

    const svg = generateSVG(timetable);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <h1>Error generating diagram</h1>
      <pre>${error.message}</pre>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});