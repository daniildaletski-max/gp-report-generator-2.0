import mysql from 'mysql2/promise';

async function checkReportData() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    // Check Team Alpha reports
    const [reports] = await connection.execute(`
      SELECT r.id, r.teamId, r.reportMonth, r.reportYear, t.teamName 
      FROM reports r 
      JOIN fm_teams t ON r.teamId = t.id 
      WHERE t.teamName = 'Team Alpha'
    `);
    console.log('Team Alpha Reports:');
    console.table(reports);
    
    if (reports.length > 0) {
      const report = reports.find(r => r.reportMonth === 1) || reports[0];
      console.log(`\nChecking report ID ${report.id} for Team Alpha, Month ${report.reportMonth}, Year ${report.reportYear}`);
      console.log(`Team ID: ${report.teamId}`);
      
      // Check GPs in this team
      const [gps] = await connection.execute(`
        SELECT id, name FROM game_presenters WHERE teamId = ?
      `, [report.teamId]);
      console.log(`\nGPs in team ${report.teamId}:`, gps.length);
      
      // Check evaluations for these GPs in January 2026
      const startDate = new Date(Date.UTC(report.reportYear, report.reportMonth - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(report.reportYear, report.reportMonth, 0, 23, 59, 59));
      console.log(`\nDate range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      const gpIds = gps.map(g => g.id);
      if (gpIds.length > 0) {
        const [evals] = await connection.execute(`
          SELECT e.id, e.gamePresenterId, e.evaluationDate, e.appearanceScore, e.gamePerformanceTotalScore
          FROM evaluations e
          WHERE e.gamePresenterId IN (${gpIds.join(',')})
          AND e.evaluationDate >= ?
          AND e.evaluationDate <= ?
        `, [startDate, endDate]);
        console.log(`\nEvaluations found: ${evals.length}`);
        if (evals.length > 0) {
          console.table(evals.slice(0, 5));
        }
      }
    }
    
  } finally {
    await connection.end();
  }
}

checkReportData().catch(console.error);
