const dbDebugger = require("debug")("app:db");
const Student = require("../models/studentModel");
const Staff = require("../models/staffModel");
const User = require("../models/userModel");
const Score = require("../models/scoreModel");
const Attendance = require("../models/newAttendanceModel");
const Billing = require("../models/billingsModel");
const {
  newStudentValidation,
  updateStudentValidation,
  editStudentValidation
} = require("../validators/studentValidator");

const { MailNotSentError, BadUserRequestError, NotFoundError, UnAuthorizedError } =
  require('../middleware/errors')

const classes = require("../models/classModel");
// const asyncWrapper = require('../middleware/async')

const addStudent = async (req, res, next) => {
  const { error } = newStudentValidation(req.body);
  if (error) throw error;

  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.teacherProgramme != req.body.programme) {
    throw new UnAuthorizedError("Error: Sorry, you are not allowed to add students of other programmes")
  }

  if (req.body.email !== "nothing@nil.com") {
    const emailExists = await Student.findOne({ email: req.body.email });
    if (emailExists) throw new BadUserRequestError("Error: An account with this email already exists");
  }
  const admnoExists = await Student.findOne({ admNo: req.body.admNo });
  if (admnoExists) throw new BadUserRequestError("Error: A student with this admission number already exists");

  const parent = await User.findOne({ email: req.body.parentEmail })
  if (parent) {
    parent.userRole = "parent";
    parent.save()
  }

  const isStudent = await User.findOne({ email: req.body.email })
  if (isStudent) {
    isStudent.userRole = "student";
    isStudent.save()
  }

  const student = await Student.create(req.body);
  res.status(201).json({ status: "success", student, message: "Student added successfully" });
};

// check if page returned is the last
function getEndOfPage(studNum, pgSize) {
  let lastpage;
  const wholediv = Math.floor(studNum / pgSize);
  const modulus = studNum % pgSize;
  if (modulus == 0) lastpage = wholediv;
  else lastpage = wholediv + 1;
  // console.log(lastpage)
  return lastpage
}

