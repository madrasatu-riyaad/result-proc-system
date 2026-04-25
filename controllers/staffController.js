const { MailNotSentError, BadUserRequestError, NotFoundError, UnAuthorizedError } =
  require('../middleware/errors')
require('dotenv').config();
const _ = require('lodash')
const User = require("../models/userModel");
const Staff = require("../models/staffModel");
const Class = require('../models/classModel');
const CardDetails = require("../models/carddetailsModel");
const Token = require('../models/tokenModel')

const {
  addStaffValidator,
  editStaffQueryValidator,
  updateStaffValidator,
  deleteStaffValidator
} = require("../validators/staffValidator");


const addStaff = async (req, res) => {
  const { error } = addStaffValidator(req.body)
  if (error) throw error

  const emailExists = await Staff.findOne({ email: req.body.email });
  if (emailExists) throw new BadUserRequestError("Error: An account with this email already exists");

  const role = req.body.role;
  let isAdmin = false;

  //allow only a superadmin to add other admin categories
  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.role != "superadmin" && (role === "superadmin" || role === "admin" || role === "bursar")) {
    throw new UnAuthorizedError(`Error: Sorry, you are not allowed to add someone as ${role}`)
  }

  if (role === "bursar") {
    const bursarExists = await Staff.findOne({ role: "bursar" });
    if (bursarExists) throw new BadUserRequestError("Error: A bursar is already registered");
  }
  if (role === "superadmin" || role === "admin" || role === "bursar") {
    req.body.isAdmin = true;
    isAdmin = true;
  }
  const user = await User.findOneAndUpdate({ email: req.body.email }, { userRole: role, isAdmin }, {
    new: true,
  });
  const newStaffer = await Staff.create(req.body);

  res.status(200).json({
    status: "Success",
    message: `Successfully added as ${role}`,
    staffer: _.pick(newStaffer, ['stafferName', 'email', 'stafferRole', 'isAdmin'])
  })
}

// check if page returned is the last
function getEndOfPage(staffNum, pgSize) {
  let lastpage;
  const wholediv = Math.floor(staffNum / pgSize);
  const modulus = staffNum % pgSize;
  if (modulus == 0) lastpage = wholediv;
  else lastpage = wholediv + 1;
  // console.log(lastpage)
  return lastpage
}

