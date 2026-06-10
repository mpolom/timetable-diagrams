const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

function parseArgs(argv) {
  const args = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;

    const [key, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=');

    args[key] = value === '' ? true : value;
  }

  return args;
}

function openMaybeGzip(filePath) {
  const input = fs.createReadStream(filePath);
  return filePath.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
}

function normaliseName(value) {
  return (value || '').trim();
}

function buildStationRecord(tiploc, ref, index) {
  return {
    id: ref?.crs || tiploc,
    name: normaliseName(ref?.name || ref?.description || tiploc),
    tiploc,
    position: index * 10
  };
}

function dedupeStations(stations) {
  const seen = new Set();
  const result = [];

  for (const station of stations) {
    const key = `${station.id}|${station.name}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(station);
  }

  return result.map((station, index) => ({
    ...station,
    position: index * 10
  }));
}

function extractSubsequence(locations, startTiploc, endTiploc) {
  const startIndex = locations.findIndex(loc => loc.tiploc_code === startTiploc);
  const endIndex = locations.findIndex(loc => loc.tiploc_code === endTiploc);

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  if (startIndex <= endIndex) {
    return locations.slice(startIndex, endIndex + 1);
  }

  return [...locations.slice(endIndex, startIndex + 1)].reverse();
}

function looksLikeStation(ref) {
  return Boolean(ref?.crs);
}

async function buildRouteFromScheduleV2({
  scheduleFile,
  outputFile,
  routeId,
  routeName,
  startTiploc,
  endTiploc,
  stationOnly = false,
  trainId = null
}) {
  const tiplocMap = new Map();
  let selectedSchedule = null;

  const rl = readline.createInterface({
    input: openMaybeGzip(scheduleFile),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    // Capture TIPLOC reference data
    if (record.TiplocV1) {
      const t = record.TiplocV1;

      if (t.transaction_type === 'Create' || t.transaction_type === 'Update') {
        tiplocMap.set(t.tiploc_code, {
          tiploc: t.tiploc_code,
          crs: (t.crs_code || '').trim() || null,
          name: t.tps_description || t.description || t.tiploc_code,
          description: t.description || null
        });
      }

      continue;
    }

    // Find a schedule
    if (record.JsonScheduleV1) {
      const s = record.JsonScheduleV1;

      if (s.transaction_type !== 'Create') continue;

      const seg = s.schedule_segment;
      const locations = seg?.schedule_location;

      if (!seg || !Array.isArray(locations)) continue;

      const signallingId = seg.signalling_id || '';
      const uid = s.CIF_train_uid || '';

      if (trainId && trainId !== signallingId && trainId !== uid) {
        continue;
      }

      const subset = extractSubsequence(locations, startTiploc, endTiploc);
      if (!subset) continue;

      // Prefer a schedule with more points if no trainId supplied
      if (!selectedSchedule || subset.length > selectedSchedule.subset.length) {
        selectedSchedule = {
          source: s,
          subset
        };
      }

      if (trainId && selectedSchedule) {
        break;
      }
    }
  }

  if (!selectedSchedule) {
    throw new Error(
      `No schedule found containing ${startTiploc} and ${endTiploc}` +
      (trainId ? ` for train ${trainId}` : '')
    );
  }

  let stations = selectedSchedule.subset.map((loc, index) => {
    const ref = tiplocMap.get(loc.tiploc_code);

    return buildStationRecord(loc.tiploc_code, ref, index);
  });

  if (stationOnly) {
    stations = stations.filter(station => {
      const ref = tiplocMap.get(station.tiploc);
      return looksLikeStation(ref);
    });

    stations = dedupeStations(stations);
  }

  if (stations.length < 2) {
    throw new Error('Route did not contain at least two usable stations after filtering');
  }

  const route = {
    id: routeId,
    name: routeName,
    source: {
      startTiploc,
      endTiploc,
      trainId: trainId || null,
      selectedUid: selectedSchedule.source.CIF_train_uid || null,
      selectedHeadcode: selectedSchedule.source.schedule_segment?.signalling_id || null
    },
    stations
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(route, null, 2), 'utf8');

  console.log(`Route written to ${outputFile}`);
  console.log(`Stations: ${stations.length}`);
  console.log(
    `Selected schedule: ${
      selectedSchedule.source.schedule_segment?.signalling_id ||
      selectedSchedule.source.CIF_train_uid
    }`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const scheduleFile = args.schedule;
  const outputFile = args.output;
  const startTiploc = args.start;
  const endTiploc = args.end;

  if (!scheduleFile || !outputFile || !startTiploc || !endTiploc) {
    console.error(`
Usage:
  node src/tools/buildRouteFromSchedule.js \\
    --schedule=./data/networkrail/schedule.json.gz \\
    --output=./data/routes/geml-col-ips.json \\
    --routeId=geml-col-ips \\
    --routeName="GEML Colchester to Ipswich" \\
    --start=COLCHES \\
    --end=IPSWICH \\
    --stationOnly=true

Optional:
  --trainId=1A23
`);
    process.exit(1);
  }

  await buildRouteFromScheduleV2({
    scheduleFile,
    outputFile,
    routeId: args.routeId || 'generated-route',
    routeName: args.routeName || 'Generated Route',
    startTiploc,
    endTiploc,
    stationOnly: String(args.stationOnly).toLowerCase() === 'true',
    trainId: args.trainId || null
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

