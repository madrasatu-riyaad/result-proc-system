// const dbDebugger = require("debug")("app:db");
const Student = require("../models/studentModel");
const Staff = require("../models/staffModel");
const Score = require("../models/scoreModel");
const sClass = require("../models/classModel");
const CardDetails = require("../models/carddetailsModel");
const Attendance = require("../models/attendanceModel");
const { BadUserRequestError, NotFoundError, UnAuthorizedError } =
  require('../middleware/errors')


const addTermComment = async (req, res, next) => {
  const { admNo, sessionName, termName } = req.query;
  const { ameedComment } = req.body;

  const isStudent = await Student.findOne({ admNo })
  // check whether student exists in the scores database. if not, return error message
  if (!isStudent) {
    return next(new Error("Error: no such student found"));
  }
  const alreadyHasScores = await Score.findOne({ studentId: isStudent._id })

  if (!alreadyHasScores) throw new NotFoundError("Error: no scores registered for this student");
  else { // if yes, return all for the student in the session and year queried
    let result = alreadyHasScores.scores
    for (let count = 0; count < result.length; count++) {
      if (sessionName == result[count].sessionName) {
        //check for term
        for (let termcount = 0; termcount < result[count].term.length; termcount++) {
          if (termName == result[count].term[termcount].termName) {
            result[count].term[termcount].ameedComment = ameedComment
            alreadyHasScores.save()
          }
        }
      }
    }
  }
  res.status(201).json({ status: "success", message: "Comment added successfully" });
}


const addStudentsComments = async (req, res, next) => {
  const { className, termName, sessionName } = req.query;

  for (let n = 0; n < req.body.stdscomments.length; n++) {
    let admNo = req.body.stdscomments[n].admNo
    let comment = req.body.stdscomments[n].comment

    const theStudent = await Score.findOne({ admissionNumber: admNo })
    let result = theStudent.scores
    for (let count = 0; count < result.length; count++) {
      if (sessionName == result[count].sessionName && className == result[count].className) {
        //check for term
        for (let termcount = 0; termcount < result[count].term.length; termcount++) {
          if (termName == result[count].term[termcount].termName) {
            result[count].term[termcount].ameedComment = comment
          }
        }
      }
    }
    theStudent.save()
  }

  res.status(201).json({ status: "success", message: "Comments have been added successfully" });
}


