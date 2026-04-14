const express = require('express');
const router = express.Router();
const {userSignUp,userLogIn,forgotPassword,resetPassword,portalRedirect, getUserEmail, sendMessage, userAuthenticated} 
       = require('../controllers/userController')
const authenticateUser = require('../middleware/auth')


router.get('/checkStatus', authenticateUser, userAuthenticated)
router.route('/signup').post(userSignUp)
router.route('/login').post(userLogIn)
router.post('/forgotPassword', forgotPassword)
router.post('/password-reset/:userId/:token', resetPassword)
router.post('/getEmail/:userId', getUserEmail)
router.post('/sendMessage', sendMessage)
router.get('/authorise', authenticateUser, portalRedirect)



module.exports = router;