require('express-async-errors');
require('dotenv').config();
const startupDebugger = require('debug')('app:startup')   // replaces console.log, use DEBUG=app:* or  DEBUG=app:startup to run
// const dbDebugger = require('debug')('app:db')
const Joi = require("joi");
Joi.objectId = require('joi-objectid')(Joi);
const jwt = require('jsonwebtoken')
const cors = require('cors');
const multer = require('multer') 

const connectDB = require('./db/connect')
const staffRouter = require('./routers/staffRouter');
const studentRouter = require('./routers/studentRouter');
const scoreRouter = require('./routers/scoreRouter');
const classRouter = require('./routers/classRouter');
const attendanceRouter = require('./routers/attendanceRouter');
const userRouter = require('./routers/userRouter');
const assessmentRouter = require('./routers/assessmentRouter');
const billingRouter = require('./routers/billingRouter');
const errorHandler= require('./middleware/errorHandler')
const morgan = require('morgan')
const express = require('express');
const app = express();

app.set('view-engine', 'pug')
app.set('views', './views')

app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(cors());
app.use(express.static('public'))

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  });


if (app.get('env') === 'development' ) {
    app.use(morgan('tiny'))
    startupDebugger('morgan enabled...')
}

app.options('*', cors())
app.use('/api/v1/staff', staffRouter )
app.use('/api/v1/user', userRouter )
app.use('/api/v1/student', studentRouter )
app.use('/api/v1/scores', scoreRouter )
app.use('/api/v1/class', classRouter )
app.use('/api/v1/assessment', assessmentRouter )
app.use('/api/v1/attendance', attendanceRouter )
app.use('/api/v1/billing', billingRouter )
app.use(errorHandler)

 const port = process.env.PORT || 5000

async function start(){
    try {
        const success = await connectDB(process.env.MONGO_URI)
        if (success) console.log('connected')
        app.listen(port, startupDebugger(`server listening on port ${port}`))
    } catch (error) {
        console.log(error)
    }
}
start()