const addScores = async (req, res, next) => {
  let termName = req.body.term.termName;
  const { admNo } = req.query

  // check whether details match any student of the school
  const isStudent = await Student.findOne({ admNo });
  if (!isStudent) {
    throw new BadUserRequestError("Error: No student with this admission number exists");
  }
  // check whether student exists in the scores database, if not, add their data
  const alreadyHasScores = await Score.findOne({ admissionNumber: admNo })
  if (!alreadyHasScores) {
    if (req.body.term.termName == 'third') {
      let noOfTerms = 1;
      for (let subjectcount = 0; subjectcount < req.body.term.subjects.length; subjectcount++) {
        req.body.term.subjects[subjectcount].cumulativeScore = +req.body.term.subjects[subjectcount].totalScore;
        req.body.term.subjects[subjectcount].cumulativeAverage = +req.body.term.subjects[subjectcount].cumulativeScore / noOfTerms;
      }
    }
    const addStudent = await Score.create({ ...req.body, studentId: isStudent._id, admissionNumber: isStudent.admNo, student_name: isStudent.firstName + " " + isStudent.lastName, programme: isStudent.programme });

    // calculate total and average percentage
    req.body.term.grandTotal = req.body.term.subjects.length * 100;
    console.log("grandtotal added")
    req.body.term.marksObtained = req.body.term.subjects.reduce((accumulator, score) => {
      return accumulator += (+score.totalScore);
    }, 0)
    console.log("marks obtained calculated")
    req.body.term.avgPercentage = (req.body.term.marksObtained / req.body.term.grandTotal) * 100
    console.log("avg percentage done", req.body.term.avgPercentage)

    addStudent.scores.push(req.body)
    addStudent.save()

    return res.status(201).json({ status: "success", addStudent, message: `${req.body.term.termName} term scores have been added for ${isStudent.firstName} ${isStudent.lastName}` });
  }
  // for existing session and term
  else {
    // update student's name in scores database
    if (alreadyHasScores.student_name != isStudent.firstName + " " + isStudent.lastName) alreadyHasScores.student_name = isStudent.firstName + " " + isStudent.lastName

    //check whether student has the subject's scores for the session and term specified
    let sessionName = req.body.sessionName;
    for (let scorescount = 0; scorescount < alreadyHasScores.scores.length; scorescount++) {
      if (sessionName == alreadyHasScores.scores[scorescount].sessionName) {
        for (let termcount = 0; termcount < alreadyHasScores.scores[scorescount].term.length; termcount++) {
          if (alreadyHasScores.scores[scorescount].term[termcount].termName == termName && alreadyHasScores.scores[scorescount].term[termcount].subjects.length != 0) {
            throw new BadUserRequestError("Error: Student already has scores for the requested term");
          }
          // for non-existing scores in a term
          else if (alreadyHasScores.scores[scorescount].term[termcount].termName == termName && alreadyHasScores.scores[scorescount].term[termcount].subjects.length == 0) {
            console.log("match seen here")
            //if not third term
            if (req.body.term.termName != 'third') {
              req.body.term.grandTotal = req.body.term.subjects.length * 100;
              console.log("grand total done", req.body.term.grandTotal)
              req.body.term.marksObtained = req.body.term.subjects.reduce((accumulator, score) => {
                return accumulator += (+score.totalScore);
              }, 0)
              console.log("marks obtained done", req.body.term.marksObtained)
              req.body.term.avgPercentage = (req.body.term.marksObtained / req.body.term.grandTotal) * 100
              console.log("avg percent done", req.body.term.avgPercentage)
            }
            else {   //if third term
              let noOfTerms = 1;
              let firstTermScore = [];
              let secondTermScore = [];

              const firstTerm = alreadyHasScores.scores[scorescount].term.find(aterm => aterm.termName == "first")
              const secondTerm = alreadyHasScores.scores[scorescount].term.find(aterm => aterm.termName == "second")

              for (let subjectcount = 0; subjectcount < req.body.term.subjects.length; subjectcount++) {

                if (firstTerm != undefined) {
                  let matchSubject1st = firstTerm.subjects.find(asubject => asubject.subjectName == `${req.body.term.subjects[subjectcount].subjectName}`)
                  firstTermScore[0] = matchSubject1st.totalScore
                }
                else firstTermScore[0] = 0;

                if (secondTerm != undefined) {
                  let matchSubject2nd = secondTerm.subjects.find(asubject => asubject.subjectName == `${req.body.term.subjects[subjectcount].subjectName}`)
                  secondTermScore[0] = matchSubject2nd.totalScore
                }
                else secondTermScore[0] = 0

                if ((firstTermScore[0] != 0 && secondTermScore[0] == 0) || (firstTermScore[0] == 0 && secondTermScore[0] != 0)) noOfTerms = 2
                else if (firstTermScore[0] != 0 && secondTermScore[0] != 0) noOfTerms = 3
                console.log("number of terms ", noOfTerms)

                req.body.term.subjects[subjectcount].cumulativeScore = +req.body.term.subjects[subjectcount].totalScore + (+firstTermScore[0]) + (+secondTermScore[0]);
                req.body.term.subjects[subjectcount].cumulativeAverage = +req.body.term.subjects[subjectcount].cumulativeScore / noOfTerms;
              }

              req.body.term.grandTotal = req.body.term.subjects.length * 100;
              console.log("third term grand total done", req.body.term.grandTotal)
              req.body.term.marksObtained = req.body.term.subjects.reduce((accumulator, subject) => {
                return accumulator += (+subject.cumulativeAverage);
              }, 0)
              console.log("third term marks obtained done", req.body.term.marksObtained)
              req.body.term.avgPercentage = (req.body.term.marksObtained / req.body.term.grandTotal) * 100
              console.log("third term avg percent done", req.body.term.avgPercentage)
            }

            alreadyHasScores.scores[scorescount].term[termcount].subjects = [...req.body.term.subjects]
            alreadyHasScores.scores[scorescount].term[termcount].comment = req.body.term.comment
            alreadyHasScores.scores[scorescount].term[termcount].grandTotal = req.body.term.grandTotal
            alreadyHasScores.scores[scorescount].term[termcount].marksObtained = req.body.term.marksObtained
            alreadyHasScores.scores[scorescount].term[termcount].avgPercentage = req.body.term.avgPercentage
            alreadyHasScores.save()
            return res.status(201).json({ status: "Success", alreadyHasScores, message: `${req.body.term.termName} term scores added successfully for the student` });
          }
        }
        // for non-existing term
        //if not third term
        if (req.body.term.termName != 'third') {
          req.body.term.grandTotal = req.body.term.subjects.length * 100;
          req.body.term.marksObtained = req.body.term.subjects.reduce((accumulator, score) => {
            return accumulator += (+score.totalScore);
          }, 0)
          req.body.term.avgPercentage = (req.body.term.marksObtained / req.body.term.grandTotal) * 100
        }
        else {   //if third term
          let noOfTerms = 1;
          let firstTermScore = [];
          let secondTermScore = [];

          const firstTerm = alreadyHasScores.scores[scorescount].term.find(aterm => aterm.termName == "first")
          const secondTerm = alreadyHasScores.scores[scorescount].term.find(aterm => aterm.termName == "second")

          for (let subjectcount = 0; subjectcount < req.body.term.subjects.length; subjectcount++) {

            if (firstTerm != undefined) {
              let matchSubject1st = firstTerm.subjects.find(asubject => asubject.subjectName == `${req.body.term.subjects[subjectcount].subjectName}`)
              if (!matchSubject1st) firstTermScore[0] = 0;
              else firstTermScore[0] = matchSubject1st.totalScore
            }
            else firstTermScore[0] = 0;

            if (secondTerm != undefined) {
              let matchSubject2nd = secondTerm.subjects.find(asubject => asubject.subjectName == `${req.body.term.subjects[subjectcount].subjectName}`)
              if (!matchSubject2nd) secondTermScore[0] = 0;
              else secondTermScore[0] = matchSubject2nd.totalScore
            }
            else secondTermScore[0] = 0

            if ((firstTermScore[0] != 0 && secondTermScore[0] == 0) || (firstTermScore[0] == 0 && secondTermScore[0] != 0)) noOfTerms = 2
            else if (firstTermScore[0] != 0 && secondTermScore[0] != 0) noOfTerms = 3
            req.body.term.subjects[subjectcount].cumulativeScore = +req.body.term.subjects[subjectcount].totalScore + (+firstTermScore[0]) + (+secondTermScore[0]);
            req.body.term.subjects[subjectcount].cumulativeAverage = +req.body.term.subjects[subjectcount].cumulativeScore / noOfTerms;
          }
          req.body.term.grandTotal = req.body.term.subjects.length * 100;
          req.body.term.marksObtained = req.body.term.subjects.reduce((accumulator, subject) => {
            return accumulator += (+subject.cumulativeAverage);
          }, 0)
          req.body.term.avgPercentage = (req.body.term.marksObtained / req.body.term.grandTotal) * 100
        }
        alreadyHasScores.scores[scorescount].term.push(req.body.term)
        alreadyHasScores.save()

        return res.status(201).json({ status: "Success", alreadyHasScores, message: `${req.body.term.termName} term scores added successfully for the student` });
      }
    }  // for non-existing session

    req.body.term.grandTotal = req.body.term.subjects.length * 100;
    req.body.term.marksObtained = req.body.term.subjects.reduce((accumulator, score) => {
      return accumulator += (+score.totalScore);
    }, 0)
    req.body.term.avgPercentage = (req.body.term.marksObtained / req.body.term.grandTotal) * 100
    console.log("stage3passed", req.body.term.avgPercentage)
    alreadyHasScores.scores.push(req.body)
    alreadyHasScores.save()

    return res.status(201).json({ status: "Success", alreadyHasScores, message: `${req.body.sessionName} ${req.body.term.termName} term scores for this student added successfully` });
    // }

  }
}


