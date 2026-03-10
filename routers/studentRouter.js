const express = require('express');
const router = express.Router();
const {addStudent,
       getStudents,
       getAllStudents,
       getStudentsByClass,
       editStudent,
       updateStudent,
       updateStatus,
       promoteStudents,
       promoteOneStudent,
       demoteStudent,
       deleteStudent,
       changeStudentsClass,
       getOneStudent,
       } 
       = require('../controllers/studentController')
const authenticateUser = require('../middleware/auth')
const {superAdmin, admin, adminORteacher} = require('../middleware/roles')


router.route('/registerStudent').post([authenticateUser, adminORteacher], addStudent)
router.route('/all/:page').get([authenticateUser, admin], getAllStudents)
router.route('/one').get([authenticateUser, admin], getOneStudent)
router.route('/byClass/:page').get([authenticateUser, adminORteacher], getStudentsByClass)
router.route('/:page').get([authenticateUser, adminORteacher], getStudents)
router.route('/editStudent').post([authenticateUser, admin], editStudent)
router.route('/updateStudent').patch([authenticateUser, admin], updateStudent)
router.route('/updateStatus').patch([authenticateUser, admin], updateStatus)
router.route('/promoteStudents').patch([authenticateUser, admin], promoteStudents)
router.route('/promoteOneStudent').patch([authenticateUser, admin], promoteOneStudent)
router.route('/demoteStudent').patch([authenticateUser, admin], demoteStudent)
router.route('/deleteStudent').delete([authenticateUser, admin], deleteStudent)
router.route('/changeClass/:proposedclass').patch([authenticateUser, admin], changeStudentsClass)


module.exports = router;