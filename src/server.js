// server.js
 //
 // Backend entry point.
 //
 // Responsibilities:
 // - Load environment variables (config/env.js)
 // - Connect to MongoDB
 // - Start the Express server from app.js
import "./config/env.js";
import app from "./app.js";
import connectDB from "./config/db.js";
import http from "http";
import initSockets from "./sockets/index.js";
import { startAppointmentReminderJob } from "./jobs/appointmentReminder.job.js";

 // Connect to MongoDB before accepting requests.
 connectDB();

 // Server bind configuration.
 const PORT = process.env.PORT || 5000;
 const HOST = process.env.HOST || "0.0.0.0";

 // Create an HTTP server so Socket.IO can attach.
 const httpServer = http.createServer(app);
 
 const io = initSockets(httpServer);
 app.set("io", io);

 startAppointmentReminderJob();
 
 // Start listening for HTTP requests.
 httpServer.listen(PORT, HOST, () => {
   console.log(`Server running on http://${HOST}:${PORT} 🚀`);
 });
