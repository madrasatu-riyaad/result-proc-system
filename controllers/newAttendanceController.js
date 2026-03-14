const Attendance = require("../models/newAttendanceModel");
const Staff = require("../models/staffModel");
const Student = require("../models/studentModel");
const { BadUserRequestError, NotFoundError, UnAuthorizedError } =
require('../middleware/errors');
const { Parser } = require("json2csv");


// Helper to normalize frontend date string to midnight UTC
const normalizeDate = (str) => {
    const d = new Date(str);
    d.setUTCHours(0, 0, 0, 0); // midnight UTC
    return d;
};



const markAttendance = async (req, res, next) => {
    const { className, termName, sessionName, programme, termdate } = req.query;

    // ✅ Normalize the date to midnight UTC
    const date = normalizeDate(termdate);

    // 1️⃣ Check if attendance already exists for this date
    const existingAttendance = await Attendance.findOne({
        programme,
        className,
        sessionName,
        termName,
        "attendanceRecord.termdate": date
    });

    if (existingAttendance) {
        throw new BadUserRequestError("Attendance already exists for this date");
    }

    // 2️⃣ Prepare attendance map
    const attendanceMap = {};
    req.body.forEach(student => {
        attendanceMap[student.admissionNumber] = student.presence;
    });

    // 3️⃣ Upsert attendance record
    const attendanceDoc = await Attendance.findOneAndUpdate(
        {
            programme,
            className,
            sessionName,
            termName
        },
        {
            $push: {
                attendanceRecord: {
                    termdate: date,
                    attendance: attendanceMap
                }
            }
        },
        {
            upsert: true,
            new: true
        }
    );

    // 4️⃣ Sort attendanceRecord by termdate in-memory and save
    attendanceDoc.attendanceRecord.sort((a, b) => a.termdate - b.termdate);
    await attendanceDoc.save();

    return res.status(200).json({
        status: "Success",
        message: "Attendance marked and sorted successfully",
        attendanceRecord: attendanceDoc.attendanceRecord
    });

};


const getAttendance = async (req, res, next) => {
    const { className, programme, sessionName, termName } = req.query;

    // 1️⃣ Fetch attendance document
    const attendanceDoc = await Attendance.findOne({
        className,
        programme,
        sessionName,
        termName
    }).lean();

    if (!attendanceDoc || !attendanceDoc.attendanceRecord.length) {
        return res.status(404).json({
            status: "Fail",
            message: "No attendance found for this term"
        });
    }

    // 2️⃣ Collect all admission numbers from attendance records
    const admissionNumbers = new Set();
    attendanceDoc.attendanceRecord.forEach(record => {
        Object.keys(record.attendance).forEach(admNo => admissionNumbers.add(admNo));
    });

    // console.log("Attendance document admission numbers:", Array.from(admissionNumbers));

    // 3️⃣ Fetch students from Student collection
    const studentsData = await Student.find({
        admNo: { $in: Array.from(admissionNumbers) }
    })
        .select("admNo firstName lastName")
        .lean();

    // 4️⃣ Create map: admNo -> full name
    const studentMap = {};
    studentsData.forEach(s => {
        studentMap[s.admNo] = `${s.firstName || ""} ${s.lastName || ""}`.trim();
    });

    // 5️⃣ Build attendance map: admNo -> { date: true/false }
    const attendanceMap = {};
    Array.from(admissionNumbers).forEach(admNo => {
        attendanceMap[admNo] = {};
    });

    attendanceDoc.attendanceRecord.forEach(record => {
        const dateStr = new Date(record.termdate).toDateString();
        for (const [admNo, present] of Object.entries(record.attendance)) {
            if (attendanceMap[admNo]) attendanceMap[admNo][dateStr] = present;
        }
    });

    // 6️⃣ Sorted list of term dates
    const dates = attendanceDoc.attendanceRecord
        .map(r => new Date(r.termdate).toDateString())
        .sort((a, b) => new Date(a) - new Date(b));

    // 7️⃣ Build final array of students with attendance
    const studentsWithAttendance = Array.from(admissionNumbers).map(admNo => {
        const attendanceByDate = attendanceMap[admNo];
        const totalDays = dates.length;
        const presentDays = dates.reduce(
            (count, date) => (attendanceByDate[date] === true ? count + 1 : count),
            0
        );

        return {
            admissionNumber: admNo,
            student_name: studentMap[admNo] || "Unknown", // <-- full name
            attendanceByDate,
            attendancePercentage: totalDays === 0 ? 0 : Math.round((presentDays / totalDays) * 100)
        };
    });

    return res.status(200).json({
        status: "Success",
        dates,
        students: studentsWithAttendance
    });

};