const getScores = async (req, res, next) => {

  const { admNo, termName, sessionName } = req.query;

  const isStudent = await Student.findOne({ admNo })
  // check whether student exists in the scores database
  //if not, return error message
  if (!isStudent) {
    return next(new Error("Error: no such student found"));
  }

  if (req.user.role == "admin") {
    const isValidStaff = await Staff.findOne({ email: req.user.email })
    if (isValidStaff.teacherProgramme != isStudent.programme) {
      throw new UnAuthorizedError("Error: Sorry, you are not allowed to view scores for students of other programmes")
    }
  }
  if (req.user.role == "parent") {
    if (req.user.email != isStudent.parentEmail)
      throw new BadUserRequestError("Error: you do not have access to this result. Input your ward's admission number");
  }
  if (req.user.other_role == "parent") {
    const isSameClass = await Staff.findOne({ email: req.user.email })
    if (isSameClass.teacherClass != isStudent.presentClass && req.user.email != isStudent.parentEmail)
      throw new BadUserRequestError("Error: you do not have access to this result. You're only able to view the results of your ward(s) or your students");
  }
  if (req.user.role == "student") {
    const isValidStudent = await Student.findOne({ email: req.user.email })
    if (admNo != isValidStudent.admNo)
      throw new BadUserRequestError("Error: you do not have access to this result. Input your admission number.");
  }
  const alreadyHasScores = await Score.findOne({ studentId: isStudent._id })
  if (!alreadyHasScores) throw new NotFoundError("Error: no scores registered for this student");
  else {

    // if yes, return all registered scores and attendance for the student in the session and year queried
    let result = alreadyHasScores.scores
    for (let count = 0; count < result.length; count++) {
      if (sessionName == result[count].sessionName) {
        let className = result[count].className
        let programme = alreadyHasScores.programme
        let noInClass;
        let teacherSignature;
        //check for the class details
        let classmatch = await sClass.findOne({ $and: [{ className }, { programme }] })
        const termInfo = classmatch.termlyDetails.find(
          asession => asession.sessionName === sessionName && asession.termName === termName
        );
        noInClass = termInfo?.noInClass;
        let classTeacherID = termInfo?.classTeacherId;
        if (classTeacherID) {
        let teacherSignatureURL = await Staff.findOne({ _id: classTeacherID })
        teacherSignature = teacherSignatureURL?.signatureUrl;
        }
    //check for term scores
    for (let termcount = 0; termcount < result[count].term.length; termcount++) {
      if (termName == result[count].term[termcount].termName) {
        let firstTermScore = []
        let secondTermScore = []
        let comment = result[count].term[termcount].comment
        let ameedComment = result[count].term[termcount].ameedComment
        let grandTotal = result[count].term[termcount].grandTotal
        let marksObtained = result[count].term[termcount].marksObtained
        let avgPercentage = result[count].term[termcount].avgPercentage
        let stdPosition = result[count].term[termcount].position
        let timesPresent = result[count].term[termcount].attendancePresent
        let timesAbsent = result[count].term[termcount].attendanceAbsent
        let report = result[count].term[termcount].subjects

        if (termName == 'third') {
          const firstTerm = result[count].term.find(aterm => aterm.termName == "first")
          const secondTerm = result[count].term.find(aterm => aterm.termName == "second")
          for (let subjectcount = 0; subjectcount < result[count].term[termcount].subjects.length; subjectcount++) {

            if (firstTerm != undefined) {
              let matchSubject1st = firstTerm.subjects.find(asubject => asubject.subjectName == result[count].term[termcount].subjects[subjectcount].subjectName)
              if (!matchSubject1st) { }
              else firstTermScore[subjectcount] = matchSubject1st.totalScore
            }
            else firstTermScore[subjectcount] = 0;

            if (secondTerm != undefined) {
              let matchSubject2nd = secondTerm.subjects.find(asubject => asubject.subjectName == result[count].term[termcount].subjects[subjectcount].subjectName)
              if (!matchSubject2nd) { }
              else secondTermScore[subjectcount] = matchSubject2nd.totalScore
            }
            else secondTermScore[subjectcount] = 0
          }
        }
        let reportcarddetails = await CardDetails.findOne({ programme: isStudent.programme })
        let maxAttendance = reportcarddetails.maxAttendance
        let nextTermDate = reportcarddetails.nextTermDate
        let principalSign = reportcarddetails.principalSignature
        let proprietorSign = reportcarddetails.proprietorSignature

        return res.status(200).json({
          status: "success", message: `${alreadyHasScores.student_name}`, termName, className, sessionName, report, comment, grandTotal, marksObtained, avgPercentage,
          stdPosition, firstTermScore, secondTermScore, timesPresent, timesAbsent, maxAttendance, noInClass, ameedComment, teacherSignature, principalSign, proprietorSign, nextTermDate
        });
      }
    }
  }
}
  }
throw new NotFoundError("Error: no scores found for the term specified")
}

