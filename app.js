require('express-async-errors');
require('dotenv').config();

const startupDebugger = require('debug')('app:startup')
const cors = require('cors');
const morgan = require('morgan')
const express = require('express');
const app = express();

const connectDB = require('./db/connect')

// routers
const staffRouter = require('./routers/staffRouter');
const studentRouter = require('./routers/studentRouter');
const scoreRouter = require('./routers/scoreRouter');
const classRouter = require('./routers/classRouter');
const newAttendanceRouter = require('./routers/newAttendanceRouter');
const userRouter = require('./routers/userRouter');
const assessmentRouter = require('./routers/assessmentRouter');
const billingRouter = require('./routers/billingRouter');
const attendanceTrackingRouter = require('./routers/attendanceTrackerRouter');

const errorHandler = require('./middleware/errorHandler')

// cron
const { runAttendanceJob } = require("./cron/attendanceCron");
require("./cron/heartbeat");

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(cors());
app.use(express.static('public'))

if (app.get('env') === 'development') {
    app.use(morgan('tiny'))
    startupDebugger('morgan enabled...')
}

// routes
app.use('/api/v1/staff', staffRouter)
app.use('/api/v1/user', userRouter)
app.use('/api/v1/student', studentRouter)
app.use('/api/v1/scores', scoreRouter)
app.use('/api/v1/class', classRouter)
app.use('/api/v1/assessment', assessmentRouter)
app.use('/api/v1/attendance2', newAttendanceRouter)
app.use('/api/v1/billing', billingRouter)
app.use('/api/v1/attendancetracking', attendanceTrackingRouter)

// ✅ HEALTH CHECK
app.get("/health", (req, res) => {
  console.log("🔥 Uptime ping:", new Date().toISOString());
  res.status(200).send("OK");
});


// ❗ LAST
app.use(errorHandler)

const port = process.env.PORT || 5000

async function start() {
    try {
        const success = await connectDB(process.env.MONGO_URI)
        if (success) console.log('connected')
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });
    } catch (error) {
        console.log(error)
    }
}
start()