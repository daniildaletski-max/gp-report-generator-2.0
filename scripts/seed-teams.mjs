import mysql from 'mysql2/promise';

const teams = {
  "Team Omnicron": {
    teamLeader: "Andri Saaret",
    members: [
      "Viktoriia Marchenko",
      "Elina Sahkai",
      "Yusuf Turabi",
      "Mariia Kolbasova",
      "Anastasija Kalašnikova",
      "Elizaveta Sofia Reemet",
      "Danylo Baiduhanov",
      "Annaliisa Jerlakas",
      "Laurit Kurm",
      "Vladimir Petrov",
      "Anya Kiisk",
      "Milena Kõiv",
      "Eliise Jõgar"
    ]
  },
  "Team Zeta": {
    teamLeader: "Alissa Gujevskaja",
    members: [
      "Elena Zimarina",
      "Natalja Kravcova",
      "Reeli Pao",
      "Jelizaveta Venkova",
      "Jana Minjailova",
      "Diana Kuzin",
      "Alina Jivoloup",
      "Reiko Koga",
      "Jaanek Rits",
      "Inna Tarakanova"
    ]
  },
  "Team Alpha": {
    teamLeader: "Kristina Bobrovskaja",
    members: [
      "Maria Solovova",
      "Tetiana Blyshchyk",
      "Anna Maslova",
      "Liis-Liisa Gertsjak",
      "Elina Varivoda",
      "Kaisa Helena Rõngelep",
      "Marina Poleštšuk",
      "Marek Koroljov",
      "Alina Kudashova",
      "Dia Lee",
      "Greeteli Paama",
      "Ivanna Matukhno",
      "Sofja Barchan"
    ]
  }
};

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log("Starting team data import...\n");
  
  // Get existing teams
  const [existingTeams] = await conn.execute('SELECT id, teamName FROM fm_teams');
  const teamMap = {};
  for (const team of existingTeams) {
    teamMap[team.teamName] = team.id;
  }
  console.log("Existing teams:", teamMap);
  
  // Get existing GPs
  const [existingGPs] = await conn.execute('SELECT id, name FROM game_presenters');
  const gpMap = {};
  for (const gp of existingGPs) {
    gpMap[gp.name] = gp.id;
  }
  console.log("Existing GPs:", Object.keys(gpMap).length);
  
  let addedCount = 0;
  let updatedCount = 0;
  
  for (const [teamName, teamData] of Object.entries(teams)) {
    const teamId = teamMap[teamName];
    if (!teamId) {
      console.log(`Team "${teamName}" not found in database, skipping...`);
      continue;
    }
    
    console.log(`\nProcessing ${teamName} (ID: ${teamId}) - ${teamData.members.length} members`);
    
    for (const gpName of teamData.members) {
      if (gpMap[gpName]) {
        // Update existing GP with team assignment
        await conn.execute(
          'UPDATE game_presenters SET teamId = ? WHERE id = ?',
          [teamId, gpMap[gpName]]
        );
        console.log(`  Updated: ${gpName} -> Team ${teamId}`);
        updatedCount++;
      } else {
        // Insert new GP
        await conn.execute(
          'INSERT INTO game_presenters (name, teamId) VALUES (?, ?)',
          [gpName, teamId]
        );
        console.log(`  Added: ${gpName} -> Team ${teamId}`);
        addedCount++;
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Added: ${addedCount} new Game Presenters`);
  console.log(`Updated: ${updatedCount} existing Game Presenters`);
  
  // Verify final counts
  const [finalCounts] = await conn.execute(`
    SELECT 
      ft.teamName, 
      ft.floorManagerName,
      COUNT(gp.id) as gpCount 
    FROM fm_teams ft 
    LEFT JOIN game_presenters gp ON gp.teamId = ft.id 
    GROUP BY ft.id, ft.teamName, ft.floorManagerName
    ORDER BY ft.teamName
  `);
  
  console.log("\n=== Team Composition ===");
  for (const row of finalCounts) {
    console.log(`${row.teamName} (${row.floorManagerName}): ${row.gpCount} GPs`);
  }
  
  await conn.end();
  console.log("\nDone!");
}

main().catch(console.error);
