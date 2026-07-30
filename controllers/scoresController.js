// const dbDebugger = require("debug")("app:db");
const Student = require("../models/studentModel");
const Staff = require("../models/staffModel");
const Score = require("../models/scoreModel");
const sClass = require("../models/classModel");
const CardDetails = require("../models/carddetailsModel");
const Attendance = require("../models/newAttendanceModel");
const AttendanceTracker = require("../models/attendanceTrackingModel");
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

const calculateTotals = (term) => {
  term.grandTotal = term.subjects.length * 100;
  term.marksObtained = term.subjects.reduce((acc, s) => acc + (+s.totalScore), 0);
  term.avgPercentage = (term.marksObtained / term.grandTotal) * 100;
};

const calculateThirdTermCumulative = (termData, session) => {
  const firstTerm = session.term.find(t => t.termName === "first");
  const secondTerm = session.term.find(t => t.termName === "second");

  termData.subjects.forEach(subject => {
    const firstScore =
      firstTerm?.subjects.find(
        s => s.subjectName === subject.subjectName
      )?.totalScore || 0;
    const secondScore =
      secondTerm?.subjects.find(
        s => s.subjectName === subject.subjectName
      )?.totalScore || 0;
    let noOfTerms = 0;

    if (+firstScore > 0) noOfTerms++;
    if (+secondScore > 0) noOfTerms++;
    if (+subject.totalScore > 0) noOfTerms++;

    subject.cumulativeScore =
      (+subject.totalScore) +
      (+firstScore) +
      (+secondScore);
    subject.cumulativeAverage =
      noOfTerms > 0
        ? subject.cumulativeScore / noOfTerms
        : 0;
  });

  const assessedSubjects = termData.subjects.filter(
    s => (+s.testScore > 0 || +s.examScore > 0)
  );
  termData.grandTotal = assessedSubjects.length * 100;
  termData.marksObtained = termData.subjects.reduce(
    (acc, s) => acc + (+s.cumulativeAverage || 0),
    0
  );
  termData.avgPercentage =
    termData.grandTotal > 0
      ? (termData.marksObtained / termData.grandTotal) * 100
      : 0;
};


const addScores = async (req, res, next) => {
  const termName = req.body.term.termName;
  const { admNo } = req.query;

  // to remove later
  console.log("========== SCORE ENTRY ==========");
  console.log({
    teacher: req.user?.email || req.user?._id,
    student: admNo,
    session: req.body.sessionName,
    className: req.body.className,
    term: termName,
    subjects: req.body.term.subjects
  });
  console.log("=================================");

  // Check student exists
  const student = await Student.findOne({ admNo });
  if (!student) throw new BadUserRequestError("No student with this admission number exists");

  // Find or create score document
  let scoreDoc = await Score.findOne({ admissionNumber: admNo });
  const termData = { ...req.body.term, subjects: [...req.body.term.subjects] };

  if (!scoreDoc) {
    if (termName === 'third') calculateThirdTermCumulative(termData, { term: [] });
    else calculateTotals(termData);

    scoreDoc = await Score.create({
      studentId: student._id,
      admissionNumber: student.admNo,
      student_name: `${student.firstName} ${student.lastName}`,
      programme: student.programme,
      scores: [{ sessionName: req.body.sessionName, className: req.body.className, term: [termData] }]
    });

    return res.status(201).json({
      status: "success",
      scoreDoc,
      message: `${termName} term scores added for ${student.firstName} ${student.lastName}`
    });
  }

  // Existing score document → check session
  let session = scoreDoc.scores.find(s => s.sessionName === req.body.sessionName);
  if (!session) {
    if (termName === 'third') calculateThirdTermCumulative(termData, { term: [] });
    else calculateTotals(termData);

    scoreDoc.scores.push({ sessionName: req.body.sessionName, className: req.body.className, term: [termData] });
    await scoreDoc.save();
    return res.status(201).json({ status: "success", scoreDoc, message: `${termName} term scores added` });
  }

  // Session exists → check term
  let existingTerm = session.term.find(t => t.termName === termName);
  if (existingTerm) {
    if (existingTerm.subjects.length) throw new BadUserRequestError("Student already has scores for this term");

    if (termName === 'third') calculateThirdTermCumulative(termData, session);
    else calculateTotals(termData);

    existingTerm.subjects = [...termData.subjects];
    existingTerm.comment = termData.comment;
    existingTerm.grandTotal = termData.grandTotal;
    existingTerm.marksObtained = termData.marksObtained;
    existingTerm.avgPercentage = termData.avgPercentage;
  } else {
    if (termName === 'third') calculateThirdTermCumulative(termData, session);
    else calculateTotals(termData);

    session.term.push(termData);
  }

  await scoreDoc.save();
  return res.status(201).json({ status: "success", scoreDoc, message: `${termName} term scores added successfully` });
};