const getOneAttendance = async (req, res, next) => {
    const { sessionName, termName, admissionNumber } = req.query;
    const isStudent = await Student.findOne({ admNo: admissionNumber })

    if (req.user.role == "parent") {
        if (req.user.email != isStudent.parentEmail)
            throw new BadUserRequestError("Error: you do not have access to this report. Input your ward's admission number");
    }
    if (req.user.other_role == "parent") {
        const isSameClass = await Staff.findOne({ email: req.user.email })
        if (isSameClass.teacherClass != isStudent.presentClass && req.user.email != isStudent.parentEmail)
            throw new BadUserRequestError("Error: you do not have access to this report. Ensure you have inputted the correct admission number");
    }
    let className = isStudent.presentClass;
    let programme = isStudent.programme;

    const attendanceDoc = await Attendance.findOne({
        className,
        programme,
        sessionName,
        termName
    }).lean();

    if (!attendanceDoc) {
        return res.status(404).json({
            status: "Fail",
            message: "Attendance not found"
        });
    }

    const student_name = isStudent
        ? `${isStudent.firstName} ${isStudent.lastName}`
        : "Unknown";

    // build attendance list
    const studentAttendance = attendanceDoc.attendanceRecord.map(record => {
        return {
            termdate: new Date(record.termdate).toLocaleDateString(),
            presence: record.attendance[admissionNumber] === true ? "yes" : "no"
        };
    });

    return res.status(200).json({
        status: "Success",
        attendanceExists: {
            student_name,
            attendance: studentAttendance
        }
    });
};


const editAttendanceDate = async (req, res, next) => {
    const { className, termName, sessionName, programme, prevDate } = req.query;
    const { newDate } = req.body;

    const prevDateObj = normalizeDate(prevDate);
    const newDateObj = normalizeDate(newDate);

    // 1️⃣ Check for duplicate attendance date
    const duplicate = await Attendance.findOne({
        className,
        programme,
        termName,
        sessionName,
        "attendanceRecord.termdate": newDateObj
    });

    if (duplicate) {
        throw new BadUserRequestError("Attendance already exists for the new date");
    }

    // 2️⃣ Update termdate and sort attendanceRecord in a single update
    const result = await Attendance.findOneAndUpdate(
        {
            className,
            programme,
            termName,
            sessionName,
            "attendanceRecord.termdate": prevDateObj
        },
        {
            $set: { "attendanceRecord.$.termdate": newDateObj }
        },
        { new: true } // return updated document
    );

    if (!result) {
        return res.status(404).json({
            status: "Fail",
            message: "Attendance does not contain the date you requested to change"
        });
    }

    // 3️⃣ Sort the attendanceRecord array in-memory and save
    result.attendanceRecord.sort((a, b) => a.termdate - b.termdate);
    await result.save();

    return res.status(200).json({
        status: "Success",
        message: "Attendance date corrected and records sorted successfully",
        attendanceRecord: result.attendanceRecord
    });
};


