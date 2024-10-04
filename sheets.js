const path = require('path');
const { google } = require('googleapis');

// Load credentials from your downloaded JSON key file
const credentials = require(path.join(__dirname, 'google-credentials.json'));

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets.readonly']
);

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetData(spreadsheetId) {
    try {
        console.log('Attempting to fetch sheet data...');
        const [usersResponse, roscasResponse] = await Promise.all([
          sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Users!A2:F',
          }),
          sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'ROSCAs!A2:B',
          }),
        ]);
        console.log('Sheet data fetched successfully');

    const users = usersResponse.data.values.map(row => ({
      id: parseInt(row[0]),
      walletAddress: row[1],
      name: row[2],
      balance: parseFloat(row[3]),
      points: parseInt(row[4]),
      roscas: row[5] ? row[5].split(',') : []
    }));

    const roscas = roscasResponse.data.values.map(row => ({
      id: parseInt(row[0]),
      contractAddress: row[1]
    }));

    return { users, roscas };
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
}

module.exports = { getSheetData };