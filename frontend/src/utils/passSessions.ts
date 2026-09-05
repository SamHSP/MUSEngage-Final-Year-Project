const API = import.meta.env.VITE_BACKEND_API;
const API_BASE = typeof API === 'string' ? API.trim().replace(/\/+$/, '') : '';

export const PASS_SESSIONS_ENDPOINT = API_BASE ? `${API_BASE}/api/pass/sessions` : '/api/pass/sessions';
export const PASS_IMPORT_ENDPOINT = API_BASE ? `${API_BASE}/api/pass/sessions/import` : '/api/pass/sessions/import';

export const EXPECTED_HEADERS = ['meeting time', 'student lecturer', 'venue', 'google meet link'];

// Normalises header text for consistent comparisons.
const normaliseHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

// Splits a CSV row into cells while honouring quoted values.
const splitCsvRow = (row: string) => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];

    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

export type PassSessionDraft = {
  meetingTime: string;
  studentLecturer: string;
  venue: string;
  meetLink: string;
};

export type PassSessionApi = PassSessionDraft & { id: string };

export type PassImportResponse = {
  added: PassSessionApi[];
  duplicateCount: number;
};

// Parses CSV content into PASS session drafts.
export const parsePassCsv = (csv: string): PassSessionDraft[] => {
  const rows = csv
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    return [];
  }

  let startIndex = 0;
  const headerCells = splitCsvRow(rows[0]).map(normaliseHeader);
  const hasHeader =
    headerCells.length >= EXPECTED_HEADERS.length && EXPECTED_HEADERS.every((header) => headerCells.includes(header));

  if (hasHeader) {
    startIndex = 1;
  }

  const sessions: PassSessionDraft[] = [];

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];
    const cells = splitCsvRow(row);
    if (cells.length < EXPECTED_HEADERS.length) {
      continue;
    }

    const [meetingTime, studentLecturer, venue, meetLink] = cells;
    if (!meetingTime || !studentLecturer || !venue || !meetLink) {
      continue;
    }

    sessions.push({
      meetingTime: meetingTime.trim(),
      studentLecturer: studentLecturer.trim(),
      venue: venue.trim(),
      meetLink: meetLink.trim(),
    });
  }

  return sessions;
};
