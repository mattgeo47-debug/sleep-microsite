// ============================================================
// Google Apps Script — Sleep Challenge Backend
// ============================================================
// HOW TO DEPLOY:
// 1. Open your Google Sheet
// 2. Go to Extensions → Apps Script
// 3. Delete any existing code and paste this entire file
// 4. Click Deploy → New Deployment
//    - Type: Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy the deployment URL and update SHEETS_URL in index.html
//    (only if the URL changed)
// 6. If you already have a deployment, click Deploy → Manage Deployments
//    → Edit (pencil icon) → Version: New version → Deploy
// ============================================================

// Sheet name where sleep data is stored
var SHEET_NAME = 'Sleep Data';

/**
 * Handles GET requests — used for the leaderboard
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'leaderboard') {
    return getLeaderboard();
  }

  if (action === 'setup') {
    createScoringDocSheet();
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', message: 'Scoring Logic sheet created' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default response
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Sleep Challenge API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests — routes to sleep data or registration
 */
function doPost(e) {
  try {
    var data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'No data received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Route: registration data goes to "Registrations" sheet
    if (data.action === 'register') {
      return saveRegistration(data);
    }

    // Default: sleep data goes to "Sleep Data" sheet
    var sheet = getOrCreateSheet();

    // Build the row — columns match the existing "Sleep Data" sheet layout:
    // A:Timestamp B:Name C:Email D:Phone E:Device F:Day
    // G:Sleep Duration H:Deep Sleep I:REM Sleep J:Light Sleep K:Awake Time
    // L:Sleep Efficiency M:HRV N:Resting HR O:SpO2 P:Respiratory Rate
    // Q:Bedtime R:Wake Time S:Longevity Score T:Device Detected U:Notes V:AI Insights
    var row = [
      new Date(),                          // A: Timestamp
      data.name || '',                     // B: Name
      data.email || '',                    // C: Email
      data.phone || '',                    // D: Phone
      data.device || '',                   // E: Device
      data.day || '',                      // F: Day
      data.duration || '',                 // G: Sleep Duration
      data.deep_sleep || '',               // H: Deep Sleep
      data.rem_sleep || '',                // I: REM Sleep
      data.light_sleep || '',              // J: Light Sleep
      data.awake_time || '',               // K: Awake Time
      data.sleep_efficiency || '',         // L: Sleep Efficiency
      data.hrv || '',                      // M: HRV
      data.resting_hr || '',               // N: Resting HR
      data.spo2 || '',                     // O: SpO2
      data.respiratory_rate || '',         // P: Respiratory Rate
      data.bedtime || '',                  // Q: Bedtime
      data.wake_time || '',                // R: Wake Time
      data.score || '',                    // S: Longevity Score
      data.device_detected || '',          // T: Device Detected
      data.notes || '',                    // U: Notes
      data.insights || ''                  // V: AI Insights
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Saves registration data to a separate "Registrations" sheet
 */
function saveRegistration(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Registrations';
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      'Timestamp', 'Name', 'Email', 'Phone', 'Device', 'Age', 'Goal'
    ]);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    new Date(),
    data.name || '',
    data.email || '',
    data.phone || '',
    data.device || '',
    data.age || '',
    data.goal || ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Registration saved' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Builds the leaderboard from sheet data
 * Aggregates scores per participant, returns sorted JSON
 */
function getLeaderboard() {
  var sheet;
  try {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({ leaderboard: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!sheet || sheet.getLastRow() < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({ leaderboard: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Read all data (skip header row)
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  // Column indices (0-based) — matches existing "Sleep Data" sheet layout
  var COL_NAME  = 1;   // B: Name
  var COL_DAY   = 5;   // F: Day
  var COL_SCORE = 18;  // S: Longevity Score

  // Aggregate by participant name (case-insensitive)
  var participants = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var name = (row[COL_NAME] || '').toString().trim();
    var day = parseInt(row[COL_DAY]) || 0;
    var score = parseFloat(row[COL_SCORE]) || 0;

    if (!name || score === 0) continue;

    // Case-insensitive key — merges "Mathew George" and "mathew george"
    var key = name.toLowerCase();

    if (!participants[key]) {
      participants[key] = { name: name, scores: {}, best: 0 };
    }

    var p = participants[key];

    // Use the latest score for each day (in case of edits/re-submissions)
    p.scores[day] = score;
  }

  // Calculate aggregates — total score across all submitted days
  var leaderboard = [];
  for (var key in participants) {
    var p = participants[key];
    var dayScores = [];
    for (var day in p.scores) {
      dayScores.push(p.scores[day]);
    }
    if (dayScores.length === 0) continue;

    var total = 0;
    var best = 0;
    for (var j = 0; j < dayScores.length; j++) {
      total += dayScores[j];
      if (dayScores[j] > best) best = dayScores[j];
    }

    leaderboard.push({
      name: p.name,
      total: Math.round(total),
      avg: Math.round(total / dayScores.length),
      best: Math.round(best),
      days: dayScores.length
    });
  }

  // Sort by total score descending (position reflects cumulative effort)
  leaderboard.sort(function(a, b) { return b.total - a.total; });

  return ContentService
    .createTextOutput(JSON.stringify({ leaderboard: leaderboard }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Gets or creates the SleepData sheet with headers
 */
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Add header row — matches existing layout
    sheet.appendRow([
      'Timestamp (IST)', 'Name', 'Email', 'Phone', 'Device', 'Day',
      'Sleep Duration', 'Deep Sleep', 'REM Sleep', 'Light Sleep', 'Awake Time',
      'Sleep Efficiency', 'HRV', 'Resting HR', 'SpO2', 'Respiratory Rate',
      'Bedtime', 'Wake Time', 'Longevity Score', 'Device Detected', 'Notes', 'AI Insights'
    ]);
    // Bold the header
    sheet.getRange(1, 1, 1, 22).setFontWeight('bold');
    // Freeze the header row
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Creates or updates the "Scoring Logic" documentation sheet
 * Run this once to add clear scoring methodology to the spreadsheet
 */
function createScoringDocSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Scoring Logic';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  var data = [
    ['SLEEP CHALLENGE — LEADERBOARD SCORING LOGIC', '', ''],
    ['', '', ''],
    ['OVERVIEW', '', ''],
    ['The leaderboard ranks participants by their TOTAL CUMULATIVE score across all days submitted.', '', ''],
    ['Missing a day = 0 points for that day = lower total = lower leaderboard position.', '', ''],
    ['', '', ''],
    ['SCORING METHOD', '', ''],
    ['Metric', 'Description', 'How It Works'],
    ['Longevity Sleep Index', 'AI-computed score (0-100) per day', 'Based on sleep duration, deep sleep, REM, efficiency, HRV'],
    ['Total Score', 'Sum of all daily scores', 'Total = Day 1 + Day 2 + ... + Day N'],
    ['Average Score', 'Mean of submitted days', 'Average = Total / Days Submitted (shown for reference)'],
    ['Best Score', 'Highest single-day score', 'Personal best across all days'],
    ['Days Submitted', 'Number of days with data', 'Out of 14 total challenge days'],
    ['', '', ''],
    ['LEADERBOARD RANKING', '', ''],
    ['Primary sort: Total Score (descending)', '', ''],
    ['Participants with more days submitted will naturally have higher totals.', '', ''],
    ['This incentivises daily participation — miss a day, lose ground.', '', ''],
    ['', '', ''],
    ['SCORE BREAKDOWN (per day, 0-100)', '', ''],
    ['Component', 'Max Points', 'What It Measures'],
    ['Sleep Duration', '25', 'Optimal: 7-9 hours'],
    ['Deep Sleep', '20', 'Target: 1.5-2 hours (20-25% of total)'],
    ['REM Sleep', '15', 'Target: 1.5-2 hours (20-25% of total)'],
    ['Sleep Efficiency', '20', 'Target: >90%'],
    ['HRV', '10', 'Higher is better (age-dependent)'],
    ['Other Metrics', '10', 'SpO2, resting HR, respiratory rate'],
    ['', '', ''],
    ['CHALLENGE RULES', '', ''],
    ['• Challenge runs for 14 days starting April 18, 2025', '', ''],
    ['• Participants can enter data for any past day (not just sequentially)', '', ''],
    ['• Future days are locked until they occur', '', ''],
    ['• Only today\'s submission can be edited; past submissions are final', '', ''],
    ['• Data can be entered via screenshot upload (AI-analysed) or manual entry', '', ''],
    ['', '', ''],
    ['Last updated: ' + new Date().toLocaleDateString('en-IN'), '', '']
  ];

  sheet.getRange(1, 1, data.length, 3).setValues(data);

  // Formatting
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setFontSize(14).setBackground('#1a1a2e').setFontColor('#4dd9c0');
  sheet.getRange(3, 1).setFontWeight('bold').setFontSize(11);
  sheet.getRange(7, 1).setFontWeight('bold').setFontSize(11);
  sheet.getRange(8, 1, 1, 3).setFontWeight('bold').setBackground('#2a2a3e').setFontColor('#f5e6a3');
  sheet.getRange(15, 1).setFontWeight('bold').setFontSize(11);
  sheet.getRange(20, 1).setFontWeight('bold').setFontSize(11);
  sheet.getRange(21, 1, 1, 3).setFontWeight('bold').setBackground('#2a2a3e').setFontColor('#f5e6a3');
  sheet.getRange(29, 1).setFontWeight('bold').setFontSize(11);

  sheet.setColumnWidth(1, 300);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 350);
  sheet.setFrozenRows(1);

  Logger.log('Scoring Logic sheet created!');
}

/**
 * One-time setup: run this manually to create the sheet structure
 * Go to Apps Script → select this function → Run
 */
function setup() {
  getOrCreateSheet();
  createScoringDocSheet();
  Logger.log('Sheet "' + SHEET_NAME + '" is ready!');
}
