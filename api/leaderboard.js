export const config = {
  maxDuration: 30,
};

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwvgqwj498e4QbBEhg6oXSATWBFIUDCgYkB_8-19HdLMXyLaIHuLOpabkjXe8h-cd3wBg/exec';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = `${SHEETS_URL}?action=leaderboard`;
    const response = await fetch(url, { redirect: 'follow' });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to reach Google Sheets',
      details: error.message
    });
  }
}
