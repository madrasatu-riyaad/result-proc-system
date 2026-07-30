const mongoose = require('mongoose')

const scoreSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Types.ObjectId,
        ref: "Student",
        required: true,
      },
    admissionNumber: String,
    student_name: String,
    programme: String,
    scores:[{
      sessionName: String,
      className: String,
      term: [{ 
        termName: String,
          subjects: [{
            subjectName: String, 
            testScore: Number, 
            examScore: Number,
            totalScore: Number, 
            firstTermScore: Number,
            secondTermScore: Number,
            cumulativeScore: Number,
            cumulativeAverage: Number,
            remark: String,
          }],
          comment: String,
          ameedComment: String,
          grandTotal:Number,
          marksObtained:Number,
          avgPercentage:Number,
          position:Number,
          attendancePresent:Number,
          attendanceAbsent:Number,
      }],
      
    }]
},
 
{
    timestamps: true
  }

)

module.exports = mongoose.model('Scores', scoreSchema)


