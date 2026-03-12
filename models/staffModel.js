const mongoose = require("mongoose");
require('dotenv').config();

const staffSchema = new mongoose.Schema(
  {
    stafferName: {
      type: String,
      required: true,
      trim:true,
      maxlength: 50
    },
    email: {
      type: String,
      required: [true, "email is required"],
      trim: true,
      // unique:true,
      match: /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/,
    },
    password: {
      type: String,
      trim:true,
      maxlength: 1024
    },
    gender: {
      type: String,
      required: [true, "gender cannot be empty"],
      enum: {
        values: ["male", "female"],
        message: "{VALUE} is not supported, student can either be male or female",
      },
      lowercase: true,
    },
    address: {
      type: String,
      required: true,
      trim:true,
      maxlength: 255
    },
    phoneNumber: {
      type: String,
      required: true,
      trim:true,
      maxlength: 25
    },
    teacherClass: {
      type: String,
      maxlength: 25,
      lowercase: true,
      trim: true
    },
    teacherProgramme: {
      type: String,
      maxlength: 25,
      lowercase: true,
      trim: true
    },
    role: {
      type: String,
      default: "teacher",
      lowercase: true,
      trim: true
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    signatureUrl: {
      type: String,
      trim: true,
    },
    assignedClasses: [{
      class: String,
      programme: String
    }],
    serialNo: {
      type: Number
    },
  },
  { timestamps: true }
);


const Staff = mongoose.model("Staff", staffSchema);
module.exports = Staff;