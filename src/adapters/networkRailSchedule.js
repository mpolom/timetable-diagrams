const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

function parseRailTime(value) {
  if (!value) return null;

  const halfMinute = value.endsWith('H');
  const clean = halfMinute ? value.slice(0, -1) : value;

  if (!/^\d{4}$/.test(clean)) return null;

  const hours = Number(clean.slice(0, 2));
  const minutes = Number(clean.slice(2, 4));

  return (hours * 60) + minutes + (halfMinute ? 0.5 : 0);
}

function chooseLocationTime(location) {
  return (
    parseRailTime(location.public_departure) ??
    parseRailTime(location.public_arrival) ??
    parseRailTime(location.departure) ??
    parseRailTime(location.arrival) ??
    parseRailTime(location.pass)
  );
}

function runsOnDate(schedule, serviceDate) {
  const date = new Date(serviceDate);
  const start = new Date(schedule.schedule_start_date);
  const end = new Date(schedule.schedule_end_date);

  if (date < start || date > end) return false;

  const jsDay = date.getDay(); // Sun = 0 ... Sat = 6
  const index = jsDay === 0 ? 6 : jsDay - 1; // Mon = 0 ... Sun = 6
  const days = schedule.schedule_days_runs || '0000000';

  return days[index] === '1';
}

function buildRouteMap(routeConfig) {
  const map = new Map();

  for (const station of routeConfig.stations) {
    map.set(station.tiploc, station);
  }

  return map;
}

function inferStyle(schedule) {
  const atoc = schedule.atoc_code || '';

  if (!atoc) return 'freight';
  return 'normal';
}

async function loadSchedulesForRoute({
  scheduleFile,
  routeConfig,
  serviceDate
}) {
  const routeMap = buildRouteMap(routeConfig);
  const results = [];

  const input = fs.createReadStream(scheduleFile);
  const stream = scheduleFile.endsWith('.gz')
    ? input.pipe(zlib.createGunzip())
    : input;

  const rl = readline.createInterface({
    input: stream,
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

    const schedule = record.JsonScheduleV1;
    if (!schedule) continue;

    if (schedule.transaction_type !== 'Create') continue;
    if (schedule.CIF_stp_indicator === 'C') continue;
    if (!runsOnDate(schedule, serviceDate)) continue;

    const locations = schedule.schedule_segment?.schedule_location || [];

    const stops = locations
      .filter(location => routeMap.has(location.tiploc_code))
      .map(location => {
        const routeStation = routeMap.get(location.tiploc_code);
        const time = chooseLocationTime(location);

        if (time == null) return null;

        return {
          station: routeStation.id,
          time,
          kind: location.pass ? 'pass' : 'call'
        };
      })
      .filter(Boolean);

    if (stops.length < 2) continue;

    const trainId =
      schedule.schedule_segment?.signalling_id ||
      schedule.CIF_train_uid;

    results.push({
      id: trainId,
      style: inferStyle(schedule),
      operator: schedule.atoc_code || null,
      uid: schedule.CIF_train_uid,
      stp: schedule.CIF_stp_indicator,
      stops
    });
  }

  return {
    stations: routeConfig.stations.map(station => ({
      id: station.id,
      name: station.name,
      position: station.position
    })),
    trains: results
  };
}

module.exports = {
  loadSchedulesForRoute
};