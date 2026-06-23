const { google } = require('googleapis');

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// Sheet structure:
// A: Ogno (Date YYYY-MM-DD)
// B: Utas (Phone - empty = available)
// C: Urдchilgaa (Advance payment)
// D: Busad (Other payments)

async function getAvailableSlots(spreadsheetId) {
  try {
    const auth = await getAuth().getClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:D200'
    });
    const rows = res.data.values || [];
    const available = rows.filter(row => row[0] && (!row[1] || row[1].trim() === ''));
    if (available.length === 0) return 'Odoogoor sul ognoo baikhgui baina.';
    return 'Sul ognoonuud:\n' + available.map(r => r[0]).join('\n');
  } catch (err) { console.error('Sheets read error:', err.message); return null; }
}

async function bookSlot(spreadsheetId, date, phone, advance) {
  try {
    const auth = await getAuth().getClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:D200'
    });
    const rows = res.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === date) {
        const rowNum = i + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!B${rowNum}:C${rowNum}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[phone, advance || '']] }
        });
        return true;
      }
    }
    return false;
  } catch (err) { console.error('Sheets write error:', err.message); return false; }
}

module.exports = { getAvailableSlots, bookSlot };