const getTermlyScores = async (req, res, next) => {

  const { admNo, sessionName } = req.query;

  const isStudent = await Student.findOne({ admNo })

  // check whether student exists in the scores database
  //if not, return error message
  if (!isStudent) {
    return next(new Error("Error: no such student found"));
  }
  if ((req.user.role == "parent" && req.user.email != isStudent.parentEmail) || (req.user.other_role == "parent" && req.user.role == 'teacher' && req.user.email != isStudent.parentEmail)) {
    throw new BadUserRequestError("Error: you do not have access to this result. Input your ward's admission number");
  }
  const alreadyHasScores = await Score.findOne({ studentId: isStudent._id })

  if (!alreadyHasScores) throw new NotFoundError("Error: no scores registered for this student");
  else { // if yes, return all registerd scores for the student in the session queried
    let result = alreadyHasScores.scores
    for (let count = 0; count < result.length; count++) {
      if (sessionName == result[count].sessionName) {
        let report = result[count].term
        return res.status(200).json({ status: "success", message: `${alreadyHasScores.student_name}`, report });
      }
    }
  }
  throw new NotFoundError("Error: no scores found for the session specified")
}

const getScoresBySession = async (req, res, next) => {

  const { admNo } = req.query;

  const isStudent = await Student.findOne({ admNo })

  // check whether student exists in the scores database
  //if not, return error message
  if (!isStudent) {
    return next(new Error("Error: no such student found"));
  }
  if ((req.user.role == "parent" && req.user.email != isStudent.parentEmail) || (req.user.other_role == "parent" && req.user.role == 'teacher' && req.user.email != isStudent.parentEmail)) {
    throw new BadUserRequestError("Error: you do not have access to this result. Input your ward's admission number");
  }
  const alreadyHasScores = await Score.findOne({ studentId: isStudent._id })

  if (!alreadyHasScores) throw new NotFoundError("Error: no scores registered for this student");
  else { // if yes, return all registerd scores for the student in the session queried
    let result = alreadyHasScores.scores
    return res.status(200).json({ status: "success", message: `${alreadyHasScores.student_name}`, result });
  }
}

