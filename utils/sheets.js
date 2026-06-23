const { google } = require('googleapis');

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

async function getAvailableSlots(spreadsheetId) {
  try {
    const auth = await getAuth().getClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:C200'
    });
    const rows = res.data.values || [];
    const available = rows.filter(row => row[2] === 'Sul' || row[2] === 'Сул');
    if (available.length === 0) return 'Одоогоор сул цаг байхгүй байна.';
    return 'Сул цагууд:\n' + available.map(r => r[0] + ' ' + r[1]).join('\n');
  } catch (err) {
    console.error('Sheets read error:', err.message);
    return null;
  }
}

async function bookSlot(spreadsheetId, date, time, name, phone) {
  try {
    const auth = await getAuth().getClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:E200'
    });
    const rows = res.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === date && rows[i][1] === time) {
        const rowNum = i + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!C${rowNum}:E${rowNum}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['Захиалгатай', name, phone]] }
        });
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Sheets write error:', err.message);
    return false;
  }
}

module.exports = { getAvailableSlots, bookSlot };
