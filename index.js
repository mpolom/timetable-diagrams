const express = require('express');
const fs = require('fs');
const path = require('path');

const { generateSVG } = require('./src/render/svg');
const { ScheduleStore } = require('./src/adapters/scheduleStore');
const { getTrainsForRoute } = require('./src/adapters/routeExtractor');

const app = express();
const PORT = 3000;

const store = new ScheduleStore();
let isReady = false;
let startupError = null;

async function bootstrap() {
  try {
    const fullFile = path.join(__dirname, 'data', 'networkrail', 'schedule-full.json.gz');

    console.log('Loading full schedule file...');
    const fullCounts = await store.loadFile(fullFile);
    console.log('Loaded full file:', fullCounts);

    const updatesDir = path.join(__dirname, 'data', 'networkrail', 'updates');

    if (fs.existsSync(updatesDir)) {
      const updateFiles = fs.readdirSync(updatesDir)
        .filter(file => file.endsWith('.json') || file.endsWith('.json.gz'))
        .sort();

      for (const file of updateFiles) {
        const filePath = path.join(updatesDir, file);
        console.log(`Applying update: ${file}`);
        const counts = await store.loadFile(filePath);
        console.log(`Applied update ${file}:`, counts);
      }
    }

    isReady = true;
    console.log('Schedule store ready');
    console.log(store.getSummary());
  } catch (error) {
    startupError = error;
    console.error('Startup failed:', error);
  }
}

function buildTimetable(routeId, serviceDate) {
  const routePath = path.join(__dirname, 'data', 'routes', `${routeId}.json`);
  const routeConfig = JSON.parse(fs.readFileSync(routePath, 'utf8'));

  return getTrainsForRoute({
    store,
    routeConfig,
    serviceDate
  });
}

app.get('/', (req, res) => {
  res.send(`
    <h1>Rail Diagram App</h1>
    <ul>
      <li><a href="/diagram?route=geml-col-ips&date=2026-06-10">Diagram page</a></li>
      <li><a href="/health">Health</a></li>
    </ul>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    isReady,
    startupError: startupError ? startupError.message : null,
    summary: store.getSummary()
  });
});

app.get('/diagram', (req, res) => {
  const routeId = req.query.route || 'geml-col-ips';
  const serviceDate = req.query.date || new Date().toISOString().slice(0, 10);

  const pageTitle = `Timetable Diagram: ${routeId} (${serviceDate})`;
  const svgUrl = `/diagram.svg?route=${encodeURIComponent(routeId)}&date=${encodeURIComponent(serviceDate)}`;

  res.send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${pageTitle}</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f5f7fa;
            color: #1f2937;
          }

          .page {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
          }

          .page-title {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 700;
          }

          .page-subtitle {
            margin: 0 0 24px 0;
            color: #4b5563;
            font-size: 14px;
          }

          .diagram-card {
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          }

          .diagram-frame {
            width: 100%;
            overflow-x: auto;
          }

          .diagram-frame img {
            display: block;
            min-width:1200px;
            height: auto;
          }

          .meta {
            margin-top: 12px;
            font-size: 13px;
            color: #6b7280;
          }

          .error {
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #991b1b;
            border-radius: 8px;
            padding: 12px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <h1 class="page-title">${pageTitle}</h1>
          <p class="page-subtitle">
            Route: <strong>${routeId}</strong> · Date: <strong>${serviceDate}</strong>
          </p>

          ${
            !isReady
              ? `
                <div class="error">
                  Schedule store not ready.<br />
                  ${startupError ? startupError.message : 'Still loading timetable data...'}
                </div>
              `
              : `
                <div class="diagram-card">
                  <div class="diagram-frame">
                    <img src="${svgUrl}" alt="${pageTitle}" />
                  </div>
                </div>
              `
          }
        </div>
      </body>
    </html>
  `);
});

app.get('/diagram.svg', (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="120">
          <text x="20" y="40" font-size="20">Schedule store not ready</text>
          <text x="20" y="70" font-size="14">
            ${startupError ? startupError.message : 'Still loading timetable data...'}
          </text>
        </svg>
      `);
    }

    const routeId = req.query.route || 'geml-col-ips';
    const serviceDate = req.query.date || new Date().toISOString().slice(0, 10);

    const timetable = buildTimetable(routeId, serviceDate);
    const svg = generateSVG(timetable);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="120">
        <text x="20" y="40" font-size="20">Error generating diagram</text>
        <text x="20" y="70" font-size="14">${error.message}</text>
      </svg>
    `);
  }
});

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  await bootstrap();
});
