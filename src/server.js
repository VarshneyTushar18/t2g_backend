import app from "./app.js";
import dotenv from "dotenv";
import { testDBConnection } from "./config/db.js";


dotenv.config();

// Set the port from environment variable or default to 5000
const PORT = process.env.PORT || 5000;





// Test database connection before starting the server  
testDBConnection();



// Health check endpoint fake end Point to check if server is running and database is connected
app.get("/health", async (req, res) => {
  res.json({
    server: "running",
    database: "connected"
  });
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});