import mysql from 'mysql2/promise';

async function checkEvaluations() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    // Check all evaluations
    const [evals] = await connection.execute(`
      SELECT e.id, e.gamePresenterId, e.evaluationDate, gp.name, gp.teamId
      FROM evaluations e
      LEFT JOIN game_presenters gp ON e.gamePresenterId = gp.id
      LIMIT 10
    `);
    
    console.log('Evaluations with GP info:');
    console.table(evals);
    
    // Check Team Alpha ID
    const [teams] = await connection.execute(`SELECT id, teamName FROM fm_teams WHERE teamName = 'Team Alpha'`);
    console.log('\nTeam Alpha:', teams);
    
    // Check GP IDs in Team Alpha
    const [gps] = await connection.execute(`
      SELECT id, name, teamId FROM game_presenters WHERE teamId = ${teams[0]?.id || 1} LIMIT 5
    `);
    console.log('\nGPs in Team Alpha:', gps);
    
    // Check if evaluations have matching GP IDs
    const [evalGpIds] = await connection.execute(`SELECT DISTINCT gamePresenterId FROM evaluations`);
    console.log('\nDistinct GP IDs in evaluations:', evalGpIds);
    
  } finally {
    await connection.end();
  }
}

checkEvaluations().catch(console.error);
