function parseTimeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

module.exports = { parseTimeToMinutes };