const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

function openMaybeGzip(filePath) {
  const input = fs.createReadStream(filePath);
  return filePath.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
}

function trimOrNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function runsOnDate(schedule, serviceDate) {
  const date = new Date(serviceDate);
  const start = new Date(schedule.schedule_start_date);
  const end = new Date(schedule.schedule_end_date);

  if (Number.isNaN(date.getTime())) return false;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  if (date < start || date > end) return false;

  const days = schedule.schedule_days_runs || '0000000';
  const jsDay = date.getDay(); // Sun=0 ... Sat=6
  const index = jsDay === 0 ? 6 : jsDay - 1; // Mon=0 ... Sun=6

  return days[index] === '1';
}

function scheduleKey(schedule) {
  const uid = trimOrNull(schedule.CIF_train_uid) || '';
  const startDate = trimOrNull(schedule.schedule_start_date) || '';
  const stp = trimOrNull(schedule.CIF_stp_indicator) || '';
  const signallingId = trimOrNull(schedule.schedule_segment?.signalling_id) || '';
  const course = schedule.schedule_segment?.CIF_course_indicator || '';

  return `${uid}|${startDate}|${stp}|${signallingId}|${course}`;
}

function serviceSignature(schedule) {
  const uid = trimOrNull(schedule.CIF_train_uid) || '';
  const locations = schedule.schedule_segment?.schedule_location || [];
  const first = locations[0] || {};
  const last = locations[locations.length - 1] || {};

  const firstTiploc = trimOrNull(first.tiploc_code) || '';
  const lastTiploc = trimOrNull(last.tiploc_code) || '';

  const firstTime =
    trimOrNull(first.public_departure) ||
    trimOrNull(first.departure) ||
    trimOrNull(first.public_arrival) ||
    trimOrNull(first.arrival) ||
    trimOrNull(first.pass) ||
    '';

  return `${uid}|${firstTiploc}|${firstTime}|${lastTiploc}`;
}

function stpPriority(stp) {
  switch ((stp || '').trim()) {
    case 'O':
      return 4; // overlay
    case 'N':
      return 3; // new STP
    case 'P':
      return 2; // permanent
    case 'C':
      return 1; // cancellation
    default:
      return 0;
  }
}

class ScheduleStore {
  constructor() {
    this.tiplocs = new Map();
    this.schedules = new Map();
    this.associations = new Map();
    this.loadedFiles = [];
  }

  async loadFile(filePath) {
    const rl = readline.createInterface({
      input: openMaybeGzip(filePath),
      crlfDelay: Infinity
    });

    let counts = {
      header: 0,
      tiploc: 0,
      association: 0,
      schedule: 0,
      parseError: 0
    };

    for await (const line of rl) {
      if (!line.trim()) continue;

      let record;
      try {
        record = JSON.parse(line);
      } catch {
        counts.parseError += 1;
        continue;
      }

      if (record.JsonTimetableV1) {
        counts.header += 1;
        continue;
      }

      if (record.TiplocV1) {
        this.applyTiploc(record.TiplocV1);
        counts.tiploc += 1;
        continue;
      }

      if (record.JsonAssociationV1) {
        this.applyAssociation(record.JsonAssociationV1);
        counts.association += 1;
        continue;
      }

      if (record.JsonScheduleV1) {
        this.applySchedule(record.JsonScheduleV1);
        counts.schedule += 1;
        continue;
      }
    }

    this.loadedFiles.push({
      filePath,
      counts,
      loadedAt: new Date().toISOString()
    });

    return counts;
  }

  applyTiploc(tiploc) {
    const code = trimOrNull(tiploc.tiploc_code);
    if (!code) return;

    const action = (tiploc.transaction_type || '').trim().toLowerCase();

    if (action === 'delete') {
      this.tiplocs.delete(code);
      return;
    }

    this.tiplocs.set(code, {
      tiploc_code: code,
      crs_code: trimOrNull(tiploc.crs_code),
      description: trimOrNull(tiploc.description),
      tps_description: trimOrNull(tiploc.tps_description),
      stanox: trimOrNull(tiploc.stanox),
      nalco: trimOrNull(tiploc.nalco)
    });
  }

  applyAssociation(association) {
    const key = [
      trimOrNull(association.main_train_uid) || '',
      trimOrNull(association.assoc_train_uid) || '',
      trimOrNull(association.assoc_start_date) || '',
      trimOrNull(association.location) || '',
      trimOrNull(association.CIF_stp_indicator) || ''
    ].join('|');

    const action = (association.transaction_type || '').trim().toLowerCase();

    if (action === 'delete') {
      this.associations.delete(key);
      return;
    }

    this.associations.set(key, association);
  }

  applySchedule(schedule) {
    const key = scheduleKey(schedule);
    const action = (schedule.transaction_type || '').trim().toLowerCase();

    if (action === 'delete') {
      this.schedules.delete(key);
      return;
    }

    this.schedules.set(key, schedule);
  }

  getTiploc(code) {
    return this.tiplocs.get(code) || null;
  }

  getActiveSchedulesForDate(serviceDate) {
    const result = [];

    for (const schedule of this.schedules.values()) {
      if (!runsOnDate(schedule, serviceDate)) continue;
      result.push(schedule);
    }

    return result;
  }

  getResolvedSchedulesForDate(serviceDate) {
    const active = this.getActiveSchedulesForDate(serviceDate);

    const grouped = new Map();

    for (const schedule of active) {
      const signature = serviceSignature(schedule);
      const list = grouped.get(signature) || [];
      list.push(schedule);
      grouped.set(signature, list);
    }

    const resolved = [];

    for (const group of grouped.values()) {
      // If there is an STP cancellation in the group, drop the permanent version.
      const hasCancellation = group.some(
        s => trimOrNull(s.CIF_stp_indicator) === 'C'
      );

      const candidates = hasCancellation
        ? group.filter(s => trimOrNull(s.CIF_stp_indicator) !== 'P' && trimOrNull(s.CIF_stp_indicator) !== 'C')
        : group.filter(s => trimOrNull(s.CIF_stp_indicator) !== 'C');

      if (candidates.length === 0) {
        continue;
      }

      candidates.sort((a, b) => {
        const pa = stpPriority(trimOrNull(a.CIF_stp_indicator));
        const pb = stpPriority(trimOrNull(b.CIF_stp_indicator));
        return pb - pa;
      });

      resolved.push(candidates[0]);
    }

    return resolved;
  }

  getSummary() {
    return {
      tiplocs: this.tiplocs.size,
      schedules: this.schedules.size,
      associations: this.associations.size,
      loadedFiles: this.loadedFiles
    };
  }
}

module.exports = {
  ScheduleStore,
  runsOnDate,
  trimOrNull
};