const getStaff = async (req, res, next) => {
  let pageNumber = +req.params.page || 1;
  const pageSize = 10;

  const staff = await Staff.find({})
    .sort({ role: 1 })
    .select('_id stafferName email gender address phoneNumber role isAdmin')
  if (!staff) throw new NotFoundError("Error: no staff found");
  const noOfStaff = staff.length;

  const staffperpage = await Staff.find({})
    .sort({ role: 1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  const pgnum = getEndOfPage(noOfStaff, pageSize)

  for (let i = 0; i < staffperpage.length; i++) {
    let serialno = (pageSize * pageNumber) - (pageSize - (i + 1))
    staffperpage[i].serialNo = serialno;
  }

  res.status(200).json({
    status: "Success",
    staff,
    staff_list: staffperpage,
    noOfStaff,
    page: pageNumber,
    pgnum
  });
};

const getTeachers = async (req, res, next) => {
  let pageNumber = +req.params.page || 1;
  const pageSize = 7;

  const teachers = await Staff.find({ role: "teacher" })
    .sort({ stafferName: 1 })
    .select('_id stafferName email gender address phoneNumber role isAdmin teacherClass teacherProgramme')
  if (!teachers) throw new NotFoundError("Error: no teachers found");

  const noOfStaff = teachers.length;

  const teachersperpage = await Staff.find({ role: "teacher" })
    .sort({ gender: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  const pgnum = getEndOfPage(noOfStaff, pageSize)

  for (let i = 0; i < teachersperpage.length; i++) {
    let serialno = (pageSize * pageNumber) - (pageSize - (i + 1))
    teachersperpage[i].serialNo = serialno;
  }

  res.status(200).json({
    status: "Success",
    teachers,
    teachers_list: teachersperpage,
    noOfStaff,
    page: pageNumber,
    pgnum
  });
};

const getClassesAssigned = async (req, res, next) => {
  const role = req.user.role;
  let email;
  if (req.query.email == 'undefined') email = req.user.email;
  else email = req.query.email;

  const teacher = await Staff.findOne({ email })
  if (!teacher) throw new NotFoundError("Error: This email is not associated with any staffer");

  let assignedClasses = teacher.assignedClasses;
  if (assignedClasses.length == 0 && (teacher.teacherClass == "nil" && teacher.teacherProgramme == "nil")) throw new BadUserRequestError("Error: Staffer has not been assigned to any class");

  // add the teacher's primary assigned class to array of assigned classes
  let assignedClassExist = assignedClasses.find(aclass => aclass.class == teacher.teacherClass && aclass.programme == teacher.teacherProgramme)
  if (!assignedClassExist && (teacher.teacherClass != "nil" && teacher.teacherProgramme != "nil")) {
    let newClass = {
      class: teacher.teacherClass,
      programme: teacher.teacherProgramme
    }
    teacher.assignedClasses.push(newClass);
    teacher.save()
  }
  res.status(200).json({
    status: "Success",
    message: "Classes assigned successfully returned, see details below",
    assignedClasses
  });
};

const getTeacherClass = async (req, res, next) => {
  const teacher = await Staff.findOne({ email: req.user.email })
    .select('teacherClass teacherProgramme')
 
  if (!teacher) throw new NotFoundError("Error: You have not been assigned as a teacher");
  res.status(200).json({
    status: "Success",
    message: "Teacher class and programme successfully returned",
    teacher
  });
};

const assignAsTeacher = async (req, res, next) => {
  const { email, teacherClass, teacherProgramme } = req.body
  const teacher = await Staff.findOne({ email })
  if (!teacher) throw new NotFoundError("Error: no such staff found");

  if (req.user.role != "superadmin") {
    const isValidStaff = await Staff.findOne({ email: req.user.email })
    if (isValidStaff.teacherProgramme != teacherProgramme) {
      throw new UnAuthorizedError("Error: Sorry, you are not allowed to assign teachers of other programmes")
    }
  }
  let requestedClass = teacher.assignedClasses.find(aclass => aclass.class == teacherClass && aclass.programme == teacherProgramme)
  if (requestedClass || (teacher.teacherClass == teacherClass && teacher.teacherProgramme == teacherProgramme)) throw new BadUserRequestError(`Error: this staffer has already been assigned to ${teacherClass} in ${teacherProgramme}`)

  let newClass = {
    class: teacherClass,
    programme: teacherProgramme
  }
  teacher.assignedClasses.push(newClass);
  if (teacher.teacherClass == "nil" && teacher.teacherProgramme == "nil") { // teacher has no primary class
    teacher.teacherClass = teacherClass;
    teacher.teacherProgramme = teacherProgramme;
  }
  teacher.save();

  res.status(200).json({
    status: "Success",
    message: `Teacher successfully assigned to ${teacherClass} in ${teacherProgramme}`,
    teacher
  });
};

const deassignTeacher = async (req, res, next) => {
  const { email, teacherClass, teacherProgramme } = req.body
  const teacher = await Staff.findOne({ email })
  if (!teacher) throw new NotFoundError("Error: no such staff found");

  if (req.user.role != "superadmin") {
    const isValidStaff = await Staff.findOne({ email: req.user.email })
    if (isValidStaff.teacherProgramme != teacherProgramme) {
      throw new UnAuthorizedError("Error: Sorry, you are not allowed to deassign teachers of other programmes")
    }
  }
  // check if staffer has any assigned classes
  if (teacher.assignedClasses.length == 0) {
    throw new BadUserRequestError("Error: no assigned classes found for the staffer ")
  }
  // check for existence of requested class and programme
  let requestedClass = teacher.assignedClasses.find(aclass => aclass.class == teacherClass && aclass.programme == teacherProgramme)
  if (!requestedClass && (teacher.teacherClass != teacherClass || teacher.teacherProgramme != teacherProgramme)) throw new BadUserRequestError(`Error: this staffer has not been assigned to ${teacherClass} in ${teacherProgramme}`)
  else {
    if (requestedClass) { //class to delete is found in assigned classes
      let classToDelete = teacher.assignedClasses.indexOf(requestedClass)
      teacher.assignedClasses.splice(classToDelete, 1);
    }
    if (teacher.teacherClass == teacherClass && teacher.teacherProgramme == teacherProgramme) { //class to delete is found as the primary class
      if (teacher.assignedClasses.length != 0) {
        for (let n = 0; n < teacher.assignedClasses.length; n++) {
          if (teacher.assignedClasses[n].class != teacherClass || teacher.assignedClasses[n].programme != teacherProgramme) {
            teacher.teacherClass = teacher.assignedClasses[n].class
            teacher.teacherProgramme = teacher.assignedClasses[n].programme
          }
        }
      }
      else { //assigned classes array is empty
        teacher.teacherClass = "nil"
        teacher.teacherProgramme = "nil"
      }
    }
  }
  teacher.save();

  res.status(200).json({
    status: "Success",
    message: `Teacher successfully deassigned from ${teacherClass} in ${teacherProgramme}`,
    teacher
  });
};

const editStaffQuery = async (req, res, next) => {
  const { error } = editStaffQueryValidator(req.body);
  if (error) throw error;

  let { email } = req.body;
  const staffer = await Staff.findOne({ email })
  if (!staffer) throw new NotFoundError("Error: no such staffer found");

  const user = await User.findOne({ email })
  if (!user) throw new NotFoundError("Error: This staff is not registered. They need to sign up before their details can be updated");

  res
    .status(200)
    .json({ status: "success", message: "Staffer found", staffer, user });
};

const updateStaff = async (req, res, next) => {
  const { error } = updateStaffValidator(req.body);
  if (error) throw error;
  const userRole = req.body.role;
  const otherRole = req.body.other_role;

  const { email } = req.body;

  const user = await User.findOneAndUpdate({ email: req.body.email }, { userRole, otherRole }, { new: true });
  if (!user) throw new NotFoundError("Error: This staff is not registered. They need to sign up before their details can be updated");
  if (userRole == "admin") user.isAdmin = true
  else user.isAdmin = false
  user.save()

  const staffer = await Staff.findOneAndUpdate({ email }, req.body, { new: true })
  if (!staffer) throw new NotFoundError("Error: the staffer does not exist");
  if (userRole == "admin") staffer.isAdmin = true
  else staffer.isAdmin = false
  staffer.save()

  res
    .status(200)
    .json({ status: "success", message: "Staffer information is up-to-date", staffer });
};


const deleteStaff = async (req, res, next) => {
  const { error } = deleteStaffValidator(req.body);
  if (error) throw error;

  let { email } = req.body;
  const staff = await Staff.findOneAndUpdate({ isActive: false }, { new: true });
  if (!staff) throw new NotFoundError("Error: no such staff found");

  const user = await User.findOneAndDelete({ email });
  if (!user) throw new NotFoundError("Error: This user is not yet registered, but has been removed as a staffer");

  res.status(200).json({ status: "success", message: "Staff has been archived and details removed from user database" });
};


// set report card details for a programme
const setDetails = async (req, res, next) => {
  const { programme } = req.query;

  const isValidStaff = await Staff.findOne({ email: req.user.email });
  if (isValidStaff.teacherProgramme != programme) {
    throw new UnAuthorizedError(
      "Error: Sorry, you are not allowed to set details of other programmes"
    );
  }

  const { maxAttendance, nextTermDate, carddetailsSession, carddetailsTerm } = req.body;
    let sessionName = carddetailsSession;
  let termName = carddetailsTerm;
  
  // create or update card details
  let detailsExist = await CardDetails.findOne({ programme });
  if (!detailsExist) {
    detailsExist = await CardDetails.create({ ...req.body, programme });
  } else {
    detailsExist.maxAttendance = maxAttendance;
    detailsExist.nextTermDate = nextTermDate;
    await detailsExist.save();
  }
  // RELEASE LOGIC: update all classes under this programme for this session and term
  const classes = await Class.find({ programme });
  for (const cls of classes) {
       const term = cls.termlyDetails.find(
      (t) => t.sessionName === sessionName && t.termName === termName
    );
    if (term) {
      term.released = true;
    } else {
      // if term doesn't exist yet, add it and release
      cls.termlyDetails.push({
        sessionName,
        termName,
        released: true,
      });
    }
    await cls.save();
  }

  res.status(detailsExist.isNew ? 201 : 200).json({
    status: "Success",
    message: detailsExist.isNew
      ? "Details added successfully and classes released"
      : "Details updated successfully and classes released",
    detailsExist,
  });
};

// allow a teacher switch btw classes
const switchClasses = async (req, res, next) => {
  const { teacherClass, teacherProgramme } = req.body
  const teacher = await Staff.findOne({ email: req.user.email })
  if (!teacher) throw new NotFoundError("Error: no such staff found");

  teacher.teacherClass = teacherClass;
  teacher.teacherProgramme = teacherProgramme;
  teacher.save();

  res.status(200).json({
    status: "Success",
    message: `You have successfully been assigned to ${teacherClass} in ${teacherProgramme}`,
    teacher
  });
};

module.exports = { addStaff, getStaff, getTeachers, getTeacherClass, getClassesAssigned, assignAsTeacher, deassignTeacher, editStaffQuery, updateStaff, deleteStaff, setDetails, switchClasses }