const getClassScores = async (req, res, next) => {
  const { className, termName, sessionName, programme } = req.query;
  let classExists = [];
  let classAttendance = [];
  const classRequest = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  if (!classRequest) throw new NotFoundError("Error: the requested class does not exist");
  const classSubjects = classRequest.subjects

  //attendance
  const attendanceExists = await Attendance.find(
    {
      $and:
        [
          { programme: programme },
          { "attendanceRecord.className": className },
          { "attendanceRecord.sessionName": sessionName },
          { "attendanceRecord.term.termName": termName },
        ]
    })

  if (attendanceExists.length != 0) {
    // filter the students that are in the requested class in the requested session from the students returned
    for (let n = 0; n < attendanceExists.length; n++) {
      const requestedclass = attendanceExists[n].attendanceRecord.find(asession => asession.sessionName == sessionName)
      const requestedterm = requestedclass.term.find(aterm => aterm.termName == termName)

      if (requestedclass.className == className && requestedterm !== undefined) {
        classAttendance.push(attendanceExists[n])
      }
    }
  }

  const detailsFound = await Score.find(
    {
      $and:
        [
          { programme: programme },
          { "scores.className": className },
          { "scores.sessionName": sessionName },
          { "scores.term.termName": termName },
        ]
    })
  if (detailsFound.length != 0) {
    // filter the students that are in the requested class in the requested session from the students returned
    for (let n = 0; n < detailsFound.length; n++) {
      const requestedclass = detailsFound[n].scores.find(asession => asession.sessionName == sessionName)
      const requestedterm = requestedclass.term.find(aterm => aterm.termName == termName)

      if (requestedclass.className == className && requestedterm !== undefined) {
        classExists.push(detailsFound[n])
      }
    }
  }
  if (classExists.length == 0 && attendanceExists.length == 0) throw new NotFoundError("Error: this class does not have any record for scores or attendance");
  if (detailsFound.length == 0 || classExists.length == 0) throw new NotFoundError("Error: no scores recorded for this class");

  res.status(200).json({ status: "success", message: "successful", classExists, classAttendance, classSubjects });
}

