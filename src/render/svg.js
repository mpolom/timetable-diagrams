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

function getTrainStyle(train, defaultColour) {
  const baseColour = train.colour || defaultColour;

  switch (train.style) {
    case 'express':
      return {
        stroke: baseColour,
        strokeWidth: 2,
        dashArray: '8,4',
        opacity: 1
      };

    case 'freight':
      return {
        stroke: train.colour || '#444444',
        strokeWidth: 3,
        dashArray: '2,2',
        opacity: 0.95
      };

    case 'empty':
      return {
        stroke: train.colour || '#666666',
        strokeWidth: 2,
        dashArray: '6,3',
        opacity: 0.7
      };

    case 'reference':
      return {
        stroke: train.colour || '#999999',
        strokeWidth: 1.5,
        dashArray: 'none',
        opacity: 0.5
      };

    case 'normal':
    default:
      return {
        stroke: baseColour,
        strokeWidth: 2,
        dashArray: 'none',
        opacity: 1
      };
  }
}

function renderLegend(x, y) {
  const legendItems = [
    {
      label: 'Normal',
      style: { stroke: '#005ea5', strokeWidth: 2, dashArray: 'none', opacity: 1 }
    },
    {
      label: 'Express',
      style: { stroke: '#d4351c', strokeWidth: 2, dashArray: '8,4', opacity: 1 }
    },
    {
      label: 'Freight',
      style: { stroke: '#444444', strokeWidth: 3, dashArray: '2,2', opacity: 0.95 }
    },
    {
      label: 'Empty stock',
      style: { stroke: '#666666', strokeWidth: 2, dashArray: '6,3', opacity: 0.7 }
    },
    {
      label: 'Reference',
      style: { stroke: '#999999', strokeWidth: 1.5, dashArray: 'none', opacity: 0.5 }
    }
  ];

  const rowHeight = 24;
  const padding = 12;
  const width = 180;
  const height = padding * 2 + 24 + legendItems.length * rowHeight;

  let content = `
    <rect
      x="${x}"
      y="${y}"
      width="${width}"
      height="${height}"
      fill="white"
      stroke="#999"
      stroke-width="1"
      rx="6"
      ry="6"
    />
    <text
      x="${x + padding}"
      y="${y + 18}"
      font-size="12"
      font-weight="600"
      fill="#000"
    >
      Legend
    </text>
  `;

  legendItems.forEach((item, index) => {
    const rowY = y + 32 + index * rowHeight;

    content += `
      <line
        x1="${x + padding}"
        y1="${rowY}"
        x2="${x + padding + 28}"
        y2="${rowY}"
        stroke="${item.style.stroke}"
        stroke-width="${item.style.strokeWidth}"
        stroke-dasharray="${item.style.dashArray}"
        opacity="${item.style.opacity}"
        stroke-linecap="round"
      />
      <circle
        cx="${x + padding + 14}"
        cy="${rowY}"
        r="3"
        fill="${item.style.stroke}"
        stroke="white"
        stroke-width="1"
        opacity="${item.style.opacity}"
      />
      <text
        x="${x + padding + 40}"
        y="${rowY + 4}"
        font-size="11"
        fill="#000"
      >
        ${item.label}
      </text>
    `;
  });

  return content;
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

  const allTimes = timetable.trains.flatMap(train => train.stops.map(stop => stop.time));

  if (allTimes.length === 0) {
    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="20" y="40" font-size="18" fill="#000">No timetable data available</text>
      </svg>
    `;
  }

  const rawStartTime = Math.min(...allTimes);
  const rawEndTime = Math.max(...allTimes);

  const startTime = roundDown(rawStartTime - 5, 10);
  const endTime = roundUp(rawEndTime + 5, 10);

  const timeRange = endTime - startTime || 1;

  const stationPositions = timetable.stations.map(s => s.position);
  const minPos = Math.min(...stationPositions);
  const maxPos = Math.max(...stationPositions);
  const posRange = maxPos - minPos || 1;

  const timeScale = t =>
    margin.left + ((t - startTime) / timeRange) * plotWidth;

  const stationScale = pos =>
    margin.top + ((pos - minPos) / posRange) * plotHeight;

  let elements = '';

  elements += `
    <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
  `;

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
    const isHalfHour = t % 30 === 0 && !isHour;

    let stroke = '#e6e6e6';
    let strokeWidth = 1;

    if (isHour) {
      stroke = '#999';
      strokeWidth = 1.5;
    } else if (isHalfHour) {
      stroke = '#c7c7c7';
      strokeWidth = 1.2;
    }

    elements += `
      <line
        x1="${x}"
        y1="${margin.top}"
        x2="${x}"
        y2="${margin.top + plotHeight}"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
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

  const defaultColours = [
    '#005ea5',
    '#d4351c',
    '#00703c',
    '#6f42c1',
    '#f47738',
    '#111111'
  ];

  timetable.trains.forEach((train, index) => {
    const defaultColour = defaultColours[index % defaultColours.length];
    const style = getTrainStyle(train, defaultColour);

    let path = '';
    let firstPoint = null;
    let stopCircles = '';

    train.stops.forEach((stop, i) => {
      const station = timetable.stations.find(s => s.id === stop.station);
      if (!station) return;

      const x = timeScale(stop.time);
      const y = stationScale(station.position);

      if (!firstPoint) {
        firstPoint = { x, y };
      }

      path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;

      stopCircles += `
        <circle
          cx="${x}"
          cy="${y}"
          r="${i === 0 ? 3.5 : 2.5}"
          fill="${style.stroke}"
          stroke="white"
          stroke-width="1"
          opacity="${style.opacity}"
        />
      `;
    });

    if (path) {
      elements += `
        <path
          d="${path}"
          stroke="${style.stroke}"
          fill="none"
          stroke-width="${style.strokeWidth}"
          stroke-dasharray="${style.dashArray}"
          opacity="${style.opacity}"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      `;
    }

    elements += stopCircles;

    if (firstPoint) {
      elements += `
        <text
          x="${firstPoint.x + 6}"
          y="${firstPoint.y - 8}"
          font-size="11"
          fill="${style.stroke}"
          font-weight="600"
          opacity="${style.opacity}"
        >
          ${train.id}
        </text>
      `;
    }
  });

  // Legend
  elements += renderLegend(width - 220, 60);

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${elements}
    </svg>
  `;
}

module.exports = { generateSVG };