const getStudents = async (req, res, next) => {
  let pageNumber = +req.params.page || 1;
  const pageSize = 10;
  let queryObject = req.query;
 
  const { admNo, firstName, lastName, gender, address, entryClass, stateOfOrigin, maritalStatus, programme, presentClass, classStatus, studentStatus, paymentStatus } = req.query;
  // let queryObject = {};

  if (admNo) {
    queryObject.admNo = admNo;
  }
  if (firstName) {
    queryObject.firstName = { $regex: firstName, $options: "i" };
  }
  if (lastName) {
    queryObject.lastName = { $regex: lastName, $options: "i" };
  }
  if (entryClass) {
    queryObject.entryClass = entryClass;
  }
  if (gender) {
    queryObject.gender = gender;
  }
  if (address) {
    queryObject.address = { $regex: address, $options: "i" };
  }
  if (stateOfOrigin) {
    queryObject.stateOfOrigin = { $regex: stateOfOrigin, $options: "i" };
  }
  if (maritalStatus) {
    queryObject.maritalStatus = maritalStatus;
  }
  if (presentClass) {
    queryObject.presentClass = presentClass;
  }
  if (programme) {
    queryObject.programme = programme;
  }
  if (classStatus) {
    queryObject.classStatus = classStatus;
  }
  if (studentStatus) {
    queryObject.studentStatus = studentStatus;
  }
  if (paymentStatus) {
    queryObject.paymentStatus = paymentStatus;
  }
  if (Object.keys(queryObject).length === 0)
    return next(new Error("Error: no such criteria exists"));

  let students = await Student.find(queryObject);
  const isStaff = await Staff.findOne({ email: req.user.email })
  if (isStaff.isAdmin == false)
    students = await Student.find({ $and: [queryObject, { presentClass: isStaff.teacherClass }, { programme: isStaff.teacherProgramme }, { studentStatus: "current" }] })

  const noOfStudents = students.length;
  let studentsperpage = await Student.find(queryObject)
    .sort({ admNo: 1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);
  if (isStaff.isAdmin == false)
    studentsperpage = await Student.find({ $and: [queryObject, { presentClass: isStaff.teacherClass }, { programme: isStaff.teacherProgramme }, { studentStatus: "current" }] })
      .sort({ admNo: 1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

  if (students.length == 0)
    return next(new Error("Error: no such students found"));

  const pgnum = getEndOfPage(noOfStudents, pageSize)

  for (let i = 0; i < studentsperpage.length; i++) {
    let date = studentsperpage[i].registeredOn.toString()
    let dateonly = date.split(' ')
    studentsperpage[i].dateOfRegistration = dateonly[0] + " " + dateonly[1] + " " + dateonly[2] + " " + dateonly[3]

    let serialno = (pageSize * pageNumber) - (pageSize - (i + 1))
    studentsperpage[i].serialNo = serialno;
  }
  res
    .status(200)
    .json({ status: "Success", studentsperpage, students, noOfStudents, page: pageNumber, pgnum });
};

const getStudentsByClass = async (req, res, next) => {
  let pageNumber = +req.params.page || 1;
  const pageSize = 5;
  const { presentClass, programme } = req.query;
  let students;

  const teacher = await Staff.findOne({ email: req.user.email })
  const teacherClass = teacher.teacherClass
  const teacherProgramme = teacher.teacherProgramme

  students = await Student.find({ $and: [{ presentClass: teacherClass }, { programme: teacherProgramme }, { studentStatus: "current" }] }).sort({ admNo: 1 })
  if (presentClass && programme) {
    students = await Student.find({ $and: [{ presentClass }, { programme }, { studentStatus: "current" }] }).sort({ admNo: 1 })
  }
  const noOfStudents = students.length;
  const studentsperpage = await Student.find({ $and: [{ presentClass: teacherClass }, { programme: teacherProgramme }, { studentStatus: "current" }] })
    .sort({ gender: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  if (students.length == 0)
    return next(new Error("Error: no students found"));

  const pgnum = getEndOfPage(noOfStudents, pageSize)

  for (let i = 0; i < studentsperpage.length; i++) {
    // let date = studentsperpage[i].registeredOn.toString()
    // let dateonly = date.split(' ')
    // studentsperpage[i].dateOfRegistration = dateonly[0] + " " + dateonly[1]  + " " + dateonly[2]  + " " + dateonly[3]
    let serialno = (pageSize * pageNumber) - (pageSize - (i + 1))
    studentsperpage[i].serialNo = serialno;
  }
  res
    .status(200)
    .json({ status: "Success", students, studentsperpage, noOfStudents, page: pageNumber, pgnum });
};


const getOneStudent = async (req, res, next) => {
  const { admNo } = req.query;
  const student = await Student.findOne({ admNo });
  if (!student) return next(new Error("Error: no such student found!"));
  res.status(200).json({ status: "success", student, message: "student found" });
};


const getAllStudents = async (req, res, next) => {
  let pageNumber = +req.params.page || 1
  const pageSize = 10;

  const students = await Student.find({ studentStatus: "current" })
  const noOfStudents = students.length;
  if (!students) return next(new Error("Error: no students found"));

  const studentsperpage = await Student.find({ studentStatus: "current" })
    .sort({ admNo: 1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  const pgnum = getEndOfPage(noOfStudents, pageSize)

  for (let i = 0; i < studentsperpage.length; i++) {
    let date = studentsperpage[i].registeredOn.toString()
    let dateonly = date.split(' ')
    studentsperpage[i].dateOfRegistration = dateonly[0] + " " + dateonly[1] + " " + dateonly[2] + " " + dateonly[3]

    let serialno = (pageSize * pageNumber) - (pageSize - (i + 1))
    studentsperpage[i].serialNo = serialno;
  }
  res.status(200).json({ status: "success", studentsperpage, students, noOfStudents, page: pageNumber, pgnum });
};


const editStudent = async (req, res, next) => {
  const { error } = editStudentValidation(req.body);
  if (error) throw error;

  let { admNo } = req.body;
  const student = await Student.findOne({ admNo })
  if (!student) return next(new Error("Error: no such student found"));

  res
    .status(200)
    .json({ status: "success", message: "Student found", student });
};


const updateStudent = async (req, res, next) => {
  const { error } = updateStudentValidation(req.body);
  if (error) throw error;

  let { admNo } = req.body;
  const student = await Student.findOneAndUpdate({ admNo }, req.body, { new: true })
  if (!student) return next(new Error("Error: no such student found"));

  const parent = await User.findOne({ email: req.body.parentEmail })
  if (parent) {
    parent.userRole = "parent";
    parent.save()
  }

  const isStudent = await User.findOne({ email: req.body.email })
  if (isStudent) {
    isStudent.userRole = "student";
    isStudent.save()
  }
  // find student in scores database
  const inScores = await Score.findOne({ admissionNumber: req.body.admNo })
  if (inScores) {
    inScores.student_name = req.body.firstName + " " + req.body.lastName
    inScores.save()
  }
  
  // find student in billing database
  const inBilling = await Billing.findOne({ admissionNumber: req.body.admNo })
  if (inBilling) {
    inBilling.studentName = req.body.firstName + " " + req.body.lastName
    inBilling.save()
  }

  res
    .status(200)
    .json({ status: "success", message: "Student information is up-to-date", student });
};


const updateStatus = async (req, res, next) => {
  let { admNo } = req.query;
  let studentStatus = req.body.status
  let nonStudentStatus = req.body.statusReason

  if (studentStatus == "current") {
    const student = await Student.findOneAndUpdate({ admNo }, { studentStatus: "current", nonStudentStatus: "graduated" }, { new: true })
    if (!student) return next(new Error("Error: no such student found"));
  }

  if (studentStatus == "past") {
    const student = await Student.findOneAndUpdate({ admNo }, { studentStatus: "past", nonStudentStatus }, { new: true })
    if (!student) return next(new Error("Error: no such student found"));
    await Billing.findOneAndDelete({ admissionNumber: admNo })
  }

  res
    .status(200)
    .json({ status: "success", message: "Student's status has been updated" });
};

const promoteStudents = async (req, res, next) => {
  const { programme, sessionName, minscore } = req.body;
  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.teacherProgramme != programme) {
    throw new UnAuthorizedError("Error: Sorry, you are not allowed to promote students of other programmes")
  }
  const termRequest = await Score.find(
    {
      $and:
        [
          { programme },
          { "scores.sessionName": sessionName },
          { "scores.term.termName": "third" }
        ]
    })

  if (termRequest.length == 0) throw new NotFoundError("Error: no registered scores found");

  for (let i = 0; i < termRequest.length; i++) {
    const requestedsession = termRequest[i].scores.find(asession => asession.sessionName == sessionName)
    const requestedterm = requestedsession.term.find(aterm => aterm.termName == "third")
    if (requestedterm) { // if student has scores for the requested term
      const avgpercent = requestedterm.avgPercentage

      if (avgpercent < minscore) {
        await Student.findOneAndUpdate({ admNo: termRequest[i].admissionNumber }, { classStatus: "repeated" }, { new: true })
      }
      else if (avgpercent >= minscore) {
        const student = await Student.findOne({ admNo: termRequest[i].admissionNumber })

        switch (student.presentClass) {
          case "tamhidi":
            student.presentClass = "hadoonah"
            break;
          case "hadoonah":
            student.presentClass = "rawdoh"
            break;
          case "rawdoh":
            student.presentClass = "awwal ibtidaahiy"
            break;
          case "awwal ibtidaahiy":
            student.presentClass = "thaani ibtidaahiy"
            break;
          case "thaani ibtidaahiy":
            student.presentClass = "thaalith ibtidaahiy"
            break;
          case "thaalith ibtidaahiy":
            student.presentClass = "raabi ibtidaahiy"
            break;
          case "raabi ibtidaahiy":
            student.presentClass = "khaamis ibtidaahiy"
            break;
          case "khaamis ibtidaahiy":
            student.presentClass = "awwal idaadiy"
            break;
          case "awwal idaadiy":
            student.presentClass = "thaani idaadiy"
            break;
          case "thaani idaadiy":
            student.presentClass = "thaalith idaadiy"
            break;
          case "thaalith idaadiy":
            student.studentStatus = "past"
            break;
          case "awwal mutawasith":
            student.presentClass = "thaani mutawasith"
            break;
          case "thaani mutawasith":
            student.presentClass = "thaalith mutawasith"
            break;
          case "thaalith mutawasith":
            student.studentStatus = "past"
            break;
          case "al-awwal a-thaanawiy":
            student.presentClass = "a-thaani a-thaanawiy"
            break;
          case "a-thaani a-thaanawiy":
            student.presentClass = "a-thaalith a-thaanawiy"
            break;
          case "a-thaalith a-thaanawiy":
            student.studentStatus = "past"
            break;
          // default:  
        }
        student.classStatus = "promoted";
        if (student.programme == "barnamij" && student.presentClass == "thaalith idaadiy") {
          student.studentStatus = "past";
          student.presentClass = "thaani idaadiy"
        }
        if (student.programme == "barnamij" && student.presentClass == "thaalith ibtidaahiy") {
          student.presentClass = "awwal idaadiy"
        }
        if (student.programme == "female madrasah" && student.presentClass == "awwal idaadiy") {
          student.presentClass = "awwal mutawasith"
        }
        if ((student.programme == "adult madrasah") && student.presentClass == "thaalith idaadiy") {
          student.presentClass = "al-awwal a-thaanawiy"
          student.studentStatus = "current"
        }
        await student.save()
      }
    }
  }
  res.status(200).json({ status: "success", message: "Students have been successfully promoted" });
};

const promoteOneStudent = async (req, res, next) => {
  const { admNo, programme, promotionChoice, sessionName } = req.body;

  const student = await Student.findOne({ admNo })
  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.role != "superadmin") {
    if (isValidStaff.teacherProgramme != student.programme) {
      throw new UnAuthorizedError("Error: Sorry, you cannot promote a student of another programme")
    }
  }
  if (!student) throw new NotFoundError("Error: no such student found");
  if (promotionChoice == "merit") {
    const alreadyHasScores = await Score.findOne({ studentId: student._id })
    if (!alreadyHasScores) throw new NotFoundError("Error: no scores registered for this student");
    else {
      let result = alreadyHasScores.scores
      for (let count = 0; count < result.length; count++) {
        if (sessionName == result[count].sessionName) {
          let className = result[count].className
          switch (className) { // move student to the next class by changing the className of the session
            case "tamhidi":
              result[count].className = "hadoonah"
              break;
            case "hadoonah":
              result[count].className = "rawdoh"
              break;
            case "rawdoh":
              result[count].className = "awwal ibtidaahiy"
              break;
            case "awwal ibtidaahiy":
              result[count].className = "thaani ibtidaahiy"
              break;
            case "thaani ibtidaahiy":
              result[count].className = "thaalith ibtidaahiy"
              break;
            case "thaalith ibtidaahiy":
              result[count].className = "raabi ibtidaahiy"
              break;
            case "raabi ibtidaahiy":
              result[count].className = "khaamis ibtidaahiy"
              break;
            case "khaamis ibtidaahiy":
              result[count].className = "awwal idaadiy"
              break;
            case "awwal idaadiy":
              result[count].className = "thaani idaadiy"
              break;
            case "thaani idaadiy":
              result[count].className = "thaalith idaadiy"
              break;
            case "thaalith idaadiy":
              result[count].className = "past"
              break;
            case "awwal mutawasith":
              result[count].className = "thaani mutawasith"
              break;
            case "thaani mutawasith":
              result[count].className = "thaalith mutawasith"
              break;
            case "thaalith mutawasith":
              result[count].className = "thaalith mutawasith"
              break;
            // default:  
          }
        }
      }
      await alreadyHasScores.save()
    }
  }

  switch (student.presentClass) {
    case "tamhidi":
      student.presentClass = "hadoonah"
      break;
    case "hadoonah":
      student.presentClass = "rawdoh"
      break;
    case "rawdoh":
      student.presentClass = "awwal ibtidaahiy"
      break;
    case "awwal ibtidaahiy":
      student.presentClass = "thaani ibtidaahiy"
      break;
    case "thaani ibtidaahiy":
      student.presentClass = "thaalith ibtidaahiy"
      break;
    case "thaalith ibtidaahiy":
      student.presentClass = "raabi ibtidaahiy"
      break;
    case "raabi ibtidaahiy":
      student.presentClass = "khaamis ibtidaahiy"
      break;
    case "khaamis ibtidaahiy":
      student.presentClass = "awwal idaadiy"
      break;
    case "awwal idaadiy":
      student.presentClass = "thaani idaadiy"
      break;
    case "thaani idaadiy":
      student.presentClass = "thaalith idaadiy"
      break;
    case "thaalith idaadiy":
      student.studentStatus = "past"
      break;
    case "awwal mutawasith":
      student.presentClass = "thaani mutawasith"
      break;
    case "thaani mutawasith":
      student.presentClass = "thaalith mutawasith"
      break;
    case "thaalith mutawasith":
      student.studentStatus = "past"
      break;
    case "al-awwal a-thaanawiy":
      student.presentClass = "a-thaani a-thaanawiy"
      break;
    case "a-thaani a-thaanawiy":
      student.presentClass = "a-thaalith a-thaanawiy"
      break;
    case "a-thaalith a-thaanawiy":
      student.studentStatus = "past"
      break;
    default: throw new BadUserRequestError("Error: There was an error promoting this student");
  }
  student.classStatus = "promoted";
  if (student.programme == "barnamij" && student.presentClass == "thaalith idaadiy") {
    student.studentStatus = "past";
    student.presentClass = "thaani idaadiy"
  }
  if (student.programme == "barnamij" && student.presentClass == "thaalith ibtidaahiy") {
    student.presentClass = "awwal idaadiy"
  }
  if (student.programme == "female madrasah" && student.presentClass == "awwal idaadiy") {
    student.presentClass = "awwal mutawasith"
  }
  if ((student.programme == "adult madrasah") && student.presentClass == "thaalith idaadiy") {
    student.presentClass = "al-awwal a-thaanawiy"
    student.studentStatus = "current"
  }
  await student.save()

  res.status(200).json({ status: "success", message: "Student has been successfully promoted" });
};

const demoteStudent = async (req, res, next) => {
  const { admNo, programme } = req.body;

  const theStudent = await Student.findOne({ admNo })
  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.teacherProgramme != theStudent.programme) {
    throw new UnAuthorizedError("Error: Sorry, you cannot demote a student of another programme")
  }
  const student = await Student.findOne({ admNo })
  if (!student) throw new NotFoundError("Error: no such student found");

  switch (student.presentClass) {
    case "hadoonah":
      student.presentClass = "tamhidi"
      break;
    case "rawdoh":
      student.presentClass = "hadoonah"
      break;
    case "awwal ibtidaahiy":
      student.presentClass = "rawdoh"
      break;
    case "thaani ibtidaahiy":
      student.presentClass = "awwal ibtidaahiy"
      break;
    case "thaalith ibtidaahiy":
      student.presentClass = "thaani ibtidaahiy"
      break;
    case "raabi ibtidaahiy":
      student.presentClass = "thaalith ibtidaahiy"
      break;
    case "khaamis ibtidaahiy":
      student.presentClass = "raabi ibtidaahiy"
      break;
    case "awwal idaadiy":
      student.presentClass = "khaamis ibtidaahiy"
      break;
    case "thaani idaadiy":
      student.presentClass = "awwal idaadiy"
      break;
    case "thaalith idaadiy":
      student.presentClass = "thaani idaadiy";
      break;
    case "awwal mutawasith":
      student.presentClass = "khaamis ibtidaahiy"
      break;
    case "thaani mutawasith":
      student.presentClass = "awwal mutawasith"
      break;
    case "thaalith mutawasith":
      student.presentClass = "thaani mutawasith"
      break;
    case "al-awwal a-thaanawiy":
      student.presentClass = "thaalith idaadiy"
      break;
    case "a-thaani a-thaanawiy":
      student.presentClass = "al-awwal a-thaanawiy"
      break;
    case "a-thaalith a-thaanawiy":
      student.presentClass = "a-thaani a-thaanawiy"
      student.studentStatus = "current"
      break;
    default: throw new BadUserRequestError("Error: There was an error demoting this student")
  }

  if (student.programme == "barnamij" && student.presentClass == "thaani idaadiy") {
    student.studentStatus = "current"
  }
  if (student.programme == "barnamij" && student.presentClass == "awwal idaadiy") {
    student.presentClass == "thaani ibtidaahiy"
    student.studentStatus = "current"
  }
  if ((student.programme == "female madrasah") && student.presentClass == "thaalith mutawasith") {
    student.studentStatus = "current"
  }
  if ((student.programme == "adult madrasah") && student.presentClass == "al-awwal a-thaanawiy") {
          student.presentClass = "thaalith idaadiy"
          student.studentStatus = "current"
        }
  await student.save()

  res.status(200).json({ status: "success", message: "Student has been successfully demoted" });
};

const deleteStudent = async (req, res, next) => {
  let { admNo } = req.query;

  const student = await Student.findOne({ admNo });
  if (!student) return next(new Error("Error: no such student found"));

  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.teacherProgramme != student.programme) {
    throw new UnAuthorizedError("Error: Sorry, you are not allowed to delete students of other programmes")
  }

  await Student.findOneAndDelete({ admNo });
  await Score.findOneAndDelete({ admissionNumber: admNo })

  res.status(200).json({ status: "success", message: "student deleted successfully" });
};

const changeStudentsClass = async (req, res, next) => {
  const { studentsList } = req.body;
  const { proposedclass } = req.params;

  for (k = 0; k < studentsList.length; k++) {
    let admNo = studentsList[k]
    const student = await Student.findOneAndUpdate({ admNo }, { presentClass: proposedclass }, { new: true })
  }

  res.status(200).json({ status: "success", message: "The students' class has been successfully changed" });
};


module.exports = {
  addStudent,
  getStudents,
  getOneStudent,
  getStudentsByClass,
  getAllStudents,
  editStudent,
  updateStudent,
  updateStatus,
  promoteStudents,
  promoteOneStudent,
  demoteStudent,
  deleteStudent,
  changeStudentsClass
};

