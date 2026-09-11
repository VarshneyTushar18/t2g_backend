import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,
    database:process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, 
    waitForConnections:true,
    connectionLimit:10,
    queueLimit:0
})


export const testDBConnection = async () => {
  try {
    const connection = await pool.getConnection();
    const dbName = process.env.DB_NAME || "tech2globe";
    console.log(`Main MySQL connected (${dbName})`);
    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:", error);
    process.exit(1); // ✅ crash app if DB fails
  }
};




export default pool;