const mongoose = require('mongoose')


const classSchema = new mongoose.Schema({
    className: {
        type: String,
        trim: true,
    },
    programme: {
        type: String,
        trim: true,
    },
    subjects: [],
    termlyDetails: [{
        sessionName: String,
        termName: String,
        noInClass: {
            type: Number,
            maxlength: [3, 'please check the number you entered']
        },
        numberOfSubjects: {
            type: Number,
            min: 1
        },
        classTeacherId: {
            type: mongoose.Types.ObjectId,
            ref: "Staff",
        },
        released: {
            type: Boolean,
            default: false
        }
    }],

})

module.exports = mongoose.model('Class', classSchema)