const editAttendanceStatus = async (req, res, next) => {
    const { termName, sessionName, className, programme, admissionNumber } = req.query;
    const { termdate } = req.body;
    console.log(termdate)
    // ✅ Normalize the frontend date string to UTC midnight
    const date = normalizeDate(termdate);
    console.log(date)

    // 1️⃣ Admin role check
    if (req.user.role === "admin") {
        const isValidStaff = await Staff.findOne({ email: req.user.email });
        if (!isValidStaff) {
            throw new UnAuthorizedError("Error: Staff not found");
        }
        if (isValidStaff.teacherProgramme !== programme) {
            throw new UnAuthorizedError(
                "Error: You cannot edit attendance for students of other programmes"
            );
        }
    }

    // 2️⃣ Get current attendance status
    const record = await Attendance.findOne(
        {
            className,
            programme,
            sessionName,
            termName,
            "attendanceRecord.termdate": date
        },
        { "attendanceRecord.$": 1 }
    ).lean();

    if (!record || !record.attendanceRecord || record.attendanceRecord.length === 0) {
        throw new NotFoundError("Error: Attendance record not found");
    }

    const currentStatus =
        record.attendanceRecord[0].attendance[admissionNumber] || false;

    // 3️⃣ Toggle status
    const newStatus = !currentStatus;

    await Attendance.updateOne(
        {
            className,
            programme,
            sessionName,
            termName,
            "attendanceRecord.termdate": date
        },
        {
            $set: {
                [`attendanceRecord.$.attendance.${admissionNumber}`]: newStatus
            }
        }
    );

    return res.status(200).json({
        status: "Success",
        message: "Attendance status updated",
        newStatus
    });
};


const deleteDayAttendance = async (req, res, next) => {
    const { className, termName, sessionName, programme, termdate } = req.query;

    const date = normalizeDate(termdate);

    // 1️⃣ Admin role check
    if (req.user.role === "admin") {
        const isValidStaff = await Staff.findOne({ email: req.user.email });

        if (!isValidStaff) {
            throw new UnAuthorizedError("Error: Staff not found");
        }

        if (isValidStaff.teacherProgramme !== programme) {
            throw new UnAuthorizedError(
                "Error: You are not allowed to delete attendance for students of other programmes"
            );
        }
    }

    // 2️⃣ Check if attendance exists for that date
    const attendanceExists = await Attendance.findOne({
        className,
        programme,
        termName,
        sessionName,
        "attendanceRecord.termdate": date
    });

    if (!attendanceExists) {
        return res.status(404).json({
            status: "Fail",
            message: "No attendance record found for the specified date"
        });
    }

    // 3️⃣ Delete it
    await Attendance.updateOne(
        { className, programme, termName, sessionName },
        { $pull: { attendanceRecord: { termdate: date } } }
    );

    return res.status(200).json({
        status: "Success",
        message: `Attendance for ${termdate} deleted successfully`
    });
};



// const deleteTermAttendance = async (req, res, next) => {
//     const { termName, sessionName, programme, className } = req.query;
    
//     // 1️⃣ Admin role check
//     if (req.user.role === "admin") {
//         const isValidStaff = await Staff.findOne({ email: req.user.email });
//         if (!isValidStaff || isValidStaff.teacherProgramme !== programme) {
//             throw new UnAuthorizedError(
//                 "Error: You are not allowed to delete attendance for students of other programmes"
//             );
//         }
//     }

//     // 2️⃣ Fetch all attendance records for this class/programme/term/session
//     const attendanceDocs = await Attendance.find({
//         termName,
//         sessionName,
//         programme,
//         className
//     }).lean();

//     if (attendanceDocs.length === 0) {
//   return res.status(404).json({
//     status: "Fail",
//     message: "No attendance records found for this class/session/term/programme"
//   });
// }
//     // 3️⃣ Collect all unique student admission numbers
//     const studentSet = new Set();
//     attendanceDocs.forEach(doc => {
//         doc.attendanceRecord.forEach(record => {
//             Object.keys(record.attendance).forEach(admNo => studentSet.add(admNo));
//         });
//     });
//     const students = Array.from(studentSet).sort(); // sorted admission numbers
    
//     // 4️⃣ Prepare CSV rows (one row per date)
//     const csvRows = [];
//     // assuming attendance per class per date is unique, merge all docs
//     const dateMap = {}; // { dateString: { admNo: Present/Absent } }

//     attendanceDocs.forEach(doc => {
//         doc.attendanceRecord.forEach(record => {
//             const dateStr = normalizeDate(record.termdate).toISOString().split("T")[0]; // YYYY-MM-DD
//             if (!dateMap[dateStr]) dateMap[dateStr] = {};
//             Object.entries(record.attendance).forEach(([admNo, present]) => {
//                 dateMap[dateStr][admNo] = present ? "Present" : "Absent";
//             });
//         });
//     }); 

