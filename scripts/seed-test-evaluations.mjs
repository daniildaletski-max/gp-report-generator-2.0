import mysql from 'mysql2/promise';

async function seedTestEvaluations() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    // Get Team Alpha GP IDs
    const [gps] = await connection.execute(`
      SELECT gp.id, gp.name 
      FROM game_presenters gp 
      JOIN fm_teams t ON gp.teamId = t.id 
      WHERE t.teamName = 'Team Alpha'
    `);
    
    console.log(`Found ${gps.length} GPs in Team Alpha`);
    
    // Generate test evaluations for January 2026
    const evaluations = [];
    const evaluators = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Williams'];
    const games = ['Blackjack', 'Roulette', 'Baccarat', 'Poker'];
    
    for (const gp of gps) {
      // Generate 2-4 evaluations per GP
      const numEvaluations = Math.floor(Math.random() * 3) + 2;
      
      for (let i = 0; i < numEvaluations; i++) {
        const day = Math.floor(Math.random() * 28) + 1;
        const evaluationDate = new Date(Date.UTC(2026, 0, day, 10, 0, 0));
        
        // Random scores
        const hairScore = Math.floor(Math.random() * 3) + 1;
        const makeupScore = Math.floor(Math.random() * 3) + 1;
        const outfitScore = Math.floor(Math.random() * 3) + 1;
        const postureScore = Math.floor(Math.random() * 3) + 1;
        const dealingStyleScore = Math.floor(Math.random() * 5) + 1;
        const gamePerformanceScore = Math.floor(Math.random() * 5) + 1;
        
        const appearanceScore = hairScore + makeupScore + outfitScore + postureScore;
        const gamePerformanceTotalScore = dealingStyleScore + gamePerformanceScore;
        const totalScore = appearanceScore + gamePerformanceTotalScore;
        
        evaluations.push([
          gp.id,
          evaluators[Math.floor(Math.random() * evaluators.length)],
          evaluationDate,
          games[Math.floor(Math.random() * games.length)],
          totalScore,
          hairScore, 3, null,
          makeupScore, 3, null,
          outfitScore, 3, null,
          postureScore, 3, null,
          dealingStyleScore, 5, null,
          gamePerformanceScore, 5, null,
          appearanceScore,
          gamePerformanceTotalScore
        ]);
      }
    }
    
    console.log(`Inserting ${evaluations.length} test evaluations...`);
    
    // Insert evaluations
    for (const evalData of evaluations) {
      await connection.execute(`
        INSERT INTO evaluations (
          gamePresenterId, evaluatorName, evaluationDate, game, totalScore,
          hairScore, hairMaxScore, hairComment,
          makeupScore, makeupMaxScore, makeupComment,
          outfitScore, outfitMaxScore, outfitComment,
          postureScore, postureMaxScore, postureComment,
          dealingStyleScore, dealingStyleMaxScore, dealingStyleComment,
          gamePerformanceScore, gamePerformanceMaxScore, gamePerformanceComment,
          appearanceScore, gamePerformanceTotalScore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, evalData);
    }
    
    console.log('Test evaluations inserted successfully!');
    
    // Verify
    const [count] = await connection.execute('SELECT COUNT(*) as total FROM evaluations');
    console.log(`Total evaluations in database: ${count[0].total}`);
    
  } finally {
    await connection.end();
  }
}

seedTestEvaluations().catch(console.error);
