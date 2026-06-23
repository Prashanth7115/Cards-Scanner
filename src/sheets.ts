/**
 * Google Sheets API Integration Helper
 */

export function extractSpreadsheetId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  if (trimmed.includes("docs.google.com/spreadsheets")) {
    const matches = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return matches && matches[1] ? matches[1] : trimmed;
  }
  return trimmed;
}

export async function createGoogleSheet(accessToken: string, titleName: string) {
  if (accessToken === "mock_token") {
    // Artificial 1 second delay for mock connection realism
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      spreadsheetId: "1_insta_scan_mock_sheets_db_example_" + Math.random().toString(36).substr(2, 9),
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1_insta_scan_mock_sheets_db_example/edit",
    };
  }

  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  
  const body = {
    properties: {
      title: titleName,
    },
    sheets: [
      {
        properties: {
          title: "Scanned Contacts",
          gridProperties: {
            frozenRowCount: 1,
          }
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "S.No" } },
                  { userEnteredValue: { stringValue: "Name" } },
                  { userEnteredValue: { stringValue: "Designation" } },
                  { userEnteredValue: { stringValue: "Mobile Number(s)" } },
                  { userEnteredValue: { stringValue: "Company Name" } },
                  { userEnteredValue: { stringValue: "Address" } },
                  { userEnteredValue: { stringValue: "Email" } },
                  { userEnteredValue: { stringValue: "Website" } },
                  { userEnteredValue: { stringValue: "Scanned Timestamp" } },
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create Google Sheet: ${errText}`);
  }

  const result = await response.json();
  return {
    spreadsheetId: result.spreadsheetId,
    spreadsheetUrl: result.spreadsheetUrl,
  };
}

export async function appendGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  rows: any[][]
) {
  if (accessToken === "mock_token") {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { updates: { updatedRows: rows.length } };
  }

  // Use "Scanned Contacts" specifically if it exists, or write to the spreadsheet generally
  // To verify sheet names or keep it resilient, send values to Sheet1 or let sheets auto-route.
  // We specify range 'A:I'. If they created database manually via link without 'Scanned Contacts', we target general 'A:I'.
  const range = "A:I";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const body = {
    range: range,
    majorDimension: "ROWS",
    values: rows,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to append rows to Google Sheet: ${errText}`);
  }

  return await response.json();
}
