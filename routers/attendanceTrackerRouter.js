const express = require('express');
const router = express.Router();
const {submitDetails} = require('../controllers/attendanceTrackingController')
const authenticateUser = require('../middleware/auth')
const {superAdmin, admin, adminORteacher} = require('../middleware/roles')


router.route('/submitDetails').post([authenticateUser, admin], submitDetails)


module.exports = router;