//     Object.entries(dateMap).forEach(([dateStr, attendanceMap]) => {
//         const row = { Date: dateStr };
//         students.forEach(admNo => {
//             row[admNo] = attendanceMap[admNo] || "Absent";
//         });
//         csvRows.push(row);
//     });

//     // 5️⃣ Convert rows to CSV
//     const parser = new Parser({ fields: ["Date", ...students] });
//     const csv = parser.parse(csvRows);

//     // 6️⃣ Set headers for browser download
//     const fileName = `AttendanceBackup_${className}_${programme}_${sessionName}_${termName}.csv`.replace(/\s+/g, "_");
//     res.setHeader("Content-Type", "text/csv");
//     res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
//     res.setHeader("X-Filename", fileName);

//     // 7️⃣ Delete attendance records after generating CSV
//     await Attendance.deleteMany({
//         className,
//         programme,
//         sessionName,
//         termName
//     });

//     // 8️⃣ Send CSV to browser
//     return res.send(csv);
// };


const deleteTermAttendance = async (req, res, next) => {
  const { termName, sessionName, programme, className } = req.query;

  // 1️⃣ Admin permission check
  if (req.user.role === "admin") {
    const isValidStaff = await Staff.findOne({ email: req.user.email });

    if (!isValidStaff || isValidStaff.teacherProgramme !== programme) {
      throw new UnAuthorizedError(
        "Error: You are not allowed to delete attendance for students of other programmes"
      );
    }
  }

  // 2️⃣ Fetch attendance documents
  const attendanceDocs = await Attendance.find({
    termName: termName.trim(),
    sessionName: sessionName.trim(),
    programme: programme.trim(),
    className: className.trim(),
  }).lean();

  if (!attendanceDocs || attendanceDocs.length === 0) {
    return res.status(404).json({
      status: "Fail",
      message:
        "No attendance records found for the specified class/session/term/programme",
    });
  }

  // 3️⃣ Collect students and attendance
  const students = new Set();
  const dateMap = {};

  attendanceDocs.forEach((doc) => {
    if (!doc.attendanceRecord) return;

    doc.attendanceRecord.forEach((record) => {
      const date = new Date(record.termdate)
        .toISOString()
        .split("T")[0];

      if (!dateMap[date]) dateMap[date] = {};

      Object.entries(record.attendance || {}).forEach(([admNo, present]) => {
        students.add(admNo);
        dateMap[date][admNo] = present ? "Present" : "Absent";
      });
    });
  });

  const studentList = Array.from(students).sort();

  if (studentList.length === 0) {
    return res.status(404).json({
      status: "Fail",
      message: "Attendance records contain no student data",
    });
  }

  if (Object.keys(dateMap).length === 0) {
    return res.status(404).json({
      status: "Fail",
      message: "Attendance records contain no dates",
    });
  }

  // 4️⃣ Build CSV rows
  const rows = [];

  Object.keys(dateMap)
    .sort()
    .forEach((date) => {
      const row = { Date: date };

      studentList.forEach((admNo) => {
        row[admNo] = dateMap[date][admNo] || "Absent";
      });

      rows.push(row);
    });

  // 5️⃣ Convert to CSV
  const { Parser } = require("json2csv");
  const parser = new Parser({ fields: ["Date", ...studentList] });
  const csv = parser.parse(rows);

  // 6️⃣ Prepare download
  const fileName = `AttendanceBackup_${className}_${programme}_${sessionName}_${termName}.csv`
    .replace(/\s+/g, "_");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("X-Filename", fileName);

  // 7️⃣ Delete attendance after backup
  await Attendance.deleteMany({
    termName,
    sessionName,
    programme,
    className,
  });

  // 8️⃣ Send CSV
  return res.send(csv);
};




module.exports = { markAttendance, getAttendance, getOneAttendance, editAttendanceDate, editAttendanceStatus, deleteDayAttendance, deleteTermAttendance }