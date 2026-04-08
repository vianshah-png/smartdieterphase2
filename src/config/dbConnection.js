import mysql from "mysql2/promise";
import dotenv from "dotenv";
import mongoose from "mongoose";
import knex from "knex";

dotenv.config();
if (process.env.NODE_ENV == "production") {
  console.log = () => {};
}

// Initialize Knex
export const db = knex({
  client: "mysql2",
  connection: {
    host: process.env.MYSQL_HOSTNAME,
    user: process.env.MYSQL_DATABASE_USER,
    password: process.env.MYSQL_DATABASE_PASSWORD,
    database: process.env.MYSQL_DATABASE_NAME,
  },
  debug: true,
});

// MySQL Configurations
const mysqldbConfigWrite = {
  host: process.env.MYSQL_HOSTNAME,
  user: process.env.MYSQL_DATABASE_USER,
  password: process.env.MYSQL_DATABASE_PASSWORD,
  database: process.env.MYSQL_DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 100,
  queueLimit: 0,
  connectTimeout: 300000,
};

const mysqldbConfigRead = {
  host: process.env.MYSQL_READ_DATABASE_HOSTNAME,
  user: process.env.MYSQL_READ_DATABASE_USER,
  password: process.env.MYSQL_READ_DATABASE_PASSWORD,
  database: process.env.MYSQL_READ_DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: 100,
  queueLimit: 0,
  connectTimeout: 300000,
};
// const mysqldbLiveConfig = {
//   host: process.env.LIVE_HOSTNAME,
//   user: process.env.LIVE_DATABASE_USER,
//   password: process.env.LIVE_DATABASE_PASSWORD,
//   database: process.env.LIVE_DATABASE_NAME,
//   waitForConnections: true,
//   connectionLimit: 100,
//   queueLimit: 0,
//   connectTimeout: 30000,
// };

console.log("MySQL Write Database Configuration:", mysqldbConfigWrite);
console.log("MySQL Read Database Configuration:", mysqldbConfigRead);

// MySQL Connection Pools
let writePool;
let readPool;

let livePool;

const testConnection = async (pool, type) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    console.log(`${type} Database connection established successfully`);
  } catch (error) {
    console.error(`Error testing ${type} database connection:`, error);
    throw error;
  }
};

try {
  writePool = mysql.createPool(mysqldbConfigWrite);
  await testConnection(writePool, "Write");
} catch (error) {
  console.error("Error establishing write database connection:", error);
  process.exit(1);
}
// try {
//   livePool = mysql.createPool(mysqldbLiveConfig);
//   await testConnection(livePool, "Live Database Connection");
// } catch (error) {
//   console.error("Error establishing write database connection:", error);
//   process.exit(1);
// }

try {
  readPool = mysql.createPool(mysqldbConfigRead);
  await testConnection(readPool, "Read");
} catch (error) {
  console.error("Error establishing read database connection:", error);
  process.exit(1);
}

// MongoDB Connection
(async () => {
  try {
    const connect = await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGODB_DATABASE_NAME,
    });
    console.log(
      "Connected to MongoDB:",
      connect.connection.host,
      connect.connection.name
    );
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
})();

export { writePool, readPool };