const canViewResult = (sessionName, termName, released, currentSession, currentTerm) => {

  const sessionOrder = {
    "2023/2024": 1,
    "2024/2025": 2,
    "2025/2026": 3
  };

  const termOrder = {
    first: 1,
    second: 2,
    third: 3
  };

  const sessionRank = sessionOrder[sessionName];
  const termRank = termOrder[termName?.toLowerCase()];

  const currentSessionRank = sessionOrder[currentSession];
  const currentTermRank = termOrder[currentTerm?.toLowerCase()];

  if (!sessionRank || !termRank || !currentSessionRank || !currentTermRank) {
    return false;
  }

  // FUTURE TERM → NOT AVAILABLE
  const isFuture =
    sessionRank > currentSessionRank ||
    (sessionRank === currentSessionRank && termRank > currentTermRank);

  if (isFuture) return null;

  // CUT-OFF LOGIC (legacy + new system support)
  const cutoffSession = sessionOrder["2025/2026"];
  const cutoffTerm = termOrder["second"];

  const isBeforeCutoff =
    sessionRank < cutoffSession ||
    (sessionRank === cutoffSession && termRank < cutoffTerm);

  return isBeforeCutoff || released === true;
};


const getScores = async (req, res, next) => {
  const { admNo, termName, sessionName, className: inputClassName } = req.query;
  const isStudent = await Student.findOne({ admNo });
  if (!isStudent) {
    return next(new Error("Error: no such student found"));
  }

  if (req.user.role == "parent") {
    if (req.user.email != isStudent.parentEmail) {
      throw new BadUserRequestError(
        "Error: you do not have access to this result. Input your ward's admission number"
      );
    }
  }

  if (req.user.other_role == "parent") {
    const isSameClass = await Staff.findOne({ email: req.user.email });
    if (
      isSameClass.teacherClass != isStudent.presentClass &&
      req.user.email != isStudent.parentEmail
    ) {
      throw new BadUserRequestError(
        "Error: you do not have access to this result. You're only able to view your ward(s) or students"
      );
    }
  }

  if (req.user.role == "student") {
    const isValidStudent = await Student.findOne({ email: req.user.email });
    if (admNo != isValidStudent.admNo) {
      throw new BadUserRequestError(
        "Error: you do not have access to this result. Input your admission number."
      );
    }
  }
  const alreadyHasScores = await Score.findOne({ studentId: isStudent._id });
  if (!alreadyHasScores) {
    throw new NotFoundError("Error: no scores registered for this student");
  }
  const result = alreadyHasScores.scores;

  // ======================
  // MAIN LOOP
  // ======================
  for (let count = 0; count < result.length; count++) {
    if (sessionName != result[count].sessionName) continue;
    let className = result[count].className;
    // if className is not found in student record
    if (!className) {
      if (!inputClassName) {
        return res.status(400).json({
          status: "needs_classname",
          message:
            "Your class is not set. Please enter the class for which you are requesting the result."
        });
      }

      className = inputClassName;
    }

    const programme = alreadyHasScores.programme;
    let teacherSignature;

    const classmatch = await sClass.findOne({
      className,
      programme
    });

    let termInfo = classmatch?.termlyDetails.find(
      t => t.sessionName === sessionName && t.termName === termName
    );

    if (!termInfo) {
      termInfo = {};
    }

    if (programme == "children madrasah" || programme == "adult madrasah") {
      const current = await AttendanceTracker.findOne({ programme });
      if (!current) {
        throw new Error("Current term and session not yet set for programme");
      }
      const currentSession = current.sessionName;
      const currentTerm = current.termName;

      // ======================
      // RELEASE CHECK (parents & students only)
      // ======================
      if (req.user.role === "student" || req.user.role === "parent" || req.user.other_role == "parent") {

        // Only enforce release if term details exist
        if (termInfo.released !== undefined) {

          if (termInfo.released !== true) {
            return res.status(403).json({
              status: "failed",
              message: "Results for this term have not been released yet"
            });
          }

          const isReleased = canViewResult(
            sessionName,
            termName,
            termInfo.released,
            currentSession,
            currentTerm
          );

          if (isReleased === null) {
            throw new NotFoundError(
              "Error: no scores found for the term specified"
            );
          }
        }
      }
    }
    // ======================
    // TERM DATA
    // ======================
    const termData = result[count].term.find(
      t => t.termName === termName
    );

    if (!termData) continue;

    let firstTermScore = [];
    let secondTermScore = [];

    const {
      comment,
      ameedComment,
      grandTotal,
      marksObtained,
      avgPercentage,
      position: stdPosition,
      attendancePresent: timesPresent,
      attendanceAbsent: timesAbsent,
      subjects: report
    } = termData;

    // ======================
    // THIRD TERM LOGIC
    // ======================
    if (termName === "third") {

      const firstTerm = result[count].term.find(t => t.termName === "first");
      const secondTerm = result[count].term.find(t => t.termName === "second");

      for (let i = 0; i < report.length; i++) {

        const subjectName = report[i].subjectName;

        firstTermScore[i] =
          firstTerm?.subjects.find(s => s.subjectName === subjectName)
            ?.totalScore || 0;

        secondTermScore[i] =
          secondTerm?.subjects.find(s => s.subjectName === subjectName)
            ?.totalScore || 0;
      }
    }

    // ======================
    // CLASS METADATA
    // ======================
    const noInClass = termInfo?.noInClass;

    if (termInfo?.classTeacherId) {
      const teacher = await Staff.findOne({
        _id: termInfo.classTeacherId
      });

      teacherSignature = teacher?.signatureUrl;
    }

    const reportcarddetails = await CardDetails.findOne({
      programme: isStudent.programme
    });

    // ======================
    // RESPONSE
    // ======================
    return res.status(200).json({
      status: "success",
      message: `${alreadyHasScores.student_name}`,
      termName,
      className,
      sessionName,
      report,
      comment,
      grandTotal,
      marksObtained,
      avgPercentage,
      stdPosition,
      firstTermScore,
      secondTermScore,
      timesPresent,
      timesAbsent,
      maxAttendance: reportcarddetails?.maxAttendance,
      noInClass,
      ameedComment,
      teacherSignature,
      principalSign: reportcarddetails?.principalSignature,
      proprietorSign: reportcarddetails?.proprietorSignature,
      nextTermDate: reportcarddetails?.nextTermDate
    });
  }

  throw new NotFoundError("Error: no scores found for the term specified");
};

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
  let unscoredStudents = [];

  const classRequest = await sClass.findOne({
    className,
    programme
  });

  if (!classRequest)
    throw new NotFoundError("Error: the requested class does not exist");

  const classSubjects = classRequest.subjects;

  // Get ALL students in class (source of truth)
  const allStudents = await Student.find({
    programme,
    presentClass: className
  });

  if (allStudents.length === 0)
    throw new NotFoundError("No students found in this class");

  // Get score documents
  const detailsFound = await Score.find({
    programme,
    "scores.className": className,
    "scores.sessionName": sessionName,
  });

  // If no scores at all
  if (detailsFound.length === 0) {
    for (let student of allStudents) {
      if (student.studentStatus !== "past") {
        unscoredStudents.push(student);
      }
    }

    return res.status(200).json({
      status: "success",
      message: "No scores have been recorded yet for this class",
      classExists: [],
      unscoredStudents,
      unscoredCount: unscoredStudents.length,
      classSubjects,
    });
  }

  const scoredStudentIds = new Set();

  // Extract scored students for this term
  for (let n = 0; n < detailsFound.length; n++) {
    const requestedclass = detailsFound[n].scores.find(
      s => s.sessionName == sessionName && s.className == className
    );

    if (!requestedclass) continue;

    const requestedterm = requestedclass.term.find(
      t => t.termName == termName
    );

    if (requestedterm) {
      scoredStudentIds.add(String(detailsFound[n].studentId));

      // ✅ KEEP FULL SCORE DOCUMENT STRUCTURE (your requirement)
      classExists.push({
        ...detailsFound[n]._doc,
        term: requestedterm       // ensure correct term only
      });
    }
  }

  if (classExists.length === 0) {
    throw new NotFoundError(
      `No ${termName} term scores recorded for this class`
    );
  }

  // Build unscored students list
  for (let student of allStudents) {
    if (
      student.studentStatus !== "past" &&
      !scoredStudentIds.has(String(student._id))
    ) {
      unscoredStudents.push(student);
    }
  }

  // ================= Attendance Summary =================
  let attendanceSummary = null;

  const tracker = await AttendanceTracker.findOne({
    programme,
    sessionName,
    termName,
  });

  if (tracker) {
    const excludedDates = new Set(
      (tracker.excludedDates || []).map(date =>
        new Date(date).toDateString()
      )
    );

    const expectedDates = [];
    const current = new Date(tracker.startDate);

    const today = new Date();
    const last =
      today < new Date(tracker.endDate)
        ? today
        : new Date(tracker.endDate);

    while (current <= last) {
      const dayName = current.toLocaleDateString("en-US", {
        weekday: "long",
      });

      const dateString = current.toDateString();

      if (
        tracker.teachingDays.includes(dayName) &&
        !excludedDates.has(dateString)
      ) {
        expectedDates.push(dateString);
      }

      current.setDate(current.getDate() + 1);
    }

    const attendanceDoc = await Attendance.findOne({
      className,
      programme,
      sessionName,
      termName,
    }).lean();

    const recordedDates = attendanceDoc
      ? new Set(
        attendanceDoc.attendanceRecord.map(record =>
          new Date(record.termdate).toDateString()
        )
      )
      : new Set();

    const expectedDays = expectedDates.length;
    const recordedDays = recordedDates.size;

    const completion =
      expectedDays === 0
        ? 0
        : Number(
          ((recordedDays / expectedDays) * 100).toFixed(2)
        );

    attendanceSummary = {
      expectedDays,
      recordedDays,
      completion,
    };
  }

  return res.status(200).json({
    status: "success",
    message: "successful",
    classExists,
    unscoredStudents,
    unscoredCount: unscoredStudents.length,
    classSubjects,
    attendanceSummary,
  });
};