const updateScores = async (req, res, next) => {
  const { admNo } = req.query
  // console.log(req.body)

  // check whether details match any student of the school
  const isStudent = await Student.findOne({ admNo });
  if (!isStudent) {
    throw new BadUserRequestError("Error: No student with this admission number exists");
  }
  // check whether student exists in the scores database, if not, add their data
  const alreadyHasScores = await Score.findOne({ admissionNumber: admNo })
  if (!alreadyHasScores) {
    throw new NotFoundError("Error: No scores have been registered for this student");
  }
  else {// if yes, check whether student has the subject's scores for the session and term specified, update scores as appropriate
    const sessionName = req.body.sessionName;
    const termName = req.body.term.termName;
    for (let scorescount = 0; scorescount < alreadyHasScores.scores.length; scorescount++) {
      console.log("alreadyHasScores.scores[scorescount].sessionName is", alreadyHasScores.scores[scorescount].sessionName)

      if (sessionName == alreadyHasScores.scores[scorescount].sessionName) {
        for (let termcount = 0; termcount < alreadyHasScores.scores[scorescount].term.length; termcount++) {
          if (alreadyHasScores.scores[scorescount].term[termcount].termName == termName) {
            let totalOfAverages = 0; // for third term total of all subject average
            for (let subjectcount = 0; subjectcount < alreadyHasScores.scores[scorescount].term[termcount].subjects.length; subjectcount++) {
              if (req.body.term.subjects.subjectName == alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].subjectName) {
                console.log("match seen")
                req.body.term.subjects.totalScore = +req.body.term.subjects.testScore + +req.body.term.subjects.examScore;
                alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].testScore = +req.body.term.subjects.testScore;
                alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].examScore = +req.body.term.subjects.examScore;
                alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].totalScore = +req.body.term.subjects.totalScore;
                alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].remark = req.body.term.subjects.remark;
                if (req.body.term.comment != "") {
                  alreadyHasScores.scores[scorescount].term[termcount].comment = req.body.term.comment
                }
              }
              if (req.body.term.termName == 'third') {   //if third term
                let noOfTerms = 1;
                let firstTermScore = [];
                let secondTermScore = [];

                const firstTerm = alreadyHasScores.scores[scorescount].term.find(aterm => aterm.termName == "first")
                const secondTerm = alreadyHasScores.scores[scorescount].term.find(aterm => aterm.termName == "second")

                if (firstTerm != undefined) {
                  let matchSubject1st = firstTerm.subjects.find(asubject => asubject.subjectName == alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].subjectName)
                  if (!matchSubject1st) firstTermScore[0] = 0;
                  else firstTermScore[0] = matchSubject1st.totalScore
                }
                else firstTermScore[0] = 0;

                if (secondTerm != undefined) {
                  let matchSubject2nd = secondTerm.subjects.find(asubject => asubject.subjectName == alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].subjectName)
                  if (!matchSubject2nd) secondTermScore[0] = 0;
                  else secondTermScore[0] = matchSubject2nd.totalScore
                }
                else secondTermScore[0] = 0

                console.log(firstTermScore[0])
                console.log(secondTermScore[0])
                console.log(alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].totalScore)
                if ((firstTermScore[0] != 0 && secondTermScore[0] == 0) || (secondTermScore[0] == 0 && firstTermScore[0] != 0)) noOfTerms = 2
                else if (firstTermScore[0] != 0 && secondTermScore[0] != 0) noOfTerms = 3
                console.log("number of terms ", noOfTerms)

                alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].cumulativeScore = +alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].totalScore + (+firstTermScore[0]) + (+secondTermScore[0]);
                alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].cumulativeAverage = +alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].cumulativeScore / noOfTerms;
                // let subjectAvg =  alreadyHasScores.scores[scorescount].term[termcount].subjects[subjectcount].cumulativeAverage;
                // totalOfAverages += subjectAvg;
              }
              // }
            }
            alreadyHasScores.scores[scorescount].term[termcount].grandTotal = alreadyHasScores.scores[scorescount].term[termcount].subjects.length * 100;
            console.log("stage1 passed")
            if (req.body.term.termName == 'third') {
              alreadyHasScores.scores[scorescount].term[termcount].marksObtained = alreadyHasScores.scores[scorescount].term[termcount].subjects.reduce((accumulator, score) => {
                return accumulator += (+score.cumulativeAverage);
              }, 0)
            }
            else {
              alreadyHasScores.scores[scorescount].term[termcount].marksObtained = alreadyHasScores.scores[scorescount].term[termcount].subjects.reduce((accumulator, score) => {
                return accumulator += (+score.totalScore);
              }, 0)
            }
            console.log("stage2 passed")
            alreadyHasScores.scores[scorescount].term[termcount].avgPercentage = (alreadyHasScores.scores[scorescount].term[termcount].marksObtained / alreadyHasScores.scores[scorescount].term[termcount].grandTotal) * 100
            console.log("stage3 passed")

            alreadyHasScores.save();
            return res.status(200).json({ status: "Success", alreadyHasScores, message: `${req.body.term.subjects.subjectName} scores updated successfully` });
          }
        }
        throw new BadUserRequestError("Error: Student does not have scores for this term");
      }
    }
    throw new BadUserRequestError("Error: Student does not have scores for this session");
  }
}

