function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function roundDown(value, step) {
  return Math.floor(value / step) * step;
}

function roundUp(value, step) {
  return Math.ceil(value / step) * step;
}

function generateSVG(timetable) {
  const width = 1400;
  const height = 800;

  const margin = {
    top: 50,
    right: 30,
    bottom: 30,
    left: 140
  };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Gather all stop times
  const allTimes = timetable.trains.flatMap(train => train.stops.map(stop => stop.time));

  if (allTimes.length === 0) {
    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="20" y="40" font-size="18" fill="#000">No timetable data available</text>
      </svg>
    `;
  }

  // Auto-fit time axis
  const rawStartTime = Math.min(...allTimes);
  const rawEndTime = Math.max(...allTimes);

  // Add some padding and round nicely
  const startTime = roundDown(rawStartTime - 5, 10);
  const endTime = roundUp(rawEndTime + 5, 10);

  const timeRange = endTime - startTime || 1;

  // Station positions
  const stationPositions = timetable.stations.map(s => s.position);
  const minPos = Math.min(...stationPositions);
  const maxPos = Math.max(...stationPositions);
  const posRange = maxPos - minPos || 1;

  const timeScale = t =>
    margin.left + ((t - startTime) / timeRange) * plotWidth;

  const stationScale = pos =>
    margin.top + ((pos - minPos) / posRange) * plotHeight;

  let elements = '';

  // Background
  elements += `
    <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
  `;

  // Plot border
  elements += `
    <rect
      x="${margin.left}"
      y="${margin.top}"
      width="${plotWidth}"
      height="${plotHeight}"
      fill="none"
      stroke="#333"
      stroke-width="1"
    />
  `;

  // Time grid and labels
  for (let t = startTime; t <= endTime; t += 5) {
    const x = timeScale(t);
    const isHour = t % 60 === 0;
    const isTenMinute = t % 10 === 0;

    elements += `
      <line
        x1="${x}"
        y1="${margin.top}"
        x2="${x}"
        y2="${margin.top + plotHeight}"
        stroke="${isHour ? '#999' : '#e6e6e6'}"
        stroke-width="${isHour ? 1.5 : 1}"
      />
    `;

    if (isTenMinute) {
      elements += `
        <text
          x="${x}"
          y="${margin.top - 12}"
          font-size="11"
          text-anchor="middle"
          fill="#333"
        >
          ${formatMinutes(t)}
        </text>
      `;
    }
  }

  // Station lines and labels
  timetable.stations.forEach(station => {
    const y = stationScale(station.position);

    elements += `
      <line
        x1="${margin.left}"
        y1="${y}"
        x2="${margin.left + plotWidth}"
        y2="${y}"
        stroke="#cccccc"
        stroke-width="1"
      />
    `;

    elements += `
      <text
        x="${margin.left - 10}"
        y="${y + 4}"
        font-size="12"
        text-anchor="end"
        fill="#000"
      >
        ${station.name}
      </text>
    `;
  });

  // Axis title
  elements += `
    <text
      x="${margin.left + plotWidth / 2}"
      y="20"
      font-size="16"
      text-anchor="middle"
      fill="#000"
    >
      Railway Timetable Diagram
    </text>
  `;

  // Train paths
  const colours = [
    '#005ea5',
    '#d4351c',
    '#00703c',
    '#6f42c1',
    '#f47738',
    '#111111'
  ];

  timetable.trains.forEach((train, index) => {
    const colour = colours[index % colours.length];

    let path = '';
    let firstPoint = null;

    train.stops.forEach((stop, i) => {
      const station = timetable.stations.find(s => s.id === stop.station);
      if (!station) return;

      const x = timeScale(stop.time);
      const y = stationScale(station.position);

      if (!firstPoint) {
        firstPoint = { x, y };
      }

      path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    if (path) {
      elements += `
        <path
          d="${path}"
          stroke="${colour}"
          fill="none"
          stroke-width="2"
        />
      `;
    }

    if (firstPoint) {
      elements += `
        <text
          x="${firstPoint.x + 6}"
          y="${firstPoint.y - 6}"
          font-size="11"
          fill="${colour}"
        >
          ${train.id}
        </text>
      `;
    }
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${elements}
    </svg>
  `;
}

module.exports = { generateSVG };