const updateScores = async (req, res, next) => {
  const { admNo } = req.query;
  const reqSubject = req.body.term.subjects; // single subject object

  // 1️⃣ Check student exists
  const isStudent = await Student.findOne({ admNo });
  if (!isStudent) {
    throw new BadUserRequestError("Error: No student with this admission number exists");
  }

  // 2️⃣ Check score document exists
  const alreadyHasScores = await Score.findOne({ admissionNumber: admNo });
  if (!alreadyHasScores) {
    throw new NotFoundError("Error: No scores have been registered for this student");
  }

  const sessionName = req.body.sessionName;
  const termName = req.body.term.termName;

  // 3️⃣ Find session
  const session = alreadyHasScores.scores.find(s => s.sessionName === sessionName);
  if (!session) {
    throw new BadUserRequestError("Error: Student does not have scores for this session");
  }

  // 4️⃣ Find term
  const term = session.term.find(t => t.termName === termName);
  if (!term) {
    throw new BadUserRequestError("Error: Student does not have scores for this term");
  }

  // class and programme
  const className = session.className;
  const programme = alreadyHasScores.programme;
  // check if results for the term are released
  const classmatch = await sClass.findOne({
    className,
    programme
  });
  const termInfo = classmatch?.termlyDetails.find(
    t => t.sessionName === sessionName && t.termName === termName
  );

  if (termInfo?.released === true) {
    return res.status(403).json({
      status: "failed",
      message: "Results have been released. You can no longer edit student scores."
    });
  }

  // 5️⃣ Find or add subject
  let subject = term.subjects.find(s => s.subjectName === reqSubject.subjectName);
  if (!subject) {
    // Add missing subject
    term.subjects.push({ subjectName: reqSubject.subjectName });
    subject = term.subjects.find(s => s.subjectName === reqSubject.subjectName);
  }

  // 6️⃣ Update subject scores
  subject.testScore = +reqSubject.testScore || 0;
  subject.examScore = +reqSubject.examScore || 0;
  subject.totalScore = subject.testScore + subject.examScore;
  subject.remark = reqSubject.remark || "";

  // 7️⃣ Update term comment if provided
  if (req.body.term.comment) {
    term.comment = req.body.term.comment;
  }

  // 8️⃣ THIRD TERM: cumulative calculation
  if (termName === "third") {
    const firstTerm = session.term.find(t => t.termName === "first");
    const secondTerm = session.term.find(t => t.termName === "second");

    const firstScore = firstTerm?.subjects.find(s => s.subjectName === reqSubject.subjectName)?.totalScore || 0;
    const secondScore = secondTerm?.subjects.find(s => s.subjectName === reqSubject.subjectName)?.totalScore || 0;

    let noOfTerms = 0;
    if (firstScore > 0) noOfTerms++;
    if (secondScore > 0) noOfTerms++;
    if (subject.totalScore > 0) noOfTerms++;
    // backup safety measure preventing division by zero
    if (noOfTerms === 0) {
      noOfTerms = 1;
    }

    subject.cumulativeScore = subject.totalScore + firstScore + secondScore;
    subject.cumulativeAverage = subject.cumulativeScore / noOfTerms;
  }


  // 9️⃣ Recalculate totals for term

  const assessedSubjects = term.subjects.filter(
    s => (s.testScore > 0 || s.examScore > 0)
  );
  term.grandTotal = assessedSubjects.length * 100;

  if (termName === "third") {
    term.marksObtained = assessedSubjects.reduce(
      (acc, s) => acc + (s.cumulativeAverage || 0),
      0
    );
  } else {
    term.marksObtained = assessedSubjects.reduce(
      (acc, s) => acc + (s.totalScore || 0),
      0
    );
  }

  term.avgPercentage =
    term.grandTotal > 0
      ? (term.marksObtained / term.grandTotal) * 100
      : 0;

  // 🔟 Save
  await alreadyHasScores.save();

  // 1️⃣1️⃣ Response
  return res.status(200).json({
    status: "Success",
    alreadyHasScores,
    message: `${reqSubject.subjectName} scores updated successfully`,
  });
};

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

  // 1️⃣ Get all students with scores for this class/session/term
  const scoreDocs = await Score.find({
    programme,
    scores: {
      $elemMatch: {
        sessionName,
        className,
        term: {
          $elemMatch: { termName }
        }
      }
    }
  })
    .select("admissionNumber")
    .lean();

  console.log(scoreDocs)
  if (!scoreDocs.length) {
    return res.status(404).json({
      status: "Fail",
      message: "No scores found for this class/session/term/programme"
    });
  }

  const allStudents = scoreDocs.map(s => s.admissionNumber);

  // 2️⃣ Fetch attendance document
  const attendanceDoc = await Attendance.findOne({
    className,
    programme,
    sessionName,
    termName
  }).lean();

  if (!attendanceDoc || !attendanceDoc.attendanceRecord.length) {
    return res.status(404).json({
      status: "Fail",
      message: "No attendance records found for this term"
    });
  }

  const totalDays = attendanceDoc.attendanceRecord.length;

  // 3️⃣ Initialize attendance counts for ALL students
  const attendanceCount = {};

  for (const admNo of allStudents) {
    attendanceCount[admNo] = {
      present: 0,
      absent: totalDays
    };
  }

  // 4️⃣ Process attendance records
  for (const record of attendanceDoc.attendanceRecord) {

    for (const admNo in record.attendance) {
      const present = record.attendance[admNo];

      if (!attendanceCount[admNo]) continue;

      if (present === true) {
        attendanceCount[admNo].present += 1;
        attendanceCount[admNo].absent -= 1;
      }

    }

  }

  // 5️⃣ Prepare bulk update operations
  const bulkOps = [];

  for (const admNo in attendanceCount) {
    const counts = attendanceCount[admNo];

    bulkOps.push({
      updateOne: {
        filter: {
          admissionNumber: admNo,
          scores: {
            $elemMatch: {
              sessionName,
              className,
              term: { $elemMatch: { termName } }
            }
          }
        },
        update: {
          $set: {
            "scores.$[session].term.$[term].attendancePresent": counts.present,
            "scores.$[session].term.$[term].attendanceAbsent": counts.absent
          }
        },
        arrayFilters: [
          { "session.sessionName": sessionName, "session.className": className },
          { "term.termName": termName }
        ]
      }
    });

  }

  // 6️⃣ Execute bulk update
  if (bulkOps.length) {
    await Score.bulkWrite(bulkOps);
  }

  return res.status(200).json({
    status: "Success",
    message: "Attendance updated successfully for all students"
  });
};




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


