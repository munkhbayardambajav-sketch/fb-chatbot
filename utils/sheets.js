const { google } = require('googleapis');

function getAuth() {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    return new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
}

// Sheet1: A=Огноо, B=Утас, C=Урьдчилгаа, D=Бусад
async function getAvailableSlots(spreadsheetId) {
    try {
          const auth = await getAuth().getClient();
          const sheets = google.sheets({ version: 'v4', auth });
          const res = await sheets.spreadsheets.values.get({
                  spreadsheetId, range: 'Sheet1!A2:D200'
          });
          const rows = res.data.values || [];
          const available = rows.filter(row => row[0] && (!row[1] || row[1].trim() === ''));
          if (available.length === 0) return 'Одоогоор сул огноо байхгүй байна.';
          return 'Сул огноонууд:\n' + available.map(r => r[0]).join('\n');
    } catch (err) {
          console.error('Sheets read error:', err.message);
          return null;
    }
}

async function bookSlot(spreadsheetId, date, phone, advance) {
    try {
          const auth = await getAuth().getClient();
          const sheets = google.sheets({ version: 'v4', auth });
          const res = await sheets.spreadsheets.values.get({
                  spreadsheetId, range: 'Sheet1!A2:D200'
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
    } catch (err) {
          console.error('Sheets write error:', err.message);
          return false;
    }
}

// Sheet2: A1 = бот заавар, A2 = үнийн зургийн URL
async function getSheetSettings(spreadsheetId) {
    try {
          const auth = await getAuth().getClient();
          const sheets = google.sheets({ version: 'v4', auth });
          const res = await sheets.spreadsheets.values.get({
                  spreadsheetId, range: 'Sheet2!A1:A10'
          });
          const rows = res.data.values || [];
          return {
                  systemPrompt: rows[0]?.[0] || null,
                  priceImageUrl: rows[1]?.[0] || null
          };
    } catch (err) {
          console.error('Sheet2 read error:', err.message);
          return { systemPrompt: null, priceImageUrl: null };
    }
}

module.exports = { getAvailableSlots, bookSlot, getSheetSettings };
