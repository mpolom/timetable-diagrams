const { trimOrNull } = require('./scheduleStore');

function parseRailTime(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const halfMinute = raw.endsWith('H');
  const clean = halfMinute ? raw.slice(0, -1) : raw;

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

function buildRouteMap(routeConfig) {
  const map = new Map();

  for (const station of routeConfig.stations) {
    map.set(station.tiploc, station);
  }

  return map;
}

function dedupeConsecutiveStops(stops) {
  if (stops.length <= 1) return stops;

  const deduped = [stops[0]];

  for (let i = 1; i < stops.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const curr = stops[i];

    if (prev.station === curr.station) {
      // Keep the later timing if duplicated
      deduped[deduped.length - 1] = curr;
    } else {
      deduped.push(curr);
    }
  }

  return deduped;
}

function isMonotonicByRoutePosition(stops, routeStationsById) {
  if (stops.length < 2) return false;

  const positions = stops
    .map(stop => routeStationsById.get(stop.station)?.position)
    .filter(pos => typeof pos === 'number');

  if (positions.length < 2) return false;

  let nonDecreasing = true;
  let nonIncreasing = true;

  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] < positions[i - 1]) nonDecreasing = false;
    if (positions[i] > positions[i - 1]) nonIncreasing = false;
  }

  return nonDecreasing || nonIncreasing;
}

function inferStyle(schedule, stops) {
  const atoc = trimOrNull(schedule.atoc_code);
  const category = trimOrNull(schedule.schedule_segment?.CIF_train_category);
  const calls = stops.filter(stop => stop.kind === 'call').length;

  if (!atoc) return 'freight';
  if (calls <= 2) return 'express';
  if (category === 'XX') return 'normal';
  return 'normal';
}

function getTrainId(schedule) {
  const headcode = trimOrNull(schedule.schedule_segment?.signalling_id);
  if (headcode) return headcode;
  return trimOrNull(schedule.CIF_train_uid) || 'UNKNOWN';
}

function getTrainsForRoute({ store, routeConfig, serviceDate }) {
  const routeMap = buildRouteMap(routeConfig);
  const routeStationsById = new Map(
    routeConfig.stations.map(station => [station.id, station])
  );

  const schedules = store.getResolvedSchedulesForDate(serviceDate);
  const trains = [];

  for (const schedule of schedules) {
    const locations = schedule.schedule_segment?.schedule_location || [];
    if (!Array.isArray(locations) || locations.length === 0) continue;

    let stops = locations
      .filter(location => routeMap.has(location.tiploc_code))
      .map(location => {
        const routeStation = routeMap.get(location.tiploc_code);
        const time = chooseLocationTime(location);
        if (!routeStation || time == null) return null;

        return {
          station: routeStation.id,
          time,
          kind: location.pass ? 'pass' : 'call'
        };
      })
      .filter(Boolean);

    stops = dedupeConsecutiveStops(stops);

    if (stops.length < 2) continue;
    if (!isMonotonicByRoutePosition(stops, routeStationsById)) continue;

    trains.push({
      id: getTrainId(schedule),
      uid: trimOrNull(schedule.CIF_train_uid),
      operator: trimOrNull(schedule.atoc_code),
      stp: trimOrNull(schedule.CIF_stp_indicator),
      style: inferStyle(schedule, stops),
      stops
    });
  }

  return {
    stations: routeConfig.stations.map(station => ({
      id: station.id,
      name: station.name,
      position: station.position
    })),
    trains
  };
}

module.exports = {
  getTrainsForRoute,
  parseRailTime,
  chooseLocationTime
};
