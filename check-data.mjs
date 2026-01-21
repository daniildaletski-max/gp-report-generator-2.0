import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Check Agnes Suvorov
const agnes = await connection.execute("SELECT id, name, teamId FROM game_presenters WHERE name LIKE '%Agnes%'");
console.log("Agnes Suvorov GP:", agnes[0]);

// Check Team Omnicron ID
const team = await connection.execute("SELECT id, teamName FROM fm_teams WHERE teamName = 'Team Omnicron'");
console.log("Team Omnicron:", team[0]);

// Check evaluations for Agnes
const evals = await connection.execute("SELECT id, gamePresenterId, evaluationDate, appearanceScore, gamePerformanceTotalScore FROM evaluations WHERE gamePresenterId = (SELECT id FROM game_presenters WHERE name LIKE '%Agnes%')");
console.log("Agnes evaluations:", evals[0]);

// Check all GPs in Team Omnicron
const gps = await connection.execute("SELECT id, name, teamId FROM game_presenters WHERE teamId = (SELECT id FROM fm_teams WHERE teamName = 'Team Omnicron')");
console.log("Team Omnicron GPs:", gps[0]);

await connection.end();
