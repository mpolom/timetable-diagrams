const { parseTimeToMinutes } = require('../utils/time');

function normaliseTimetable(raw) {
  return {
    stations: raw.stations,
    trains: raw.trains.map(train => ({
      id: train.id,
      stops: train.stops.map(stop => ({
        station: stop.station,
        time: parseTimeToMinutes(stop.time)
      }))
    }))
  };
}

module.exports = { normaliseTimetable };