const deleteScores = async (req, res, next) => {
  const { termName, sessionName, programme, admNo } = req.query
  const isValidStaff = await Staff.findOne({ email: req.user.email })
  if (isValidStaff.teacherProgramme != programme) {
    throw new UnAuthorizedError("Error: Sorry, you are not allowed to delete scores for students of other programmes")
  }

  // check whether details match any student of the school
  const isStudent = await Student.findOne({ admNo });
  if (!isStudent) {
    throw new BadUserRequestError("Error: No student with this admission number exists");
  }

  const alreadyHasScores = await Score.findOne({ studentId: isStudent._id })
  // check whether student exists in the scores database
  if (!alreadyHasScores) throw new NotFoundError("Error: no scores registered for this student");
  else { // if yes, return all registerd scores for the student in the session queried
    let result = alreadyHasScores.scores
    for (let count = 0; count < result.length; count++) {
      if (sessionName == result[count].sessionName) {
        const termRequest = result[count].term.find(aterm => aterm.termName == termName)
        if (!termRequest) throw new NotFoundError("Error: student has no scores registered for this term");
        const termToDelete = result[count].term.indexOf(termRequest)
        const delTerm = result[count].term.splice(termToDelete, 1)
        alreadyHasScores.save();
        return res.status(200).json({ status: "success", delTerm, message: `${alreadyHasScores.student_name}'s scores have been deleted for ${termName} term ${sessionName}` });
      }
    }
  }
  throw new NotFoundError("Error: no scores found for the session specified")
}

const generatePositons = async (req, res, next) => {
  const { className, termName, sessionName, programme } = req.query;
  let classExists = [];
  const classRequest = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  if (!classRequest) throw new NotFoundError("Error: the requested class does not exist");
  const detailsFound = await Score.find(
    {
      $and:
        [
          { programme: programme },
          { "scores.className": className },
          { "scores.sessionName": sessionName },
          { "scores.term.termName": termName },
        ]
    })

  if (detailsFound.length != 0) {
    // filter the students that are in the requested class in the requested session from the students returned
    for (let n = 0; n < detailsFound.length; n++) {
      const requestedclass = detailsFound[n].scores.find(asession => asession.sessionName == sessionName)
      const requestedterm = requestedclass.term.find(aterm => aterm.termName == termName)

      if (requestedclass.className == className && requestedterm !== undefined) {
        classExists.push(detailsFound[n])
      }
    }
  }
  if (detailsFound.length == 0 || classExists.length == 0) throw new NotFoundError("Error: no scores recorded for this class");

  // generate positions
  let classAverages = []
  let classPositions = [];
  let position = 0
  for (let i = 0; i < classExists.length; i++) {
    const requestedsession = classExists[i].scores.find(asession => asession.sessionName == sessionName)
    const requestedterm = requestedsession.term.find(aterm => aterm.termName == termName)
    if (!requestedterm) continue;  //if student has no report for the term, continue to the next

    classAverages.push(requestedterm.avgPercentage.toFixed(2))
    const classMember = {
      admno: classExists[i].admissionNumber,
      avg: requestedterm.avgPercentage.toFixed(2),
      position
    }
    position = position + 1
    classMember.position = position
    classPositions.push(classMember)
  }
  let sorted_array = classAverages.sort((a, b) => b - a);
  for (let n = 0; n < sorted_array.length; n++) {
    for (let m = 0; m < classPositions.length; m++) {
      if (classPositions[m].avg === sorted_array[n]) {
        classPositions[m].position = n + 1
      }
    }
  }
  // save positions to scores database
  for (let i = 0; i < classExists.length; i++) {
    const requestedsession = classExists[i].scores.find(asession => asession.sessionName == sessionName)
    const requestedterm = requestedsession.term.find(aterm => aterm.termName == termName)
    if (!requestedterm) continue;  //if student has no report for the term, continue to the next

    for (let j = 0; j < classPositions.length; j++) {
      if (classPositions[j].admno === classExists[i].admissionNumber) {
        requestedterm.position = classPositions[j].position
        classExists[i].save()
      }
    }
  }

  res.status(200).json({ status: "success", message: "successful" });
}

