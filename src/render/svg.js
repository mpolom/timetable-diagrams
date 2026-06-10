function generateSVG(timetable) {
  const width = 1200;
  const height = 600;

  const timeScale = t => (t - 480) * 2; // start around 08:00
  const stationScale = pos => pos * 10 + 50;

  let paths = '';
  let stationLines = '';
  let labels = '';

  // Draw station horizontal lines
  timetable.stations.forEach(station => {
    const y = stationScale(station.position);

    stationLines += `
      <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#ddd"/>
    `;

    labels += `
      <text x="5" y="${y - 5}" font-size="12">${station.name}</text>
    `;
  });

  // Draw trains
  timetable.trains.forEach(train => {
    let path = '';

    train.stops.forEach((stop, i) => {
      const station = timetable.stations.find(s => s.id === stop.station);

      const x = timeScale(stop.time);
      const y = stationScale(station.position);

      path += i === 0
        ? `M ${x} ${y}`
        : ` L ${x} ${y}`;
    });

    paths += `
      <path d="${path}" stroke="blue" fill="none" stroke-width="2"/>
    `;
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${stationLines}
      ${labels}
      ${paths}
    </svg>
  `;
}

module.exports = { generateSVG };