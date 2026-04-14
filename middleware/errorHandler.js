// const errorHandlerMiddleware = (err,req,res,next) =>{
// return res.status(500).json({msg:err})
// }
const startupDebugger = require('debug')('app:startup')


const ErrorHandler = (err, req, res, next) => {
    console.error("ERROR STACK:", err.stack || err);
    const errStatus = err.statusCode || 500;
    const errMsg = err.message || 'Something went wrong';
    res.status(errStatus).json({
        success: false,
        status: errStatus,
        message: errMsg.includes("E11000") ? 'duplicate value: admission number already exists': errMsg,
        // stack: err.stack
        stack: process.env.NODE_ENV === 'development' ? err.stack : {}
    })
}

process.on('uncaughtException', err =>{
    console.log(`something happened: ${err}`);
    process.exit(1);
})

module.exports = ErrorHandler