const generateAttendance = async (req, res, next) => {
  const { className, termName, sessionName, programme } = req.query;
  let classExists = [];
  let classAttendance = [];
  const classRequest = await sClass.findOne({
    $and:
      [
        { className },
        { programme }
      ]
  })
  if (!classRequest) throw new NotFoundError("Error: the requested class does not exist");
  const detailsFound = await Score.find(
    {
      $and:
        [
          { programme: programme },
          { "scores.className": className },
          { "scores.sessionName": sessionName },
          { "scores.term.termName": termName },
        ]
    })

  if (detailsFound.length != 0) {
    // filter the students that are in the requested class in the requested session from the students returned
    for (let n = 0; n < detailsFound.length; n++) {
      const requestedclass = detailsFound[n].scores.find(asession => asession.sessionName == sessionName)
      const requestedterm = requestedclass.term.find(aterm => aterm.termName == termName)

      if (requestedclass.className == className && requestedterm !== undefined) {
        classExists.push(detailsFound[n])
      }
    }
  }
  if (detailsFound.length == 0 || classExists.length == 0) throw new NotFoundError("Error: no scores recorded for this class");

  //attendance
  let reportcarddetails = await CardDetails.findOne({ programme })
  let maxAttendance = reportcarddetails.maxAttendance
  const attendanceExists = await Attendance.find(
    {
      $and:
        [
          { programme: programme },
          { "attendanceRecord.className": className },
          { "attendanceRecord.sessionName": sessionName },
          { "attendanceRecord.term.termName": termName },
        ]
    })

  if (attendanceExists.length == 0) throw new NotFoundError("Error: this class does not have any record for attendance");
  if (classExists.length == 0 && attendanceExists.length == 0) throw new NotFoundError("Error: this class does not have any record for scores or attendance");

  if (attendanceExists.length != 0) {
    // filter the students that are in the requested class in the requested session from the students returned
    for (let n = 0; n < attendanceExists.length; n++) {
      const requestedclass = attendanceExists[n].attendanceRecord.find(asession => asession.sessionName == sessionName)
      const requestedterm = requestedclass.term.find(aterm => aterm.termName == termName)

      if (requestedclass.className == className && requestedterm !== undefined) {
        classAttendance.push(attendanceExists[n])
      }
    }
  }

  // save attendance for each student to scores database
  for (let i = 0; i < classExists.length; i++) {
    const requestedsession = classExists[i].scores.find(asession => asession.sessionName == sessionName)
    const requestedterm = requestedsession.term.find(aterm => aterm.termName == termName)
    if (!requestedterm) continue;  //if student has no report for the term, continue to the next

    // calculate attendance present aand absent times for students 
    for (let j = 0; j < classAttendance.length; j++) {
      if (classAttendance[j].admissionNumber === classExists[i].admissionNumber) {
        let timesPresent = 0;
        const attendancesession = classAttendance[j].attendanceRecord.find(asession => asession.sessionName == sessionName)
        const attendanceterm = attendancesession.term.find(aterm => aterm.termName == termName)
        for (let k = 0; k < attendanceterm.attendance.length; k++) {
          if (attendanceterm.attendance[k].presence == 'yes') {
            timesPresent = timesPresent + 1
          }
        }
        requestedterm.attendancePresent = timesPresent
        requestedterm.attendanceAbsent = maxAttendance - timesPresent
        classExists[i].save()
      }
    }
  }

  res.status(200).json({ status: "success", message: "successful" });
}

// TROUBLESHOOTING FOR DUPLICATES IN SCORES DATABASE
// const getDuplicates = async (req, res, next) => {
//   let myArray = [];
//   const allstudents = await Student.find({})
//   console.log(allstudents.length)
//   for (let num=0; num < allstudents.length; num++){
//     let isdup = await Score.find({admissionNumber: allstudents[num].admNo})
//     if (isdup.length > 1 ){myArray.push(allstudents[num].admNo)}
//   }


//   res.status(200).json({ status: "success", message: "successful", myArray });
// }


module.exports =
{
  addScores,
  getScores,
  getTermlyScores,
  getScoresBySession,
  getClassScores,
  updateScores,
  addTermComment,
  addStudentsComments,
  deleteScores,
  generatePositons,
  generateAttendance
}


