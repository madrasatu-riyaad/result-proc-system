const Resend = require("resend").Resend;

const resend = new Resend(process.env.RESEND_API_KEY);


// ======================
// SENDMAIL (Password reset)
// ======================
const SENDMAIL = async (email, subject, text) => {
    try {
        const htmlContent = `
            <p>Please click on the link below to reset your password:</p>
            <p><a href="${text}" target="_blank">${text}</a></p>
            <p><strong>Note:</strong> The link expires in one hour.</p>
        `;

        const response = await resend.emails.send({
            from: `Support Team at Riyad <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: htmlContent
        });

          if (response.error) {
            console.error("Email Sending Error:", response.error);
        } else {
            console.log("Reset password email sent:", response.data);
        }

    } catch (error) {
        console.log("Reset password email failed:", error);
    }
};


// ======================
// SEND NOTIFICATION TO SPERADMINS ON UNMARKED ATTENDANCE
// ======================
const SEND_NOTIFICATION_EMAIL = async (email, subject, html) => {
    try {
        const response = await resend.emails.send({
            from: `Riyad Madrasah Mgt System <support@${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: html
        });

        if (response.error) {
            console.error("Notification email error:", response.error);
        } else {
            console.log("Notification email sent:", response.data);
        }

    } catch (error) {
        console.log("Notification email failed:", error);
    }
};


// ======================
// GETMAIL (Contact form)
// ======================
const GETMAIL = async (fullname, email, phone, subject, message) => {
    try {
        const htmlContent = `
            <p>${message}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
        `;

        const response = await resend.emails.send({
            from: `${fullname} <${email}>`,
            to: process.env.EMAIL_USER,
            subject: subject,
            html: htmlContent
        });

        console.log("Email sent:", response);
    } catch (error) {
        console.log("Email not sent:", error);
    }
};


module.exports = { SENDMAIL, GETMAIL, SEND_NOTIFICATION_EMAIL };





// const nodemailer = require("nodemailer");


// const SENDMAIL = async (email, subject, text) => {
//     try {
//         let mailTransporter =
//             nodemailer.createTransport(
//                 {
//                     service: "Gmail",
//                     name: 'gmail.com',
//                     host: "smtp.gmail.com",
//                     port: 465,
//                     secure: true,
//                     auth: {
//                         user: process.env.EMAIL_USER,
//                         pass: process.env.USER_PASSWORD,
//                     }
//                 }
//             );

//         let mailDetails = {
//             from: process.env.EMAIL_USER,
//             to: email,
//             subject: subject,
//             text: `\nPlease click on the link below to reset your password \nNote that the link expires in one hour\n\n${text}`
//         };

//         mailTransporter
//             .sendMail(mailDetails,
//                 function (err, data) {
//                     if (err) {
//                         console.log('Error Occurs');
//                     } else {
//                         console.log('Email sent successfully');
//                     }
//                 });
//     } catch (error) {
//         console.log(error, "email not sent");
//     }
// };


// const GETMAIL = async (fullname, email, phone, subject, message) => {
//     try {
//         let mailTransporter =
//             nodemailer.createTransport(
//                 {
//                     service: "Gmail",
//                     name: 'gmail.com',
//                     host: "smtp.gmail.com",
//                     port: 465,
//                     secure: true,
//                     auth: {
//                         user: process.env.EMAIL_USER,
//                         pass: process.env.USER_PASSWORD,
//                     }
//                 }
//             );
//         console.log(email)
//         let mailDetails = {
//             from: {
//                 name: fullname,
//                 address: email
//             },
//             to: process.env.EMAIL_USER,
//             subject: subject,
//             text: `${message} \n\nEmail: ${email} \n\nPhone: ${phone}`
//         };

//         mailTransporter
//             .sendMail(mailDetails,
//                 function (err, data) {
//                     if (err) {
//                         console.log('Error Occurs');
//                     } else {
//                         console.log('Email sent successfully');
//                     }
//                 });
//     } catch (error) {
//         console.log(error, "email not sent");
//     }
// };

// module.exports = { SENDMAIL, GETMAIL }

