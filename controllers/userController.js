const { MailNotSentError, BadUserRequestError, NotFoundError, UnAuthorizedError } =
    require('../middleware/errors')
require('dotenv').config();
const _ = require('lodash')
const bcrypt = require('bcrypt')
const crypto = require('crypto');
const User = require("../models/userModel");
const Staff = require("../models/staffModel");
const Student = require("../models/studentModel");
const Token = require('../models/tokenModel')

const {
    userSignUpValidator,
    userLogInValidator,
    forgotPasswordValidator,
    resetPasswordValidator,
} = require("../validators/userValidator");
const { SENDMAIL, GETMAIL } = require('../utils/mailHandler');


const userSignUp = async (req, res, next) => {
    const { error } = userSignUpValidator(req.body);
    if (error) throw error

    const user = await User.findOne({ email: req.body.email });
    if (user) throw new BadUserRequestError("Error: an account with this email already exists");

    const isStudent = await Student.findOne({ email: req.body.email });
    if (isStudent) {
        req.body.userRole = "student";
    }

    const isParent = await Student.findOne({ parentEmail: req.body.email });
    if (isParent) {
        req.body.userRole = "parent";
    }

    const isStaff = await Staff.findOne({ email: req.body.email });
    if (isStaff) {
        req.body.userRole = isStaff.role;
        req.body.isAdmin = isStaff.isAdmin;
        if (isStudent) req.body.otherRole = "student";
        if (isParent) req.body.otherRole = "parent";
    }

    const newUser = await User.create(req.body);
    const token = newUser.generateToken()
    res.header('token', token).status(201).json({
        status: "Success",
        message: "User created successfully",
        user
    });
}


const userLogIn = async (req, res, next) => {
    const { error } = userLogInValidator(req.body);
    if (error) throw error

    const user = await User.findOne({ email: req.body.email });
    if (!user) throw new UnAuthorizedError("Error: invalid email or password");

    const isValidPassword = await user.comparePassword(req.body.password)
    if (!isValidPassword) throw new UnAuthorizedError("Error: invalid email or password");

    const access_token = user.generateToken()
    res.header('access_token', access_token).status(200).json({
        status: "Success",
        message: "Successfully logged in",
        user,
        access_token: access_token
    });
}


const forgotPassword = async (req, res) => {
    const { error } = forgotPasswordValidator(req.body);
    if (error) throw error

    const user = await User.findOne({ email: req.body.email });
    if (!user) throw new BadUserRequestError("Error: invalid email!");
    let token = await Token.findOne({ userId: user._id });
    if (!token) {
        token = await new Token({
            userId: user._id,
            token: crypto.randomBytes(32).toString("hex"),
        }).save();
    }

    // const link = `${process.env.RESET_PASSWORD_PAGE}/user/password-reset/${user._id}/${token.token}`;
    const link = `${process.env.RESET_PASSWORD_PAGE}?userId=${user._id}&token=${token.token}`;
    await SENDMAIL(user.email, "Password Reset", link);

    res.status(200).send("Password reset link has been sent to your email account");
}


const resetPassword = async (req, res) => {
    const { error } = resetPasswordValidator(req.body);
    if (error) throw error

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(400).send("Invalid link");

    const token = await Token.findOne({
        userId: user._id,
        token: req.params.token,
    });
    if (!token) return res.status(400).send("Invalid link or expired");

    user.password = req.body.password;
    await user.save();
    await token.deleteOne();

    res.status(200).send("Password reset is successful, you can now log in with your new password");
}

const getUserEmail = async (req, res) => {
    const user = await User.findById(req.params.userId);
    console.log(req.params.userId);
    if (!user) return res.status(400).send("Invalid link");
    res.status(200).json({
        status: "Success",
        message: "email returned successfully",
        user
    });
}

const portalRedirect = async (req, res) => {
    let role = req.user.role;
    let other_role = req.user.other_role;
    res.status(200).json({
        status: "Success",
        message: `Successfully authenticated as ${role}`,
        role,
        other_role
    })
}

const sendMessage = async (req, res) => {
    try {
        let { fullname, email, phone, subject, message } = req.body;

        // validation
        if (!fullname || !email || !message) {
            return res.status(400).json({
                message: "Full name, email, and message are required"
            });
        }

        fullname = fullname.trim();
        email = email.trim();
        phone = phone ? phone.trim() : "";
        subject = subject ? subject.trim() : `New Message from ${fullname}`;
        message = message.trim();

        // email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email address"
            });
        }
        const success = await GETMAIL(fullname, email, phone, subject, message);
        if (!success) {
            return res.status(500).json({
                message: "Failed to send message. Please try again later."
            });
        }
        return res.status(200).json({
            message: "Message sent successfully"
        });

    } catch (error) {
        console.error("Send Message Error:", error);

        return res.status(500).json({
            message: "Server error. Please try again later."
        });
    }
};


const userAuthenticated = async (req, res) => {
    res.status(200).send("Authenticated!");
}





module.exports = { userSignUp, userLogIn, forgotPassword, resetPassword, portalRedirect, getUserEmail, sendMessage, userAuthenticated }